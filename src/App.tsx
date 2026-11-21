import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, getAuthHeaders, handleFirestoreError, OperationType } from './lib/firebase';
import { hasAppLockPin, isAppLockEnabled } from './lib/appLock';
import { playClassroomChime, startAmbientFocusSound, stopAmbientFocusSound } from './lib/audioSynth';
import { TEACHER_CHARACTERS, TeacherCharacter, getVoiceForCharacter } from './lib/characters';
import { Syllabus } from './lib/syllabusData';

import { AuthGate } from './components/AuthGate';
import { AppLockScreen } from './components/AppLockScreen';
import { Navbar, WorkspaceView } from './components/Navbar';
import { LessonControls, StructuredLessonRequest } from './components/LessonControls';
import {
  VideoSmartboard,
  LessonSegment,
  StructuredLessonData,
} from './components/VideoSmartboard';
import { QASection, Message } from './components/QASection';
import { SavedLessonItem, exportLessonToPdf } from './components/HistoryArchive';
import { ChevronLeft, ChevronRight, Download, MessageSquare, AlertTriangle, RotateCcw } from 'lucide-react';

const InteractiveQuiz = lazy(() =>
  import('./components/InteractiveQuiz').then((m) => ({ default: m.InteractiveQuiz }))
);
const DocumentAnalyzer = lazy(() =>
  import('./components/DocumentAnalyzer').then((m) => ({ default: m.DocumentAnalyzer }))
);
const SyllabusWorkspace = lazy(() =>
  import('./components/SyllabusWorkspace').then((m) => ({ default: m.SyllabusWorkspace }))
);
const HistoryArchive = lazy(() =>
  import('./components/HistoryArchive').then((m) => ({ default: m.HistoryArchive }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const FeedbackModal = lazy(() =>
  import('./components/FeedbackModal').then((m) => ({ default: m.FeedbackModal }))
);
const OrientationGuide = lazy(() =>
  import('./components/OrientationGuide').then((m) => ({ default: m.OrientationGuide }))
);

const WELCOME_NOTES_EN =
  '# Welcome to TutorNode\nEnter any topic below, launch the **Lesson Builder** for structured objectives, upload an **Examination Paper** for step-by-step teacher revision, or open **Documents** to analyze lecture handouts.';
const WELCOME_NOTES_SW =
  '# Karibu TutorNode\nAndika mada yoyote hapa chini, tumia **Mpangilio wa Somo**, pakia **Karatasi ya Mtihani** kwa mapitio ya hatua kwa hatua, au fungua **Nyaraka** kuchambua vitabu na maelezo.';

function cleanSpeechText(raw: string): string {
  return raw
    .replace(/\[.*?\]|\*.*?\*/g, ' ')
    .replace(/[#`>_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [appLockEnabledState, setAppLockEnabledState] = useState(false);

  const [activeView, setActiveView] = useState<WorkspaceView>('board');
  const [language, setLanguage] = useState<'en' | 'sw'>('en');
  const [studyLevel, setStudyLevel] = useState<string>(
    () => localStorage.getItem('tutornode_study_level') || 'Undergraduate'
  );
  const [classTrack, setClassTrack] = useState<string>(
    () => localStorage.getItem('tutornode_class_track') || 'Engineering & STEM'
  );
  const [intelLevel, setIntelLevel] = useState<'Standard' | '100% Omni-Intelligence'>('Standard');
  const [selectedCharacter, setSelectedCharacter] = useState<TeacherCharacter>(TEACHER_CHARACTERS[0]);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string | null>(
    () => localStorage.getItem('tutornode_voice_name')
  );
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [isAmbientActive, setIsAmbientActive] = useState(false);

  // Classroom & Lesson States
  const [studentInput, setStudentInput] = useState('');
  const [currentTopic, setCurrentTopic] = useState('');
  const [whiteboardNotes, setWhiteboardNotes] = useState(WELCOME_NOTES_EN);
  const [teacherDialogue, setTeacherDialogue] = useState(
    'Welcome to TutorNode. What topic or exam paper shall we work through today?'
  );
  const [lessonSegments, setLessonSegments] = useState<LessonSegment[]>([]);
  const [structuredLesson, setStructuredLesson] = useState<StructuredLessonData | null>(null);
  const [diagramSvg, setDiagramSvg] = useState<string | null>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [teachingMode, setTeachingMode] = useState<'text' | 'structured' | 'video'>('text');
  const [teachingTechnique, setTeachingTechnique] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [apiError, setApiError] = useState<{ message: string; retryFn?: () => void } | null>(null);
  const [videoComingSoon, setVideoComingSoon] = useState(false);

  // Attached Study Material & Exam Paper
  const [studyFileData, setStudyFileData] = useState<{ mimeType: string; data: string } | null>(null);
  const [studyFileName, setStudyFileName] = useState<string | null>(null);
  const [examFileData, setExamFileData] = useState<{ mimeType: string; data: string } | null>(null);
  const [examFileName, setExamFileName] = useState<string | null>(null);
  const [isProcessingExam, setIsProcessingExam] = useState(false);
  const [isExamSharing, setIsExamSharing] = useState(false);
  const [shareExamUrl, setShareExamUrl] = useState<string | null>(null);

  // Overlays & Modals
  const [isQAOpen, setIsQAOpen] = useState(false);
  const [initialQAQuestion, setInitialQAQuestion] = useState<string | undefined>(undefined);
  const [qaMessages] = useState<Message[] | undefined>(undefined);
  const [isWaitingForContinue, setIsWaitingForContinue] = useState(false);
  const [isLessonEnded, setIsLessonEnded] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showOrientation, setShowOrientation] = useState(false);

  // Persistence
  const [lessonHistory, setLessonHistory] = useState<SavedLessonItem[]>([]);
  const [activeSyllabus, setActiveSyllabus] = useState<Syllabus | null>(null);
  const [isListening, setIsListening] = useState(false);

  const activeLessonRunRef = useRef(0);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<any>(null);

  // Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (u) {
        setShowAuthModal(false);
        setPreviewMode(false);
        const uKey = u.uid || u.email || 'anonymous';
        const enabled = isAppLockEnabled(uKey) && hasAppLockPin(uKey);
        setAppLockEnabledState(enabled);
        setIsAppLocked(enabled);
      } else {
        setAppLockEnabledState(false);
        setIsAppLocked(false);
      }
    });
    return () => unsub();
  }, []);

  // Load Voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) setAvailableVoices(voices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // Load Firestore data for authenticated user + query params (?syllabus= / ?exam=)
  const fetchLessonHistory = useCallback(async (uid: string) => {
    try {
      const q = query(
        collection(db, 'lessons'),
        where('userId', '==', uid),
        orderBy('timestamp', 'desc'),
        limit(25)
      );
      const snap = await getDocs(q);
      setLessonHistory(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SavedLessonItem, 'id'>),
        }))
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'lessons');
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setLessonHistory([]);
      return;
    }
    fetchLessonHistory(user.uid);

    // Fetch appSettings/videoMode
    getDoc(doc(db, 'appSettings', 'videoMode'))
      .then((snap) => {
        if (snap.exists()) setVideoComingSoon(Boolean(snap.data().comingSoon));
      })
      .catch(() => {});

    // Handle shared URL params
    const params = new URLSearchParams(window.location.search);
    const sylId = params.get('syllabus');
    const examId = params.get('exam');

    if (sylId) {
      getDoc(doc(db, 'syllabi', sylId))
        .then((snap) => {
          if (snap.exists()) {
            setActiveSyllabus({ id: snap.id, ...(snap.data() as Syllabus) });
            setActiveView('syllabus');
          }
        })
        .catch(() => {});
    } else if (examId) {
      getDoc(doc(db, 'exams', examId))
        .then((snap) => {
          if (snap.exists()) {
            const d = snap.data();
            if (d.data && d.mimeType) {
              setExamFileData({ mimeType: d.mimeType, data: d.data });
              setExamFileName(d.name || 'Shared Exam Paper');
            }
          }
        })
        .catch(() => {});
    }
  }, [user, fetchLessonHistory]);

  // Speech engine
  const stopSpeaking = useCallback(() => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
  }, []);

  const speakText = useCallback(
    (rawText: string, onComplete?: () => void) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        onComplete?.();
        return;
      }

      stopSpeaking();
      const cleaned = cleanSpeechText(rawText);
      if (!cleaned) {
        onComplete?.();
        return;
      }

      const runId = activeLessonRunRef.current;
      const utterance = new SpeechSynthesisUtterance(cleaned);
      const voices = window.speechSynthesis.getVoices();
      const langPrefix = language === 'sw' ? 'sw' : 'en';
      utterance.lang = language === 'sw' ? 'sw-KE' : 'en-US';

      const explicitVoice = selectedVoiceName
        ? voices.find((v) => v.name === selectedVoiceName)
        : null;
      const matchedVoice =
        explicitVoice || getVoiceForCharacter(selectedCharacter, voices, langPrefix);
      if (matchedVoice) {
        utterance.voice = matchedVoice;
        utterance.lang = matchedVoice.lang;
      }

      utterance.rate = 0.98;
      utterance.onstart = () => {
        if (runId !== activeLessonRunRef.current) return;
        setIsPlaying(true);
        keepAliveRef.current = setInterval(() => {
          if (window.speechSynthesis.speaking) {
            try {
              window.speechSynthesis.pause();
              window.speechSynthesis.resume();
            } catch {
              // Ignore browser quirks
            }
          }
        }, 9000);
      };
      utterance.onend = () => {
        if (keepAliveRef.current) {
          clearInterval(keepAliveRef.current);
          keepAliveRef.current = null;
        }
        if (runId !== activeLessonRunRef.current) return;
        setIsPlaying(false);
        onComplete?.();
      };
      utterance.onerror = () => {
        if (keepAliveRef.current) {
          clearInterval(keepAliveRef.current);
          keepAliveRef.current = null;
        }
        setIsPlaying(false);
      };

      window.speechSynthesis.speak(utterance);
    },
    [language, selectedCharacter, selectedVoiceName, stopSpeaking]
  );

  // Slide playback loop
  const playSlideAtIndex = useCallback(
    (segments: LessonSegment[], index: number) => {
      if (!segments[index]) {
        setIsPlaying(false);
        setIsLessonEnded(true);
        return;
      }
      setCurrentSlideIndex(index);
      setWhiteboardNotes(segments[index].content || '');
      setTeacherDialogue(segments[index].speech || '');
      if (segments[index].diagram_svg_code) {
        setDiagramSvg(segments[index].diagram_svg_code || null);
      }

      speakText(segments[index].speech || segments[index].content || '', () => {
        if (index + 1 < segments.length) {
          playSlideAtIndex(segments, index + 1);
        } else {
          setIsLessonEnded(true);
        }
      });
    },
    [speakText]
  );

  const togglePlayPause = (wantPlay: boolean) => {
    if (!wantPlay) {
      stopSpeaking();
      return;
    }
    if (lessonSegments.length > 0) {
      playSlideAtIndex(lessonSegments, currentSlideIndex);
    } else if (teacherDialogue) {
      speakText(teacherDialogue);
    }
  };

  // Core AI Lesson Synthesis
  const executeLessonSynthesis = async (payload: {
    input?: string;
    subject?: string;
    topic?: string;
    educationLevel?: string;
    learningObjectives?: string;
    preferredLength?: string;
    additionalInstructions?: string;
    isExamRevision?: boolean;
    fileData?: { mimeType: string; data: string } | null;
    syllabusContext?: any;
  }) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    stopSpeaking();
    activeLessonRunRef.current += 1;
    setIsLoading(true);
    setApiError(null);
    setIsLessonEnded(false);
    setActiveView('board');

    try {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/generate-lesson-synthesis', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...payload,
          language,
          classTrack,
          studyLevel: payload.educationLevel || studyLevel,
          intelLevel,
          teacherName: selectedCharacter.name,
          teacherAppearance: selectedCharacter.appearance,
          fileData: payload.fileData !== undefined ? payload.fileData : studyFileData,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `Lesson generation failed (${resp.status}).`);
      }

      const segments: LessonSegment[] = Array.isArray(data.segments) ? data.segments : [];
      if (segments.length === 0) {
        throw new Error('The AI did not return lesson slides. Please retry.');
      }

      const topicLabel = String(
        payload.topic || payload.input || data.structuredLesson?.title || 'Lesson'
      ).slice(0, 300);

      setCurrentTopic(topicLabel);
      setLessonSegments(segments);
      setStructuredLesson(data.structuredLesson || null);
      setTeachingTechnique(data.teachingTechnique || null);
      setDiagramSvg(data.diagram_svg_code || segments[0]?.diagram_svg_code || null);
      setTeachingMode('text');
      playClassroomChime();
      playSlideAtIndex(segments, 0);

      // Save to Firestore
      const combinedNotes = segments.map((s) => s.content).join('\n\n---\n\n');
      const combinedSpeech = segments.map((s) => s.speech).join(' ');
      try {
        await addDoc(collection(db, 'lessons'), {
          userId: user.uid,
          topic: topicLabel,
          ...(payload.subject ? { subject: payload.subject.slice(0, 160) } : {}),
          educationLevel: (payload.educationLevel || studyLevel).slice(0, 80),
          whiteboard_notes: combinedNotes.slice(0, 200000),
          teacher_dialogue: combinedSpeech.slice(0, 150000),
          segments: segments.slice(0, 40),
          ...(data.structuredLesson ? { structured_lesson: data.structuredLesson } : {}),
          ...(data.diagram_svg_code ? { diagram_svg_code: data.diagram_svg_code.slice(0, 200000) } : {}),
          is_exam_revision: Boolean(payload.isExamRevision),
          timestamp: serverTimestamp(),
        });
        fetchLessonHistory(user.uid);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'lessons');
      }
    } catch (err: unknown) {
      setApiError({
        message: (err as { message?: string })?.message || 'Unable to generate lesson.',
        retryFn: () => executeLessonSynthesis(payload),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLearn = (topicText: string) => {
    executeLessonSynthesis({ input: topicText, topic: topicText });
  };

  const handleStructuredLearn = (req: StructuredLessonRequest) => {
    executeLessonSynthesis({
      input: req.topic,
      subject: req.subject,
      topic: req.topic,
      educationLevel: req.educationLevel,
      learningObjectives: req.learningObjectives,
      preferredLength: req.preferredLength,
      additionalInstructions: req.additionalInstructions,
    });
  };

  const handleStartExamRevision = () => {
    if (!examFileData) return;
    executeLessonSynthesis({
      input: `Complete Exam Revision: ${examFileName || 'Examination Paper'}`,
      topic: `Exam Revision: ${examFileName || 'Past Paper'}`,
      isExamRevision: true,
      fileData: examFileData,
    });
  };

  // File Upload Handlers
  const readAllowedFile = (
    file: File,
    onDone: (res: { mimeType: string; data: string }) => void,
    onFail: (msg: string) => void
  ) => {
    const allowed = ['application/pdf', 'text/plain', 'text/markdown', 'text/csv'];
    if (!allowed.includes(file.type)) {
      onFail('Please upload a PDF, TXT, MD, or CSV file.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      onFail('Direct upload limit is 4MB. Please compress or split larger PDFs.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = String(ev.target?.result || '').split(',')[1] || '';
      onDone({ mimeType: file.type, data: base64 });
    };
    reader.onerror = () => onFail('Unable to read the selected file.');
    reader.readAsDataURL(file);
  };

  const handleUploadStudyFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readAllowedFile(
      file,
      (res) => {
        setStudyFileData(res);
        setStudyFileName(file.name);
        setApiError(null);
      },
      (msg) => setApiError({ message: msg })
    );
  };

  const handleUploadExamFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingExam(true);
    readAllowedFile(
      file,
      (res) => {
        setExamFileData(res);
        setExamFileName(file.name);
        setIsProcessingExam(false);
        setApiError(null);
      },
      (msg) => {
        setIsProcessingExam(false);
        setApiError({ message: msg });
      }
    );
  };

  const handleShareExam = async () => {
    if (!examFileData || !examFileName || !user) return;
    if (examFileData.data.length > 800_000) {
      setApiError({
        message: 'Exam files larger than ~600KB exceed Firestore document limits for link sharing.',
      });
      return;
    }
    setIsExamSharing(true);
    try {
      const ref = await addDoc(collection(db, 'exams'), {
        userId: user.uid,
        name: examFileName.slice(0, 255),
        mimeType: examFileData.mimeType,
        data: examFileData.data,
        isShared: true,
        createdAt: serverTimestamp(),
      });
      setShareExamUrl(`${window.location.origin}?exam=${ref.id}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'exams');
      setApiError({ message: 'Unable to create shared exam link.' });
    } finally {
      setIsExamSharing(false);
    }
  };

  // Voice Recognition Toggle
  const toggleVoiceInput = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setApiError({
        message: 'Voice recognition is not supported in this browser. Please type your topic.',
      });
      return;
    }
    const rec = new SpeechRec();
    rec.lang = language === 'sw' ? 'sw-KE' : 'en-US';
    rec.interimResults = false;
    rec.onresult = (ev: any) => {
      const transcript = ev.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        setStudentInput(transcript);
      }
      setIsListening(false);
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    setIsListening(true);
    rec.start();
  };

  const toggleAmbient = () => {
    if (isAmbientActive) {
      stopAmbientFocusSound();
      setIsAmbientActive(false);
    } else {
      const started = startAmbientFocusSound();
      setIsAmbientActive(started);
    }
  };

  const handleLoadHistoryLesson = (lesson: SavedLessonItem) => {
    stopSpeaking();
    setCurrentTopic(lesson.topic);
    const segs =
      Array.isArray(lesson.segments) && lesson.segments.length > 0
        ? lesson.segments
        : [{ content: lesson.whiteboard_notes, speech: lesson.teacher_dialogue }];
    setLessonSegments(segs);
    setStructuredLesson(lesson.structured_lesson || null);
    setDiagramSvg(lesson.diagram_svg_code || segs[0]?.diagram_svg_code || null);
    setCurrentSlideIndex(0);
    setWhiteboardNotes(segs[0].content);
    setTeacherDialogue(segs[0].speech);
    setActiveView('board');
    setTeachingMode('text');
  };

  const handleDeleteHistoryLesson = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'lessons', id));
      setLessonHistory((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `lessons/${id}`);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Loading TutorNode...
      </div>
    );
  }

  if (!user && !previewMode) {
    return (
      <AuthGate
        onSuccess={() => setShowAuthModal(false)}
        onPreviewAccess={() => {
          setPreviewMode(true);
          setActiveView('curriculum');
        }}
      />
    );
  }

  if (user && isAppLocked) {
    return (
      <AppLockScreen
        onUnlock={() => setIsAppLocked(false)}
        onSignOut={() => signOut(auth)}
        accentColor="#2563eb"
        user={user}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        activeView={activeView}
        onChangeView={setActiveView}
        language={language}
        onToggleLanguage={() => {
          const next = language === 'en' ? 'sw' : 'en';
          setLanguage(next);
          if (lessonSegments.length === 0) {
            setWhiteboardNotes(next === 'sw' ? WELCOME_NOTES_SW : WELCOME_NOTES_EN);
          }
        }}
        user={user}
        isAmbientActive={isAmbientActive}
        onToggleAmbient={toggleAmbient}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenFeedback={() => setShowFeedback(true)}
        onOpenOrientation={() => setShowOrientation(true)}
        onLogout={() => {
          stopSpeaking();
          signOut(auth);
        }}
        onRequestAuth={() => setShowAuthModal(true)}
      />

      <main className="flex-1 relative">
        {apiError && (
          <div className="max-w-6xl mx-auto px-4 pt-4">
            <div className="bg-red-950/60 border border-red-500/35 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-red-100">
              <div className="flex items-center gap-2.5">
                <AlertTriangle size={16} className="text-red-400 shrink-0" />
                <span>{apiError.message}</span>
              </div>
              <div className="flex items-center gap-2">
                {apiError.retryFn && (
                  <button
                    type="button"
                    onClick={apiError.retryFn}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-1"
                  >
                    <RotateCcw size={12} /> Retry
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setApiError(null)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {activeView === 'board' && (
          <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-4">
            <LessonControls
              language={language}
              studentInput={studentInput}
              onStudentInputChange={setStudentInput}
              studyLevel={studyLevel}
              isLoading={isLoading}
              isListening={isListening}
              onToggleVoice={toggleVoiceInput}
              onQuickLearn={handleQuickLearn}
              onStructuredLearn={handleStructuredLearn}
              fileName={studyFileName}
              onUploadStudyFile={handleUploadStudyFile}
              onClearStudyFile={() => {
                setStudyFileData(null);
                setStudyFileName(null);
              }}
              examFileName={examFileName}
              hasExamFile={Boolean(examFileData)}
              isProcessingExam={isProcessingExam}
              onUploadExamFile={handleUploadExamFile}
              onClearExamFile={() => {
                setExamFileData(null);
                setExamFileName(null);
                setShareExamUrl(null);
              }}
              onStartExamRevision={handleStartExamRevision}
              onShareExam={handleShareExam}
              isExamSharing={isExamSharing}
              shareExamUrl={shareExamUrl}
            />

            <div className="relative">
              <VideoSmartboard
                currentTopic={currentTopic}
                isPlaying={isPlaying}
                currentSlideIndex={currentSlideIndex}
                slidesCount={Math.max(1, lessonSegments.length)}
                currentSlideContent={lessonSegments[currentSlideIndex]?.content || whiteboardNotes}
                whiteboardNotes={whiteboardNotes}
                lessonSegments={lessonSegments}
                structuredLesson={structuredLesson}
                teacherDialogue={teacherDialogue}
                showSubtitles={showSubtitles}
                onTogglePlay={togglePlayPause}
                diagramSvg={diagramSvg}
                onHighlightAsk={(text) => {
                  setInitialQAQuestion(text);
                  setIsQAOpen(true);
                }}
                onQuizStart={() => {
                  stopSpeaking();
                  setShowQuiz(true);
                }}
                language={language}
                teachingMode={teachingMode}
                onTeachingModeChange={setTeachingMode}
                selectedTeacher={selectedCharacter}
                onSelectTeacher={setSelectedCharacter}
                videoComingSoon={videoComingSoon}
                teachingTechnique={teachingTechnique}
              />

              {isQAOpen && (
                <QASection
                  currentTopic={currentTopic || 'General Lesson'}
                  currentSegment={lessonSegments[currentSlideIndex] || null}
                  language={language}
                  onClose={() => {
                    setIsQAOpen(false);
                    setInitialQAQuestion(undefined);
                  }}
                  initialQuestion={initialQAQuestion}
                  onAssistantSpeak={speakText}
                  intelLevel={intelLevel}
                  studyLevel={studyLevel}
                  teachingTechniqueId={teachingTechnique?.id}
                  initialMessages={qaMessages}
                  isWaitingForContinue={isWaitingForContinue}
                  onWaitingForContinueChange={setIsWaitingForContinue}
                  isLessonEnded={isLessonEnded}
                />
              )}
            </div>

            {/* Bottom Classroom Slide Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-white/10 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={lessonSegments.length === 0 || currentSlideIndex === 0}
                  onClick={() => playSlideAtIndex(lessonSegments, currentSlideIndex - 1)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold flex items-center gap-1"
                >
                  <ChevronLeft size={14} /> Prev Slide
                </button>
                <button
                  type="button"
                  disabled={lessonSegments.length === 0 || currentSlideIndex >= lessonSegments.length - 1}
                  onClick={() => playSlideAtIndex(lessonSegments, currentSlideIndex + 1)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold flex items-center gap-1"
                >
                  Next Slide <ChevronRight size={14} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsQAOpen((o) => !o)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-200 text-xs font-bold flex items-center gap-1.5"
                >
                  <MessageSquare size={14} /> Ask Tutor
                </button>
                {lessonSegments.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      exportLessonToPdf(
                        currentTopic,
                        lessonSegments.map((s) => s.content).join('\n\n')
                      )
                    }
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Download size={14} /> Export PDF
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <Suspense
          fallback={
            <div className="max-w-5xl mx-auto p-10 text-center text-sm text-slate-400">
              Loading module...
            </div>
          }
        >
          {activeView === 'documents' && (
            <DocumentAnalyzer
              language={language}
              studyLevel={studyLevel}
              onTeachFromDocument={(docTitle, summaryNotes) => {
                executeLessonSynthesis({
                  topic: docTitle,
                  input: `Teach the core concepts from "${docTitle}". Reference notes:\n${summaryNotes.slice(0, 3000)}`,
                });
              }}
            />
          )}

          {(activeView === 'curriculum' || activeView === 'syllabus') && (
            <SyllabusWorkspace
              mode={activeView}
              language={language}
              studyLevel={studyLevel}
              activeSyllabus={activeSyllabus}
              onSelectSyllabus={setActiveSyllabus}
              onTeachTopic={(topicTitle, ctx) => {
                executeLessonSynthesis({
                  topic: topicTitle,
                  input: topicTitle,
                  syllabusContext: ctx,
                });
              }}
            />
          )}

          {activeView === 'history' && (
            <HistoryArchive
              lessons={lessonHistory}
              language={language}
              onLoadLesson={handleLoadHistoryLesson}
              onDeleteLesson={handleDeleteHistoryLesson}
            />
          )}

          {showQuiz && (
            <InteractiveQuiz
              currentTopic={currentTopic || 'Lesson Review'}
              whiteboardNotes={
                lessonSegments.length > 0
                  ? lessonSegments.map((s) => s.content).join('\n\n')
                  : whiteboardNotes
              }
              language={language}
              onClose={() => setShowQuiz(false)}
              intelLevel={intelLevel}
              studyLevel={studyLevel}
            />
          )}

          {isSettingsOpen && (
            <SettingsModal
              onClose={() => setIsSettingsOpen(false)}
              language={language}
              onChangeLanguage={setLanguage}
              studyLevel={studyLevel}
              onChangeStudyLevel={(lvl) => {
                setStudyLevel(lvl);
                localStorage.setItem('tutornode_study_level', lvl);
              }}
              classTrack={classTrack}
              onChangeClassTrack={(t) => {
                setClassTrack(t);
                localStorage.setItem('tutornode_class_track', t);
              }}
              intelLevel={intelLevel}
              onChangeIntelLevel={setIntelLevel}
              selectedCharacter={selectedCharacter}
              onSelectCharacter={setSelectedCharacter}
              availableVoices={availableVoices}
              selectedVoiceName={selectedVoiceName}
              onSelectVoiceName={(name) => {
                setSelectedVoiceName(name);
                if (name) localStorage.setItem('tutornode_voice_name', name);
                else localStorage.removeItem('tutornode_voice_name');
              }}
              onTestVoice={() =>
                speakText(
                  language === 'sw'
                    ? 'Hujambo! Mimi ni Mwalimu Bora wa TutorNode.'
                    : `Hello! I am ${selectedCharacter.name} from TutorNode.`
                )
              }
              showSubtitles={showSubtitles}
              onToggleSubtitles={setShowSubtitles}
              user={user}
              isAppLockEnabled={appLockEnabledState}
              onChangeAppLockEnabled={setAppLockEnabledState}
            />
          )}

          {showFeedback && (
            <FeedbackModal
              currentTopic={currentTopic}
              teacherDialogue={teacherDialogue}
              language={language}
              onClose={() => setShowFeedback(false)}
            />
          )}

          {showOrientation && (
            <OrientationGuide language={language} onClose={() => setShowOrientation(false)} />
          )}
        </Suspense>
      </main>

      {showAuthModal && (
        <AuthGate
          onSuccess={() => setShowAuthModal(false)}
          onPreviewAccess={() => setShowAuthModal(false)}
        />
      )}
    </div>
  );
}
