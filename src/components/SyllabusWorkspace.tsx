import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { PRELOADED_SYLLABI, ensureSyllabusCompatibility, Syllabus } from '../lib/syllabusData';
import {
  BookOpen,
  Sparkles,
  FileUp,
  Share2,
  Trash2,
  PlayCircle,
  Check,
  Copy,
  AlertTriangle,
} from 'lucide-react';

interface SyllabusWorkspaceProps {
  mode: 'curriculum' | 'syllabus';
  language: 'en' | 'sw';
  studyLevel: string;
  activeSyllabus: Syllabus | null;
  onSelectSyllabus: (syl: Syllabus) => void;
  onTeachTopic: (
    topicTitle: string,
    context?: { syllabusTitle: string; chapterTitle: string; topicTitle: string; topicDescription: string }
  ) => void;
}

export const SyllabusWorkspace: React.FC<SyllabusWorkspaceProps> = ({
  mode,
  language,
  studyLevel,
  activeSyllabus,
  onSelectSyllabus,
  onTeachTopic,
}) => {
  const [subjectInput, setSubjectInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [savedSyllabi, setSavedSyllabi] = useState<Syllabus[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSavedSyllabi = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(
        collection(db, 'syllabi'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const snap = await getDocs(q);
      setSavedSyllabi(
        snap.docs.map((d) =>
          ensureSyllabusCompatibility({
            id: d.id,
            ...d.data(),
          })
        )
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'syllabi');
    }
  }, []);

  useEffect(() => {
    loadSavedSyllabi();
  }, [loadSavedSyllabi]);

  const saveSyllabusToCloud = async (syl: Syllabus): Promise<Syllabus> => {
    const normalized = ensureSyllabusCompatibility(syl);
    if (!auth.currentUser) return normalized;

    try {
      const payload = {
        userId: auth.currentUser.uid,
        title: String(normalized.title || 'Course Syllabus').slice(0, 200),
        description: String(normalized.description || '').slice(0, 1500),
        chapters: Array.isArray(normalized.chapters) ? normalized.chapters.slice(0, 50) : [],
        modules: Array.isArray(normalized.modules) ? normalized.modules.slice(0, 20) : [],
        isPublic: false,
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'syllabi'), payload);
      return { ...normalized, id: ref.id };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'syllabi');
      return normalized;
    }
  };

  const handleGenerateSyllabus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectInput.trim() || isGenerating) return;
    if (!auth.currentUser) {
      setError('Please sign in to generate a custom syllabus.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/generate-syllabus', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          subject: subjectInput.trim(),
          language,
          studyLevel,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `Syllabus generation failed (${resp.status}).`);
      }

      const saved = await saveSyllabusToCloud(data);
      onSelectSyllabus(saved);
      setSubjectInput('');
      loadSavedSyllabi();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Unable to generate syllabus.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUploadSyllabusFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!auth.currentUser) {
      setError('Please sign in to extract a syllabus from a document.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('Please upload a syllabus file under 4MB.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const base64 = String(ev.target?.result || '').split(',')[1] || '';
        const headers = await getAuthHeaders();
        const resp = await fetch('/api/generate-syllabus-from-file', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            fileData: { mimeType: file.type || 'application/pdf', data: base64 },
            language,
            studyLevel,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data.error || `Extraction failed (${resp.status}).`);
        }

        const saved = await saveSyllabusToCloud(data);
        onSelectSyllabus(saved);
        loadSavedSyllabi();
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to parse syllabus document.');
      } finally {
        setIsGenerating(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleShareSyllabus = async () => {
    if (!activeSyllabus || !auth.currentUser) return;
    try {
      let id = activeSyllabus.id;
      if (!id) {
        const saved = await saveSyllabusToCloud(activeSyllabus);
        id = saved.id;
        onSelectSyllabus(saved);
      }
      if (id) {
        setShareUrl(`${window.location.origin}?syllabus=${id}`);
      }
    } catch {
      setError('Unable to generate share link.');
    }
  };

  const handleDeleteSyllabus = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'syllabi', id));
      setSavedSyllabi((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `syllabi/${id}`);
    }
  };

  const builtInList = Object.entries(PRELOADED_SYLLABI).map(([key, syl]) => ({
    key,
    ...ensureSyllabusCompatibility(syl),
  }));

  const displaySyllabus = activeSyllabus
    ? ensureSyllabusCompatibility(activeSyllabus)
    : builtInList[0];

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {mode === 'syllabus' && (
        <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-white">Course Syllabus Builder</h2>
              <p className="text-xs text-slate-400">
                Generate a complete structured course roadmap or extract one from a PDF/text syllabus.
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.csv"
                onChange={handleUploadSyllabusFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isGenerating}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1.5"
              >
                <FileUp size={14} /> Import PDF Syllabus
              </button>
            </div>
          </div>

          <form onSubmit={handleGenerateSyllabus} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={subjectInput}
              onChange={(e) => setSubjectInput(e.target.value)}
              placeholder="Enter course title (e.g., Thermodynamics II, Organic Chemistry, Data Structures)"
              className="flex-1 bg-slate-950 border border-white/10 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!subjectInput.trim() || isGenerating}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shrink-0"
            >
              <Sparkles size={14} />
              {isGenerating ? 'Building...' : 'Build Syllabus'}
            </button>
          </form>

          {error && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/30 text-xs text-red-200 flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Course Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(mode === 'curriculum' ? builtInList : [...savedSyllabi, ...builtInList]).map((syl, idx) => {
          const isActive = displaySyllabus?.title === syl.title;
          return (
            <div
              key={syl.id || syl.key || idx}
              className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-2 ${
                isActive
                  ? 'bg-blue-600/15 border-blue-500 text-white'
                  : 'bg-slate-900/80 border-white/10 text-slate-300 hover:border-white/25'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectSyllabus(syl)}
                className="text-left flex-1 min-w-0"
              >
                <div className="text-sm font-bold text-white truncate">{syl.title}</div>
                <p className="text-xs text-slate-400 line-clamp-2 mt-1">{syl.description}</p>
              </button>
              {syl.id && (
                <button
                  type="button"
                  onClick={() => handleDeleteSyllabus(syl.id!)}
                  aria-label="Delete saved syllabus"
                  className="p-1.5 text-slate-500 hover:text-red-400 shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Active Syllabus Outline */}
      {displaySyllabus && (
        <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <BookOpen size={18} className="text-blue-400" />
                {displaySyllabus.title}
              </h3>
              <p className="text-xs text-slate-400 mt-1">{displaySyllabus.description}</p>
            </div>
            {auth.currentUser && (
              <button
                type="button"
                onClick={handleShareSyllabus}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1.5"
              >
                <Share2 size={13} /> Share Syllabus
              </button>
            )}
          </div>

          {shareUrl && (
            <div className="flex items-center justify-between gap-2 bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs">
              <span className="truncate text-blue-300 font-mono">{shareUrl}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(shareUrl);
                  setCopiedShare(true);
                  setTimeout(() => setCopiedShare(false), 2000);
                }}
                className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold flex items-center gap-1 shrink-0"
              >
                {copiedShare ? <Check size={12} /> : <Copy size={12} />}
                {copiedShare ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          <div className="space-y-4">
            {displaySyllabus.chapters?.map((ch: any, cIdx: number) => (
              <div key={cIdx} className="bg-slate-950/60 border border-white/10 rounded-2xl p-4 space-y-3">
                <h4 className="text-sm font-bold text-sky-300">{ch.title}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {ch.topics?.map((tp: any, tIdx: number) => (
                    <div
                      key={tIdx}
                      className="p-3.5 rounded-xl bg-slate-900/90 border border-white/5 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white">{tp.title}</div>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{tp.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onTeachTopic(tp.title, {
                            syllabusTitle: displaySyllabus.title,
                            chapterTitle: ch.title,
                            topicTitle: tp.title,
                            topicDescription: tp.description || '',
                          })
                        }
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 shrink-0"
                      >
                        <PlayCircle size={13} /> Teach
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
