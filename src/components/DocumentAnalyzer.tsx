import React, { useState, useEffect, useCallback, useRef } from 'react';
import Markdown from 'react-markdown';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, getAuthHeaders, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  FileUp,
  FileText,
  Sparkles,
  Download,
  Trash2,
  GraduationCap,
  HelpCircle,
  AlertTriangle,
  BookOpen,
} from 'lucide-react';

interface DocumentAnalysisResult {
  title: string;
  summary: string;
  keyConcepts: Array<{ heading: string; detail: string }>;
  difficultSections: Array<{ section: string; explanation: string; analogy?: string }>;
  studyNotesMarkdown: string;
  revisionQuestions: Array<{ question: string; hint: string; keyPoints: string }>;
}

interface SavedDocumentRecord {
  id: string;
  fileName: string;
  mimeType: string;
  action: string;
  analysis: DocumentAnalysisResult;
}

interface DocumentAnalyzerProps {
  language: 'en' | 'sw';
  studyLevel: string;
  onTeachFromDocument: (topicTitle: string, summaryNotes: string) => void;
}

const SUPPORTED_MIMES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export const DocumentAnalyzer: React.FC<DocumentAnalyzerProps> = ({
  language,
  studyLevel,
  onTeachFromDocument,
}) => {
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    mimeType: string;
    sizeBytes: number;
    base64: string;
  } | null>(null);
  const [action, setAction] = useState<'full' | 'summarize' | 'concepts' | 'explain' | 'notes' | 'questions'>('full');
  const [focusPrompt, setFocusPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentAnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'concepts' | 'difficult' | 'notes' | 'questions'>('summary');
  const [savedDocs, setSavedDocs] = useState<SavedDocumentRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSavedDocuments = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(
        collection(db, 'documents'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(12)
      );
      const snap = await getDocs(q);
      setSavedDocs(
        snap.docs.map((d) => ({
          id: d.id,
          fileName: String(d.data().fileName || 'Document'),
          mimeType: String(d.data().mimeType || 'application/pdf'),
          action: String(d.data().action || 'full'),
          analysis: d.data().analysis as DocumentAnalysisResult,
        }))
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'documents');
    }
  }, []);

  useEffect(() => {
    loadSavedDocuments();
  }, [loadSavedDocuments]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!SUPPORTED_MIMES.has(file.type)) {
      setError('Supported formats: PDF, TXT, MD, CSV, PNG, JPEG, WEBP.');
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setError('Please upload documents up to 4MB for reliable serverless processing.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result || '');
      const base64 = dataUrl.split(',')[1] || '';
      setSelectedFile({
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        base64,
      });
    };
    reader.onerror = () => setError('Failed to read selected file.');
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!selectedFile || isAnalyzing) return;
    if (!auth.currentUser) {
      setError('Please sign in to analyze documents with TutorNode AI.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();

      // Try Vercel Blob upload optionally if configured; fall back cleanly to inline payload
      let blobUrl: string | undefined;
      try {
        const upResp = await fetch('/api/upload-document', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            fileName: selectedFile.name,
            mimeType: selectedFile.mimeType,
            base64Data: selectedFile.base64,
          }),
        });
        if (upResp.ok) {
          const upJson = await upResp.json();
          blobUrl = upJson.url;
        }
      } catch {
        // Inline analysis fallback when Blob token is not configured
      }

      const resp = await fetch('/api/analyze-document', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileData: blobUrl ? undefined : { mimeType: selectedFile.mimeType, data: selectedFile.base64 },
          blobUrl,
          action,
          language,
          studyLevel,
          focusPrompt: focusPrompt.trim(),
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `Document analysis failed (${resp.status}).`);
      }

      setResult(data as DocumentAnalysisResult);
      setActiveTab('summary');

      try {
        await addDoc(collection(db, 'documents'), {
          userId: auth.currentUser.uid,
          fileName: selectedFile.name.slice(0, 255),
          mimeType: selectedFile.mimeType.slice(0, 100),
          sizeBytes: selectedFile.sizeBytes,
          ...(blobUrl ? { blobUrl } : {}),
          action,
          analysis: data,
          createdAt: serverTimestamp(),
        });
        loadSavedDocuments();
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'documents');
      }
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Unable to analyze document.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownloadNotes = () => {
    if (!result) return;
    const md = `# ${result.title}\n\n## Summary\n${result.summary}\n\n## Study Notes\n${result.studyNotesMarkdown}\n\n## Revision Questions\n${result.revisionQuestions
      .map((q, i) => `${i + 1}. **${q.question}**\n   - Hint: ${q.hint}\n   - Key Points: ${q.keyPoints}`)
      .join('\n\n')}`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(result.title || 'study-notes').replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteSaved = async (docId: string) => {
    try {
      await deleteDoc(doc(db, 'documents', docId));
      setSavedDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `documents/${docId}`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-5 sm:p-7 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
              <FileText className="text-blue-400" size={22} />
              Document Study &amp; Analysis
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Upload handouts, lecture slides, notes, or papers to summarize, simplify difficult sections, and generate study notes or revision questions.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"
            onChange={handleFilePick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-bold text-white flex items-center gap-2"
          >
            <FileUp size={15} />
            {selectedFile ? 'Change Document' : 'Upload Document'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as typeof action)}
            className="bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="full">Complete Study Pack (All Sections)</option>
            <option value="summarize">Summarize Document</option>
            <option value="concepts">Extract Key Concepts</option>
            <option value="explain">Explain Difficult Sections</option>
            <option value="notes">Convert into Study Notes</option>
            <option value="questions">Generate Revision Questions</option>
          </select>

          <input
            type="text"
            value={focusPrompt}
            onChange={(e) => setFocusPrompt(e.target.value)}
            placeholder="Optional focus (e.g., Focus on Chapter 3 derivations)"
            className="bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!selectedFile || isAnalyzing}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <Sparkles size={14} />
            {isAnalyzing
              ? 'Analyzing Document...'
              : selectedFile
              ? `Analyze ${selectedFile.name.slice(0, 20)}`
              : 'Select a File First'}
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-500/30 text-xs text-red-200 flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {result && (
        <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <h3 className="text-lg font-bold text-white">{result.title}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onTeachFromDocument(result.title, result.studyNotesMarkdown)}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <GraduationCap size={14} /> Teach on Smartboard
              </button>
              <button
                type="button"
                onClick={handleDownloadNotes}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5"
              >
                <Download size={14} /> Export Notes (.md)
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 bg-slate-950/70 p-1 rounded-xl border border-white/10">
            {(
              [
                ['summary', 'Summary'],
                ['concepts', 'Key Concepts'],
                ['difficult', 'Difficult Sections'],
                ['notes', 'Study Notes'],
                ['questions', 'Revision Questions'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'summary' && (
            <div className="prose prose-invert prose-sm max-w-none leading-relaxed">
              <Markdown>{result.summary}</Markdown>
            </div>
          )}

          {activeTab === 'concepts' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {result.keyConcepts?.map((c, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-slate-950/60 border border-white/10">
                  <h4 className="text-sm font-bold text-blue-300">{c.heading}</h4>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{c.detail}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'difficult' && (
            <div className="space-y-3">
              {result.difficultSections?.map((sec, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-2">
                  <h4 className="text-sm font-bold text-amber-300">{sec.section}</h4>
                  <p className="text-xs text-slate-200 leading-relaxed">{sec.explanation}</p>
                  {sec.analogy && (
                    <p className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-2.5">
                      Simple Analogy: {sec.analogy}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="prose prose-invert prose-sm max-w-none bg-slate-950/60 border border-white/10 rounded-2xl p-5">
              <Markdown>{result.studyNotesMarkdown}</Markdown>
            </div>
          )}

          {activeTab === 'questions' && (
            <div className="space-y-3">
              {result.revisionQuestions?.map((rq, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-1.5">
                  <div className="text-sm font-bold text-white flex items-start gap-2">
                    <HelpCircle size={15} className="text-sky-400 shrink-0 mt-0.5" />
                    <span>
                      {idx + 1}. {rq.question}
                    </span>
                  </div>
                  <p className="text-xs text-amber-300">Hint: {rq.hint}</p>
                  <p className="text-xs text-slate-300">Expected Key Points: {rq.keyPoints}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {savedDocs.length > 0 && (
        <div className="bg-slate-900/70 border border-white/10 rounded-3xl p-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <BookOpen size={14} /> Saved Document Analyses
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedDocs.map((d) => (
              <div
                key={d.id}
                className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10 flex items-center justify-between gap-2"
              >
                <button
                  type="button"
                  onClick={() => {
                    setResult(d.analysis);
                    setActiveTab('summary');
                  }}
                  className="text-left min-w-0 flex-1"
                >
                  <div className="text-xs font-bold text-white truncate">{d.analysis?.title || d.fileName}</div>
                  <div className="text-[11px] text-slate-400 truncate">{d.fileName}</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSaved(d.id)}
                  aria-label="Delete saved document"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
