import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Mic,
  MicOff,
  FileUp,
  BookOpen,
  ClipboardCheck,
  X,
  Share2,
  Copy,
  Check,
  SlidersHorizontal,
} from 'lucide-react';

export interface StructuredLessonRequest {
  subject: string;
  topic: string;
  educationLevel: string;
  learningObjectives: string;
  preferredLength: 'short' | 'standard' | 'deep';
  additionalInstructions: string;
}

interface LessonControlsProps {
  language: 'en' | 'sw';
  studentInput: string;
  onStudentInputChange: (val: string) => void;
  studyLevel: string;
  isLoading: boolean;
  isListening: boolean;
  onToggleVoice: () => void;
  onQuickLearn: (topicText: string) => void;
  onStructuredLearn: (req: StructuredLessonRequest) => void;
  // Supporting material attachment
  fileName: string | null;
  onUploadStudyFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearStudyFile: () => void;
  // Exam paper revision
  examFileName: string | null;
  hasExamFile: boolean;
  isProcessingExam: boolean;
  onUploadExamFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearExamFile: () => void;
  onStartExamRevision: () => void;
  onShareExam: () => void;
  isExamSharing: boolean;
  shareExamUrl: string | null;
}

export const LessonControls: React.FC<LessonControlsProps> = ({
  language,
  studentInput,
  onStudentInputChange,
  studyLevel,
  isLoading,
  isListening,
  onToggleVoice,
  onQuickLearn,
  onStructuredLearn,
  fileName,
  onUploadStudyFile,
  onClearStudyFile,
  examFileName,
  hasExamFile,
  isProcessingExam,
  onUploadExamFile,
  onClearExamFile,
  onStartExamRevision,
  onShareExam,
  isExamSharing,
  shareExamUrl,
}) => {
  const [mode, setMode] = useState<'quick' | 'structured' | 'exam'>('quick');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [educationLevel, setEducationLevel] = useState(studyLevel || 'Undergraduate');
  const [learningObjectives, setLearningObjectives] = useState('');
  const [preferredLength, setPreferredLength] = useState<'short' | 'standard' | 'deep'>('standard');
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [copiedShare, setCopiedShare] = useState(false);

  const studyFileRef = useRef<HTMLInputElement>(null);
  const examFileRef = useRef<HTMLInputElement>(null);

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentInput.trim() || isLoading) return;
    onQuickLearn(studentInput.trim());
  };

  const handleStructuredSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || isLoading) return;
    onStructuredLearn({
      subject: subject.trim(),
      topic: topic.trim(),
      educationLevel,
      learningObjectives: learningObjectives.trim(),
      preferredLength,
      additionalInstructions: additionalInstructions.trim(),
    });
  };

  const copyShareUrl = () => {
    if (!shareExamUrl) return;
    navigator.clipboard?.writeText(shareExamUrl);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  return (
    <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl">
      {/* Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center bg-slate-950/70 p-1 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setMode('quick')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              mode === 'quick' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
            }`}
          >
            <BookOpen size={13} />
            <span>{language === 'sw' ? 'Mada ya Haraka' : 'Quick Topic'}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('structured')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              mode === 'structured' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
            }`}
          >
            <SlidersHorizontal size={13} />
            <span>{language === 'sw' ? 'Mpangilio wa Somo' : 'Lesson Builder'}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('exam')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              mode === 'exam' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
            }`}
          >
            <ClipboardCheck size={13} />
            <span>{language === 'sw' ? 'Mapitio ya Mtihani' : 'Exam Revision'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={studyFileRef}
            type="file"
            accept=".pdf,.txt,.md,.csv"
            onChange={onUploadStudyFile}
            className="hidden"
          />
          {fileName ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-xs text-blue-200">
              <span className="max-w-[140px] truncate">{fileName}</span>
              <button type="button" onClick={onClearStudyFile} aria-label="Remove attached textbook">
                <X size={12} />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => studyFileRef.current?.click()}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
            >
              <FileUp size={13} />
              <span>{language === 'sw' ? 'Ambatisha Kitabu' : 'Attach Notes (PDF/TXT)'}</span>
            </button>
          )}
        </div>
      </div>

      {mode === 'quick' && (
        <form onSubmit={handleQuickSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="flex-1 flex items-center bg-slate-950/80 border border-white/10 focus-within:border-blue-500 rounded-2xl px-3.5 py-1.5 gap-2">
            <input
              type="text"
              value={studentInput}
              onChange={(e) => onStudentInputChange(e.target.value)}
              placeholder={
                language === 'sw'
                  ? 'Andika mada unayotaka kujifunza leo...'
                  : 'Enter any topic, formula, or concept you want to master...'
              }
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none py-2 min-w-0"
            />
            <button
              type="button"
              onClick={onToggleVoice}
              aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
              className={`p-2 rounded-xl transition-colors ${
                isListening
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-white/5 hover:bg-white/10 text-slate-300'
              }`}
              title="Voice Input"
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          </div>
          <button
            type="submit"
            disabled={!studentInput.trim() || isLoading}
            className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shrink-0"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            <span>{language === 'sw' ? 'Anza Somo' : 'Teach Lesson'}</span>
          </button>
        </form>
      )}

      {mode === 'structured' && (
        <form onSubmit={handleStructuredSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (e.g., Mechanical Engineering)"
            className="bg-slate-950/80 border border-white/10 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic (e.g., Single Plate Friction Clutches) *"
            required
            className="bg-slate-950/80 border border-white/10 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
          <select
            value={educationLevel}
            onChange={(e) => setEducationLevel(e.target.value)}
            className="bg-slate-950/80 border border-white/10 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none"
          >
            <option value="High School">High School / Secondary</option>
            <option value="Diploma / TVET">Diploma / TVET Technical</option>
            <option value="Undergraduate">Undergraduate</option>
            <option value="Postgraduate">Postgraduate / Research</option>
          </select>
          <input
            type="text"
            value={learningObjectives}
            onChange={(e) => setLearningObjectives(e.target.value)}
            placeholder="Learning objectives (optional)"
            className="sm:col-span-2 bg-slate-950/80 border border-white/10 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
          <select
            value={preferredLength}
            onChange={(e) => setPreferredLength(e.target.value as 'short' | 'standard' | 'deep')}
            className="bg-slate-950/80 border border-white/10 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none"
          >
            <option value="short">Short Lesson (4 slides)</option>
            <option value="standard">Standard Lesson (6 slides)</option>
            <option value="deep">Deep Mastery (8 slides)</option>
          </select>
          <input
            type="text"
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value)}
            placeholder="Additional instructions (e.g., focus on worked calculations)"
            className="sm:col-span-2 bg-slate-950/80 border border-white/10 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!topic.trim() || isLoading}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <Sparkles size={14} />
            <span>{isLoading ? 'Generating...' : 'Generate Structured Lesson'}</span>
          </button>
        </form>
      )}

      {mode === 'exam' && (
        <div className="space-y-3">
          <input
            ref={examFileRef}
            type="file"
            accept=".pdf,.txt,.md,.csv"
            onChange={onUploadExamFile}
            className="hidden"
          />
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950/60 border border-emerald-500/25 rounded-2xl p-4">
            <div className="space-y-1 min-w-0">
              <div className="text-sm font-bold text-white truncate">
                {examFileName ? `Loaded Exam Paper: ${examFileName}` : 'Upload Past Examination Paper (PDF, TXT, MD)'}
              </div>
              <p className="text-xs text-slate-400">
                Mwalimu studies every question in the paper, builds a concept roadmap, teaches fundamentals first, and guides you step-by-step.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => examFileRef.current?.click()}
                disabled={isProcessingExam}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1.5"
              >
                <FileUp size={14} />
                {isProcessingExam ? 'Reading...' : examFileName ? 'Replace Paper' : 'Select Paper'}
              </button>
              {hasExamFile && (
                <>
                  <button
                    type="button"
                    onClick={onStartExamRevision}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1.5"
                  >
                    <ClipboardCheck size={14} />
                    {isLoading ? 'Preparing Revision...' : 'Start Guided Revision'}
                  </button>
                  <button
                    type="button"
                    onClick={onShareExam}
                    disabled={isExamSharing}
                    className="px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-xs font-semibold text-blue-200 flex items-center gap-1.5"
                  >
                    <Share2 size={13} />
                    {isExamSharing ? 'Sharing...' : 'Share'}
                  </button>
                  <button
                    type="button"
                    onClick={onClearExamFile}
                    aria-label="Clear exam paper"
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          </div>

          {shareExamUrl && (
            <div className="flex items-center justify-between gap-2 bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs">
              <span className="truncate text-blue-300 font-mono">{shareExamUrl}</span>
              <button
                type="button"
                onClick={copyShareUrl}
                className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold flex items-center gap-1 shrink-0"
              >
                {copiedShare ? <Check size={12} /> : <Copy size={12} />}
                {copiedShare ? 'Copied' : 'Copy Link'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
