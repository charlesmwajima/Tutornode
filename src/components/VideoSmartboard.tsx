import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { TEACHER_CHARACTERS, TeacherCharacter } from '../lib/characters';
import { InteractiveDiagram } from './InteractiveDiagram';
import { auth, db, getAuthHeaders, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  BookOpen,
  Video,
  FileText,
  Play,
  Pause,
  Maximize2,
  Minimize2,
  Hand,
  Brain,
  Download,
  Captions,
  Film,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

export interface StructuredLessonData {
  title?: string;
  introduction?: string;
  learningObjectives?: string[];
  coreExplanations?: string[];
  workedExamples?: string[];
  keyDefinitions?: Array<{ term: string; definition: string }>;
  practiceActivities?: string[];
  summary?: string;
  revisionQuestions?: string[];
}

export interface LessonSegment {
  content: string;
  speech: string;
  diagram_svg_code?: string;
  diagram_title?: string;
  diagram_url?: string;
}

interface StoryboardScene {
  index: number;
  title: string;
  boardMarkdown: string;
  narration: string;
  visualCue?: string;
  startSec: number;
  endSec: number;
  durationSec: number;
}

interface StoryboardData {
  topic: string;
  totalDurationSec: number;
  scenes: StoryboardScene[];
  webvtt: string;
}

interface VideoSmartboardProps {
  currentTopic: string;
  isPlaying: boolean;
  currentSlideIndex: number;
  slidesCount: number;
  currentSlideContent: string;
  whiteboardNotes: string;
  lessonSegments: LessonSegment[];
  structuredLesson?: StructuredLessonData | null;
  teacherDialogue: string;
  showSubtitles?: boolean;
  onTogglePlay: (play: boolean) => void;
  diagramUrl?: string | null;
  diagramSvg?: string | null;
  isCinematicMode?: boolean;
  onExitCinematic?: () => void;
  onHighlightAsk?: (text: string) => void;
  onQuizStart?: () => void;
  language?: 'en' | 'sw';
  teachingMode?: 'text' | 'structured' | 'video';
  onTeachingModeChange?: (mode: 'text' | 'structured' | 'video') => void;
  selectedTeacher?: TeacherCharacter;
  onSelectTeacher?: (character: TeacherCharacter) => void;
  classTargetDuration?: number;
  videoComingSoon?: boolean;
  teachingTechnique?: {
    id: string;
    name: string;
    subtitle: string;
    color: string;
  } | null;
}

export const VideoSmartboard: React.FC<VideoSmartboardProps> = ({
  currentTopic,
  isPlaying,
  currentSlideIndex,
  slidesCount,
  currentSlideContent,
  whiteboardNotes,
  lessonSegments,
  structuredLesson,
  teacherDialogue,
  showSubtitles,
  onTogglePlay,
  diagramUrl,
  diagramSvg,
  isCinematicMode,
  onExitCinematic,
  onHighlightAsk,
  onQuizStart,
  language = 'en',
  teachingMode = 'text',
  onTeachingModeChange,
  selectedTeacher,
  onSelectTeacher,
  classTargetDuration = 15,
  videoComingSoon = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sessionTime, setSessionTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectionInfo, setSelectionInfo] = useState<{ text: string; x: number; y: number } | null>(null);

  // Storyboard & WebM Studio states
  const [storyboard, setStoryboard] = useState<StoryboardData | null>(null);
  const [isBuildingStoryboard, setIsBuildingStoryboard] = useState(false);
  const [storyboardError, setStoryboardError] = useState<string | null>(null);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [isPlayingStoryboard, setIsPlayingStoryboard] = useState(false);
  const [isExportingWebm, setIsExportingWebm] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const activeSegment = lessonSegments[currentSlideIndex];

  const renderedMarkdown = useMemo(() => {
    const content = activeSegment?.content || currentSlideContent || whiteboardNotes;
    return <Markdown>{content}</Markdown>;
  }, [activeSegment, currentSlideContent, whiteboardNotes]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setSessionTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Auto-advance storyboard player
  useEffect(() => {
    if (!isPlayingStoryboard || !storyboard || storyboard.scenes.length === 0) return;
    const scene = storyboard.scenes[activeSceneIndex];
    const durationMs = Math.min(9000, Math.max(3500, (scene?.durationSec || 6) * 450));
    const timeout = setTimeout(() => {
      if (activeSceneIndex < storyboard.scenes.length - 1) {
        setActiveSceneIndex((prev) => prev + 1);
      } else {
        setIsPlayingStoryboard(false);
      }
    }, durationMs);
    return () => clearTimeout(timeout);
  }, [isPlayingStoryboard, storyboard, activeSceneIndex]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionInfo(null);
      return;
    }
    const text = selection.toString().trim();
    if (text.length > 3 && containerRef.current) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      setSelectionInfo({
        text,
        x: Math.max(80, Math.min(containerRect.width - 80, rect.left - containerRect.left + rect.width / 2)),
        y: Math.max(48, rect.top - containerRect.top - 10),
      });
    } else {
      setSelectionInfo(null);
    }
  };

  const handleAskSelection = () => {
    if (selectionInfo && onHighlightAsk) {
      onHighlightAsk(selectionInfo.text);
      setSelectionInfo(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  const buildVideoStoryboard = useCallback(async () => {
    if (lessonSegments.length === 0 || isBuildingStoryboard) return;
    setIsBuildingStoryboard(true);
    setStoryboardError(null);
    setActiveSceneIndex(0);

    try {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/generate-lesson', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          lessonSegments,
          topic: currentTopic || 'TutorNode Lesson',
          language,
          teacherName: selectedTeacher?.name || 'Mwalimu Bora',
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `Storyboard generation failed (${resp.status}).`);
      }
      setStoryboard(data.storyboard);
      setIsPlayingStoryboard(true);

      if (auth.currentUser && data.storyboard) {
        try {
          await addDoc(collection(db, 'videoJobs'), {
            userId: auth.currentUser.uid,
            topic: (currentTopic || 'TutorNode Lesson').slice(0, 300),
            mode: 'storyboard',
            status: 'completed',
            storyboard: {
              totalDurationSec: Number(data.storyboard.totalDurationSec || 0),
              sceneCount: Array.isArray(data.storyboard.scenes) ? data.storyboard.scenes.length : 0,
            },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'videoJobs');
        }
      }
    } catch (err: unknown) {
      setStoryboardError((err as { message?: string })?.message || 'Unable to generate video storyboard.');
    } finally {
      setIsBuildingStoryboard(false);
    }
  }, [currentTopic, isBuildingStoryboard, language, lessonSegments, selectedTeacher?.name]);

  const downloadCaptionsVtt = () => {
    if (!storyboard?.webvtt) return;
    const blob = new Blob([storyboard.webvtt], { type: 'text/vtt;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(currentTopic || 'tutornode-lesson').replace(/\s+/g, '_')}.vtt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportStoryboardAsWebm = async () => {
    if (!storyboard || storyboard.scenes.length === 0 || isExportingWebm) return;
    if (typeof MediaRecorder === 'undefined') {
      setStoryboardError('WebM MediaRecorder is not supported in this browser.');
      return;
    }

    setIsExportingWebm(true);
    setExportProgress(0);
    setStoryboardError(null);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');

      const stream = canvas.captureStream(24);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      const recordingDone = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });

      recorder.start(250);

      const wrapText = (text: string, maxWidth: number, font: string, maxLines = 12): string[] => {
        ctx.font = font;
        const words = text.replace(/[#*`>_]/g, '').split(/\s+/);
        const lines: string[] = [];
        let current = '';
        for (const w of words) {
          const test = current ? `${current} ${w}` : w;
          if (ctx.measureText(test).width > maxWidth && current) {
            lines.push(current);
            current = w;
            if (lines.length >= maxLines) break;
          } else {
            current = test;
          }
        }
        if (current && lines.length < maxLines) lines.push(current);
        return lines;
      };

      for (let i = 0; i < storyboard.scenes.length; i++) {
        const scene = storyboard.scenes[i];
        setActiveSceneIndex(i);
        setExportProgress(Math.round(((i + 1) / storyboard.scenes.length) * 100));

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Board frame
        ctx.fillStyle = '#132a1f';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 4;
        ctx.fillRect(48, 48, 1184, 540);
        ctx.strokeRect(48, 48, 1184, 540);

        // Header badge
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.fillText(`TUTORNODE  •  SLIDE ${i + 1} / ${storyboard.scenes.length}`, 84, 96);

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 34px system-ui, sans-serif';
        ctx.fillText(scene.title.slice(0, 58), 84, 146);

        // Body lines
        ctx.fillStyle = '#e2e8f0';
        const bodyLines = wrapText(scene.boardMarkdown, 1100, '24px Georgia, serif', 9);
        bodyLines.forEach((line, idx) => {
          ctx.fillText(line, 84, 206 + idx * 38);
        });

        // Caption ribbon
        ctx.fillStyle = '#020617';
        ctx.fillRect(48, 608, 1184, 72);
        ctx.fillStyle = '#cbd5e1';
        const captionLines = wrapText(scene.narration, 1140, '20px system-ui, sans-serif', 2);
        captionLines.forEach((line, idx) => {
          ctx.fillText(line, 70, 638 + idx * 26);
        });

        await new Promise((r) => setTimeout(r, 1500));
      }

      recorder.stop();
      const webmBlob = await recordingDone;
      const url = URL.createObjectURL(webmBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(currentTopic || 'tutornode-presentation').replace(/\s+/g, '_')}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setStoryboardError((err as { message?: string })?.message || 'Unable to export WebM video.');
    } finally {
      setIsExportingWebm(false);
    }
  };

  const hasStructuredContent = Boolean(
    structuredLesson &&
      (structuredLesson.introduction ||
        (structuredLesson.learningObjectives && structuredLesson.learningObjectives.length > 0))
  );

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      className={`relative overflow-hidden flex flex-col ${
        isCinematicMode ? 'fixed inset-0 z-[60] bg-slate-950' : 'h-full w-full min-h-[540px]'
      }`}
    >
      {/* Chalkboard Container */}
      <div
        className={`relative flex flex-1 flex-col overflow-hidden ${
          isCinematicMode
            ? 'w-full h-full bg-slate-950'
            : 'w-full h-full bg-[#162920] border-[10px] sm:border-[14px] border-[#433022] rounded-2xl shadow-2xl'
        }`}
      >
        {/* Top Toolbar */}
        <div className="relative z-30 flex flex-wrap items-center justify-between gap-2 px-3 sm:px-6 py-3 bg-black/35 border-b border-white/10">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {isCinematicMode && (
              <button
                type="button"
                onClick={onExitCinematic}
                className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-semibold"
              >
                Exit Full View
              </button>
            )}
            <span className="px-2.5 py-1 rounded-lg bg-white/10 text-xs font-mono font-bold text-slate-200 tabular-nums">
              Slide {currentSlideIndex + 1} / {Math.max(1, slidesCount)}
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 text-xs font-mono text-slate-300 tabular-nums">
              <span>{formatTime(sessionTime)}</span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-400">{formatTime(classTargetDuration * 60)}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {/* Mode Switcher */}
            <div className="flex items-center bg-slate-900/90 border border-white/10 p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => onTeachingModeChange?.('text')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  teachingMode === 'text' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                <BookOpen size={13} />
                <span>Board</span>
              </button>
              <button
                type="button"
                onClick={() => onTeachingModeChange?.('structured')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  teachingMode === 'structured'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <FileText size={13} />
                <span>Notes</span>
              </button>
              <button
                type="button"
                onClick={() => onTeachingModeChange?.('video')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  teachingMode === 'video' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Video size={13} />
                <span>Video</span>
              </button>
            </div>

            {teachingMode !== 'video' && (
              <button
                type="button"
                onClick={() => onTogglePlay(!isPlaying)}
                aria-label={isPlaying ? 'Pause lecture' : 'Play lecture'}
                className="px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-white/10 text-xs font-bold text-white flex items-center gap-1.5"
              >
                {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>
            )}

            {onQuizStart && whiteboardNotes && !whiteboardNotes.includes('Welcome to TutorNode') && (
              <button
                type="button"
                onClick={onQuizStart}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Brain size={13} />
                <span>{language === 'sw' ? 'Mtihani' : 'Quiz'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Toggle fullscreen"
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-white/10 text-slate-200"
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>

        {/* Workspace Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-8 relative z-10">
          {teachingMode === 'video' ? (
            <div className="max-w-5xl mx-auto space-y-6">
              {videoComingSoon ? (
                <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-8 text-center space-y-3">
                  <AlertTriangle className="mx-auto text-amber-400" size={28} />
                  <h3 className="text-lg font-bold text-white">Video Presentation Paused by Admin</h3>
                  <p className="text-sm text-slate-300 max-w-md mx-auto">
                    Video storyboard mode is currently toggled to Coming Soon in Admin Settings. You can continue learning in Board and Notes views.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left: Storyboard Player & WebM Export */}
                  <div className="lg:col-span-2 bg-slate-900/95 border border-white/10 rounded-3xl p-5 sm:p-6 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400">
                          <Film size={18} />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white">
                            Smartboard Video Studio
                          </h3>
                          <p className="text-xs text-slate-400">
                            Synchronized storyboard presentation with WebVTT captions & WebM export
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={buildVideoStoryboard}
                        disabled={lessonSegments.length === 0 || isBuildingStoryboard}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
                      >
                        <Sparkles size={14} />
                        {isBuildingStoryboard ? 'Preparing...' : storyboard ? 'Rebuild Storyboard' : 'Build Video Storyboard'}
                      </button>
                    </div>

                    {storyboardError && (
                      <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/30 text-xs text-red-200">
                        {storyboardError}
                      </div>
                    )}

                    {storyboard ? (
                      <div className="space-y-4">
                        <div className="aspect-video bg-slate-950 border border-white/10 rounded-2xl p-5 sm:p-7 flex flex-col justify-between relative overflow-hidden">
                          <div>
                            <div className="flex items-center justify-between text-xs text-sky-400 font-semibold mb-2">
                              <span>
                                Scene {activeSceneIndex + 1} / {storyboard.scenes.length}
                              </span>
                              <span>{storyboard.scenes[activeSceneIndex]?.visualCue || ''}</span>
                            </div>
                            <h4 className="text-lg sm:text-xl font-bold text-white mb-3">
                              {storyboard.scenes[activeSceneIndex]?.title}
                            </h4>
                            <div className="prose prose-invert prose-sm max-w-none line-clamp-6">
                              <Markdown>{storyboard.scenes[activeSceneIndex]?.boardMarkdown || ''}</Markdown>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-white/10 text-xs text-slate-200 bg-black/40 rounded-xl p-3">
                            {storyboard.scenes[activeSceneIndex]?.narration}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setIsPlayingStoryboard((p) => !p)}
                              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
                            >
                              {isPlayingStoryboard ? <Pause size={14} /> : <Play size={14} />}
                              {isPlayingStoryboard ? 'Pause Playback' : 'Play Presentation'}
                            </button>
                            <div className="flex gap-1">
                              {storyboard.scenes.map((sc, idx) => (
                                <button
                                  key={sc.index}
                                  type="button"
                                  onClick={() => {
                                    setIsPlayingStoryboard(false);
                                    setActiveSceneIndex(idx);
                                  }}
                                  className={`w-7 h-7 rounded-lg text-xs font-bold ${
                                    idx === activeSceneIndex
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                  }`}
                                >
                                  {idx + 1}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={downloadCaptionsVtt}
                              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5"
                            >
                              <Captions size={14} /> Download Captions (.vtt)
                            </button>
                            <button
                              type="button"
                              onClick={exportStoryboardAsWebm}
                              disabled={isExportingWebm}
                              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5"
                            >
                              <Download size={14} />
                              {isExportingWebm ? `Exporting ${exportProgress}%` : 'Export Video (.webm)'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="border border-dashed border-white/15 rounded-2xl p-8 text-center text-sm text-slate-400">
                        {lessonSegments.length === 0
                          ? 'Generate a lesson first, then click "Build Video Storyboard" to play and export a presentation.'
                          : 'Click "Build Video Storyboard" above to create a captioned slide presentation ready for WebM export.'}
                      </div>
                    )}
                  </div>

                  {/* Right: Instructor Selection */}
                  <div className="bg-slate-900/95 border border-white/10 rounded-3xl p-5 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      {language === 'sw' ? 'Chagua Mwalimu' : 'Presenter Avatar'}
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2.5 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                      {TEACHER_CHARACTERS.map((char) => {
                        const isSelected = selectedTeacher?.id === char.id;
                        return (
                          <button
                            key={char.id}
                            type="button"
                            onClick={() => onSelectTeacher?.(char)}
                            className={`p-2.5 rounded-2xl border text-left transition-all flex items-center gap-2.5 ${
                              isSelected
                                ? 'bg-blue-600/20 border-blue-500 text-white'
                                : 'bg-slate-950/60 border-white/10 text-slate-300 hover:border-white/25'
                            }`}
                          >
                            <img
                              src={char.imageUrl}
                              alt={char.name}
                              className="w-10 h-10 rounded-xl shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">{char.name}</div>
                              {isSelected && (
                                <div className="text-[10px] text-blue-300 flex items-center gap-1">
                                  <CheckCircle2 size={10} /> Active
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : teachingMode === 'structured' ? (
            <div className="max-w-4xl mx-auto bg-slate-900/90 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6 text-slate-100">
              {hasStructuredContent && structuredLesson ? (
                <>
                  <div>
                    <h2 className="text-2xl font-extrabold text-white">
                      {structuredLesson.title || currentTopic}
                    </h2>
                    {structuredLesson.introduction && (
                      <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                        {structuredLesson.introduction}
                      </p>
                    )}
                  </div>

                  {structuredLesson.learningObjectives && structuredLesson.learningObjectives.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400">
                        Learning Objectives
                      </h3>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-slate-200">
                        {structuredLesson.learningObjectives.map((obj, idx) => (
                          <li key={idx}>{obj}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {structuredLesson.coreExplanations && structuredLesson.coreExplanations.length > 0 && (
                    <section className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                        Core Explanations
                      </h3>
                      {structuredLesson.coreExplanations.map((exp, idx) => (
                        <div key={idx} className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 prose prose-invert prose-sm max-w-none">
                          <Markdown>{exp}</Markdown>
                        </div>
                      ))}
                    </section>
                  )}

                  {structuredLesson.workedExamples && structuredLesson.workedExamples.length > 0 && (
                    <section className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                        Worked Examples
                      </h3>
                      {structuredLesson.workedExamples.map((ex, idx) => (
                        <div key={idx} className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/20 prose prose-invert prose-sm max-w-none">
                          <Markdown>{ex}</Markdown>
                        </div>
                      ))}
                    </section>
                  )}

                  {structuredLesson.keyDefinitions && structuredLesson.keyDefinitions.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                        Key Definitions
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {structuredLesson.keyDefinitions.map((kd, idx) => (
                          <div key={idx} className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10">
                            <div className="text-xs font-bold text-white">{kd.term}</div>
                            <div className="text-xs text-slate-300 mt-1 leading-relaxed">{kd.definition}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {structuredLesson.practiceActivities && structuredLesson.practiceActivities.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                        Practice Activities
                      </h3>
                      <ul className="list-decimal pl-5 space-y-1.5 text-sm text-slate-200">
                        {structuredLesson.practiceActivities.map((act, idx) => (
                          <li key={idx}>{act}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {structuredLesson.summary && (
                    <section className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/25">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300 mb-1">
                        Summary
                      </h3>
                      <p className="text-sm text-slate-200 leading-relaxed">{structuredLesson.summary}</p>
                    </section>
                  )}

                  {structuredLesson.revisionQuestions && structuredLesson.revisionQuestions.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-rose-300">
                        Revision Questions
                      </h3>
                      <ol className="list-decimal pl-5 space-y-1.5 text-sm text-slate-200">
                        {structuredLesson.revisionQuestions.map((rq, idx) => (
                          <li key={idx}>{rq}</li>
                        ))}
                      </ol>
                    </section>
                  )}
                </>
              ) : (
                <div className="text-center py-10 text-sm text-slate-400">
                  Generate any Quick Topic or Structured Lesson to inspect full structured study notes here.
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-start gap-6 sm:gap-8">
              <div className="flex-1 w-full prose prose-invert max-w-none font-serif prose-headings:text-emerald-200 prose-p:text-slate-100 prose-p:text-lg sm:prose-p:text-xl prose-li:text-slate-100 prose-strong:text-amber-200">
                {renderedMarkdown}
              </div>

              {(activeSegment?.diagram_svg_code || diagramSvg || activeSegment?.diagram_url || diagramUrl || currentSlideContent || whiteboardNotes) && (
                <div className="w-full lg:w-[440px] shrink-0">
                  <InteractiveDiagram
                    key={`diagram-slide-${currentSlideIndex}`}
                    svgCode={activeSegment?.diagram_svg_code || diagramSvg}
                    imageUrl={activeSegment?.diagram_url || diagramUrl}
                    diagramTitle={activeSegment?.diagram_title}
                    topic={activeSegment?.content || currentSlideContent || whiteboardNotes}
                    language={language}
                    isCinematicMode={isCinematicMode}
                    onAskMwalimu={onHighlightAsk}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Subtitles & Raise Hand Footer */}
        {teachingMode !== 'video' && (
          <div className="relative z-20 px-4 sm:px-6 py-3 bg-black/40 border-t border-white/10 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              {showSubtitles && teacherDialogue && (
                <p className="text-xs sm:text-sm text-slate-200 line-clamp-2 leading-snug">
                  <span className="font-bold text-emerald-300 mr-2">
                    {selectedTeacher?.name || 'Mwalimu Bora'}:
                  </span>
                  {teacherDialogue}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onHighlightAsk?.('I would like clarification on this slide.')}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 shadow"
            >
              <Hand size={14} />
              <span>{language === 'sw' ? 'Uliza Swali' : 'Raise Hand'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Highlight-to-Ask Tooltip */}
      <AnimatePresence>
        {selectionInfo && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              left: selectionInfo.x,
              top: selectionInfo.y,
              transform: 'translate(-50%, -100%)',
            }}
            onClick={handleAskSelection}
            className="absolute z-50 px-3.5 py-1.5 rounded-full bg-slate-950 border border-blue-400 text-blue-300 text-xs font-bold shadow-xl flex items-center gap-1.5"
          >
            <Hand size={12} /> Ask Mwalimu
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
