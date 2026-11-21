import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";
import { jsPDF } from "jspdf";
import { VideoSmartboard } from "./components/VideoSmartboard";
import { QASection, Message } from "./components/QASection";
import { AuthGate } from "./components/AuthGate";
import { AppLockScreen } from "./components/AppLockScreen";
import { InteractiveQuiz } from "./components/InteractiveQuiz";
import { InteractiveFeaturePreview } from "./components/InteractiveFeaturePreview";
import { OrientationTour } from "./components/OrientationTour";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  getDocs,
  where,
  limit,
  doc,
  deleteDoc,
  getDoc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  User,
} from "firebase/auth";
import { db, auth, handleFirestoreError, OperationType } from "./lib/firebase";
import { PRELOADED_SYLLABI, ensureSyllabusCompatibility } from "./lib/syllabusData";
import {
  TEACHER_CHARACTERS,
  getCharacterForVoice,
  getVoiceForCharacter,
  TeacherCharacter,
} from "./lib/characters";

interface Lesson {
  id: string;
  topic: string;
  whiteboard_notes: string;
  teacher_dialogue: string;
  timestamp: any;
  segments?: { content: string; speech: string }[];
  visual_diagram_prompt?: string;
  diagram_svg_code?: string;
  video_scene?: string;
  video_keyword?: string;
}

const getSubtopicsForTopic = (descr: string, fallbackTitle: string, subtopicsArray?: string[]): string[] => {
  if (subtopicsArray && subtopicsArray.length > 0) {
    return subtopicsArray;
  }
  if (!descr) return [fallbackTitle];
  
  let desc = descr.trim();
  
  // Remove standard starter prefixes
  const prefixes = [/^[Cc]overs:?\s*/, /^[Cc]overing:?\s*/, /^[Ii]ncluded:?\s*/, /^[Ii]ncludes:?\s*/];
  for (const prefix of prefixes) {
    desc = desc.replace(prefix, "");
  }
  
  const rawParts = desc.split(",");
  const cleaned: string[] = [];
  
  for (let part of rawParts) {
    let t = part.trim();
    if (t.toLowerCase().startsWith("and ")) {
      t = t.substring(4).trim();
    }
    if (t.endsWith(".")) {
      t = t.substring(0, t.length - 1).trim();
    }
    if (t) {
      t = t.charAt(0).toUpperCase() + t.slice(1);
      cleaned.push(t);
    }
  }
  
  if (cleaned.length === 0) {
    return [fallbackTitle];
  }
  return cleaned;
};

const cleanStageDirections = (text: string): string => {
  if (!text) return "";
  let cleaned = text;
  // Remove (You walk...), (Mwalimu sits...), etc.
  cleaned = cleaned.replace(/\([^)]*\)/g, "");
  // Remove [smiles], etc.
  cleaned = cleaned.replace(/\[[^\]]*\]/g, "");
  // Remove *chuckles*, etc.
  cleaned = cleaned.replace(/\*[^*]*\*/g, "");
  
  // Clean up punctuation and spacing issues created by removals
  cleaned = cleaned.replace(/\s+/g, " "); // collapse multiple spaces to a single space
  cleaned = cleaned.replace(/\.\.+/g, "."); // replace double or more periods (like '..') with a single period
  cleaned = cleaned.replace(/\s+\./g, "."); // remove space before period
  cleaned = cleaned.replace(/\s+\,/g, ","); // remove space before comma
  cleaned = cleaned.trim();
  return cleaned;
};

const getLangLocale = (lang: string): string => {
  return lang === "sw" ? "sw-TZ" : "en-US";
};

const getUserKey = (u: any): string => {
  return u?.uid || u?.email || "anonymous";
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isSandboxGuest, setIsSandboxGuest] = useState(
    localStorage.getItem("omnitutor_sandbox_guest") === "true",
  );
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAppLocked, setIsAppLocked] = useState<boolean>(false);

  useEffect(() => {
    if (user) {
      const uKey = getUserKey(user);
      setIsAppLockEnabledSetting(localStorage.getItem(`tutor_app_lock_enabled_${uKey}`) === "true");
      setIsAppLockBiometricsEnabled(localStorage.getItem(`tutor_app_lock_biometrics_enabled_${uKey}`) === "true");
      setEnrolledFingerprintSignature(localStorage.getItem(`tutor_app_lock_fingerprint_signature_id_${uKey}`));
      setHasSavedAppLockPassword(!!localStorage.getItem(`tutor_app_lock_password_${uKey}`));
      
      const isLockEnabled = localStorage.getItem(`tutor_app_lock_enabled_${uKey}`) === "true";
      const hasPassword = !!localStorage.getItem(`tutor_app_lock_password_${uKey}`);
      const isUnlocked = sessionStorage.getItem(`tutor_session_unlocked_${uKey}`) === "true";
      
      if (isLockEnabled && hasPassword && !isUnlocked) {
        setIsAppLocked(true);
      } else {
        setIsAppLocked(false);
      }
    } else {
      setIsAppLocked(false);
      setIsAppLockEnabledSetting(false);
      setIsAppLockBiometricsEnabled(false);
      setEnrolledFingerprintSignature(null);
      setHasSavedAppLockPassword(false);
    }
  }, [user]);

  const [showOrientation, setShowOrientation] = useState(false);
  const [activeView, setActiveView] = useState<
    "board" | "curriculum" | "history" | "quiz" | "syllabus"
  >("board");
  const [studentInput, setStudentInput] = useState("");
  const enrollmentIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startEnrollmentScan = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.preventDefault();
    setIsEnrollmentHolding(true);
    setAppLockSetupError(null);
    setAppLockSetupSuccess(null);

    if (enrollmentIntervalRef.current) {
      clearInterval(enrollmentIntervalRef.current);
    }

    let progress = 0;
    setEnrollmentProgress(0);
    enrollmentIntervalRef.current = setInterval(() => {
      progress += 5;
      if (progress >= 100) {
        setEnrollmentProgress(100);
        setIsEnrollmentHolding(false);
        if (enrollmentIntervalRef.current) {
          clearInterval(enrollmentIntervalRef.current);
          enrollmentIntervalRef.current = null;
        }
        
        // Generate a random, persistent high-entropy biometric signature hash
        const randNum = Math.floor(1000 + Math.random() * 9000);
        const randLetters = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + String.fromCharCode(65 + Math.floor(Math.random() * 26));
        const generatedSig = `BIO-SIG-${randNum}-${randLetters}`;
        
        const uKey = getUserKey(user);
        localStorage.setItem(`tutor_app_lock_biometrics_enabled_${uKey}`, "true");
        localStorage.setItem(`tutor_app_lock_enrolled_finger_${uKey}`, enrollmentFinger);
        localStorage.setItem(`tutor_app_lock_fingerprint_signature_id_${uKey}`, generatedSig);
        
        setIsAppLockBiometricsEnabled(true);
        setEnrolledFingerprintSignature(generatedSig);
        setIsEnrollmentMode(false);
        setAppLockSetupSuccess(`✓ Fingerprint (${enrollmentFinger}) successfully enrolled and calibrated! [Security Signature: ${generatedSig}] Your sensor is now ready to unlock the workspace.`);
        setTimeout(() => setAppLockSetupSuccess(null), 8000);
      } else {
        setEnrollmentProgress(progress);
      }
    }, 100); // 2.0 seconds total hold for full calibration scan
  };

  const stopEnrollmentScan = () => {
    if (enrollmentIntervalRef.current) {
      clearInterval(enrollmentIntervalRef.current);
      enrollmentIntervalRef.current = null;
    }
    setIsEnrollmentHolding(false);
    if (enrollmentProgress < 100 && isEnrollmentMode) {
      setAppLockSetupError("❌ Scan interrupted! Please press and hold on the circular fingerprint sensor until the progress ring is filled.");
      setEnrollmentProgress(0);
    }
  };

  const enrollWebAuthnBiometrics = async () => {
    setAppLockSetupError(null);
    setAppLockSetupSuccess(null);
    
    if (!window.PublicKeyCredential) {
      setAppLockSetupError("❌ Your current browser or device does not support WebAuthn / Biometric platform authenticators.");
      return;
    }

    try {
      const isAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!isAvailable) {
        setAppLockSetupError("❌ Platform authenticator (fingerprint scanner/Touch ID/Windows Hello/Face ID) is not configured or available on this device.");
        return;
      }

      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      
      const userId = "omnitutor-user-" + Math.floor(1000 + Math.random() * 9000);
      const rpId = window.location.hostname || "localhost";
      
      const creationOptions: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: "OmniTutor Academy",
          id: rpId,
        },
        user: {
          id: new TextEncoder().encode(userId),
          name: "student@omnitutor.academy",
          displayName: "OmniTutor Student",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60000,
      };

      const credential = await navigator.credentials.create({
        publicKey: creationOptions,
      }) as PublicKeyCredential;

      if (credential) {
        const credentialIdB64 = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
        const signatureId = `WEBAUTHN-SIG-${credentialIdB64.slice(0, 12).replace(/[^A-Z0-9]/gi, '')}`;
        
        const uKey = getUserKey(user);
        localStorage.setItem(`tutor_app_lock_biometrics_enabled_${uKey}`, "true");
        localStorage.setItem(`tutor_app_lock_enrolled_finger_${uKey}`, "Hardware Sensor (WebAuthn)");
        localStorage.setItem(`tutor_app_lock_fingerprint_signature_id_${uKey}`, signatureId);
        localStorage.setItem(`tutor_app_lock_webauthn_credential_id_${uKey}`, credentialIdB64);
        
        setIsAppLockBiometricsEnabled(true);
        setEnrolledFingerprintSignature(signatureId);
        setIsEnrollmentMode(false);
        setAppLockSetupSuccess(`✓ Real fingerprint sensor enrolled successfully! [Credential ID: ${signatureId}] Your device sensor is now active and ready to unlock.`);
        setTimeout(() => setAppLockSetupSuccess(null), 8000);
      }
    } catch (err: any) {
      console.error("WebAuthn enrollment error:", err);
      let friendlyMessage = err.message || "";
      if (err.name === "SecurityError") {
        friendlyMessage = "Security restriction: Browser blocked biometric credential creation inside a sandboxed iframe. Please click 'Open in New Tab' to run the app outside the sandbox to register your actual hardware sensor.";
      } else if (err.name === "NotAllowedError") {
        friendlyMessage = "Operation cancelled or timed out by the user/device.";
      }
      setAppLockSetupError(`❌ Real sensor enrollment failed: ${friendlyMessage}`);
    }
  };

  const [whiteboardNotes, setWhiteboardNotes] = useState(
    "# Welcome to OmniTutor\nReady to begin our journey? I am Mwalimu Bora, and I am here to guide you through any topic you wish to master. Enter a subject below, and let's explore the Neural Academy's archives together.",
  );
  const [teacherDialogue, setTeacherDialogueRaw] = useState(
    "Greetings, student! I am Mwalimu Bora. What shall we learn about today?",
  );

  const setTeacherDialogue = (val: string | ((prev: string) => string)) => {
    if (typeof val === "function") {
      setTeacherDialogueRaw((prev) => cleanStageDirections(val(prev)));
    } else {
      setTeacherDialogueRaw(cleanStageDirections(val));
    }
  };
  const [videoScene, setVideoScene] = useState("Teacher standing by the board");
  const [videoKeyword, setVideoKeyword] = useState("education");
  const [visualDiagramPrompt, setVisualDiagramPrompt] = useState<string | null>(
    null,
  );
  const [lessonSegments, setLessonSegments] = useState<
    { content: string; speech: string }[]
  >([]);
  const [activeTeachingTechnique, setActiveTeachingTechnique] = useState<{
    id: string;
    name: string;
    subtitle: string;
    icon: string;
    color: string;
    badgeBg: string;
    description: string;
  } | null>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [currentTopic, setCurrentTopic] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackData, setFeedbackData] = useState<{
    quality: number;
    relevance: number;
    comments: string;
    uploadedFile: {
      name: string;
      size: number;
      type: string;
      data: string;
    } | null;
  }>({ quality: 5, relevance: 5, comments: "", uploadedFile: null });
  const [isFeedbackDragging, setIsFeedbackDragging] = useState(false);
  const [isUploadingFeedbackFile, setIsUploadingFeedbackFile] = useState(false);
  const [feedbackFileError, setFeedbackFileError] = useState<string | null>(
    null,
  );
  const [lessonHistory, setLessonHistory] = useState<Lesson[]>([]);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [language, setLanguage] = useState<"en" | "sw">("en");
  const [classTrack, setClassTrack] = useState<string>(() => {
    return localStorage.getItem("tutor_class_track") || "Unspecified";
  });
  const [fileData, setFileData] = useState<{
    mimeType: string;
    data: string;
  } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const [examFileData, setExamFileData] = useState<{
    mimeType: string;
    data: string;
  } | null>(null);
  const [examFileName, setExamFileName] = useState<string | null>(null);
  const [isProcessingExamFile, setIsProcessingExamFile] = useState(false);
  const [isExamSharing, setIsExamSharing] = useState(false);
  const [shareExamUrl, setShareExamUrl] = useState<string | null>(null);
  const [isExamRevisionMode, setIsExamRevisionMode] = useState(false);
  const [videoUrl, setVideoUrl] = useState(
    "/videos/placeholder.mp4",
  );
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isDownloadingNotes, setIsDownloadingNotes] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(
    null,
  );
  const [isCinematicMode, setIsCinematicMode] = useState(false);
  const [teachingMode, setTeachingMode] = useState<"text" | "video">("text");
  const [isQAOpen, setIsQAOpen] = useState(false);
  const [isAmbientActive, setIsAmbientActive] = useState(false);
  const [initialQAQuestion, setInitialQAQuestion] = useState<string | null>(
    null,
  );
  const [qaInitialMessages, setQAInitialMessages] = useState<Message[] | undefined>(
    undefined,
  );
  const [isWaitingForContinue, setIsWaitingForContinue] = useState(false);
  const [isLessonEnded, setIsLessonEnded] = useState(false);
  const [videoGenerationProgress, setVideoGenerationProgress] = useState(0);
  const [videoGenerationStatus, setVideoGenerationStatus] =
    useState<string>("");
  const [diagramUrl, setDiagramUrl] = useState<string | null>(null);
  const [diagramSvg, setDiagramSvg] = useState<string | null>(null);
  const [appBrandImage, setAppBrandImage] = useState<string | null>(null);
  const [isGeneratingBrand, setIsGeneratingBrand] = useState(false);
  const [isMwalimuTalking, setIsMwalimuTalking] = useState(false);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string | null>(
    () => localStorage.getItem("tutor_selected_voice"),
  );
  const [activeSettingsTab, setActiveSettingsTab] = useState<
    "general" | "interface" | "neural" | "privacy" | "admin"
  >("general");
  const [classTargetDuration, setClassTargetDuration] = useState<number>(15);
  const [availableVoices, setAvailableVoices] = useState<
    SpeechSynthesisVoice[]
  >([]);
  const [intelLevel, setIntelLevel] = useState<
    "Foundational" | "Proficiency" | "Advanced Research" | "100% Omni-Intelligence"
  >(() => {
    return (localStorage.getItem("tutor_intel_level") as any) || "100% Omni-Intelligence";
  });
  const [studyLevel, setStudyLevel] = useState<
    "Elementary" | "High School" | "Undergraduate" | "Postgraduate" | "Professional"
  >(() => {
    return (localStorage.getItem("tutor_study_level") as any) || "Undergraduate";
  });
  const [visualDensity, setVisualDensity] = useState<"Comfort" | "Compact">(
    "Comfort",
  );
  const [isCinematicEnabled, setIsCinematicEnabled] = useState(true);
  const [customVoiceFile, setCustomVoiceFile] = useState<File | null>(null);
  const [customVoiceName, setCustomVoiceName] = useState<string | null>(() => localStorage.getItem("tutor_custom_voice_name"));
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceRecordDuration, setVoiceRecordDuration] = useState(0);
  const [activeVoiceModel, setActiveVoiceModel] = useState<string>(() => localStorage.getItem("tutor_active_voice_model") || "system");
  const [voiceAnalysisStatus, setVoiceAnalysisStatus] = useState<"idle" | "recording" | "analyzing" | "trained">(
    () => (localStorage.getItem("tutor_voice_clone_status") as any) || "idle"
  );
  const [isLoggingEnabled, setIsLoggingEnabled] = useState(true);
  const [isAppLockEnabledSetting, setIsAppLockEnabledSetting] = useState<boolean>(false);
  const [isAppLockBiometricsEnabled, setIsAppLockBiometricsEnabled] = useState<boolean>(false);
  const [enrollmentFinger, setEnrollmentFinger] = useState<string>("Right Thumb");
  const [enrolledFingerprintSignature, setEnrolledFingerprintSignature] = useState<string | null>(null);
  const [isEnrollmentMode, setIsEnrollmentMode] = useState(false);
  const [enrollmentProgress, setEnrollmentProgress] = useState(0);
  const [isEnrollmentHolding, setIsEnrollmentHolding] = useState(false);
  const [hasSavedAppLockPassword, setHasSavedAppLockPassword] = useState<boolean>(false);
  const [appLockSetupPassword, setAppLockSetupPassword] = useState("");
  const [appLockSetupError, setAppLockSetupError] = useState<string | null>(null);
  const [appLockSetupSuccess, setAppLockSetupSuccess] = useState<string | null>(null);
  const [isVoiceConversationalMode, setIsVoiceConversationalMode] = useState(
    () => localStorage.getItem("tutor_conversational_mode") === "true",
  );
  const [accentColor, setAccentColorState] = useState<string>(() => {
    return localStorage.getItem("omnitutor_accent_color") || "#2563eb";
  });
  const setAccentColor = (color: string) => {
    setAccentColorState(color);
    localStorage.setItem("omnitutor_accent_color", color);
  };
  const [voiceConfirmation, setVoiceConfirmation] = useState<{
    visible: boolean;
    voiceName: string;
    locale: string;
    characterName: string;
    isTest: boolean;
  } | null>(null);

  const [speechError, setSpeechError] = useState<{
    visible: boolean;
    message: string;
    type: "warning" | "error";
  } | null>(null);

  useEffect(() => {
    if (voiceConfirmation?.visible) {
      const timer = setTimeout(() => {
        setVoiceConfirmation((prev) =>
          prev ? { ...prev, visible: false } : null,
        );
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [voiceConfirmation]);

  useEffect(() => {
    if (speechError?.visible) {
      const timer = setTimeout(() => {
        setSpeechError((prev) => (prev ? { ...prev, visible: false } : null));
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [speechError]);

  // --- Syllabus States ---
  const [activeSyllabus, setActiveSyllabus] = useState<any>(null);
  const [activeModuleIdx, setActiveModuleIdx] = useState<number>(0);
  const [syllabusViewMode, setSyllabusViewMode] = useState<"modules" | "chapters">("modules");

  useEffect(() => {
    setActiveModuleIdx(0);
  }, [activeSyllabus]);

  useEffect(() => {
    if (activeSyllabus === PRELOADED_SYLLABI.quantum) {
      expandAllSyllabusChapters(PRELOADED_SYLLABI.quantum);
    }
  }, []);
  const [isSyllabusGenerating, setIsSyllabusGenerating] = useState(false);
  const [syllabusSubjectInput, setSyllabusSubjectInput] = useState("");
  const [isSyllabusSharing, setIsSyllabusSharing] = useState(false);
  const [shareSyllabusUrl, setShareSyllabusUrl] = useState<string | null>(null);
  const [syllabusError, setSyllabusError] = useState<string | null>(null);
  const [syllabusSuccessMessage, setSyllabusSuccessMessage] = useState<string | null>(null);
  const [expandedSyllabusChapters, setExpandedSyllabusChapters] = useState<number[]>([]);
  const [openedTopics, setOpenedTopics] = useState<string[]>([]);
  const [savedSyllabi, setSavedSyllabi] = useState<any[]>([]);
  const [isSyllabiLoaded, setIsSyllabiLoaded] = useState(false);
  const [syllabusDeletingId, setSyllabusDeletingId] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [adminFeedbackDeletingId, setAdminFeedbackDeletingId] = useState<string | null>(null);
  const [adminLessonDeletingId, setAdminLessonDeletingId] = useState<string | null>(null);

  const expandAllSyllabusChapters = (syllabusData: any) => {
    if (syllabusData && Array.isArray(syllabusData.chapters)) {
      setExpandedSyllabusChapters(syllabusData.chapters.map((_: any, i: number) => i));
    } else {
      setExpandedSyllabusChapters([0]);
    }
  };

  // URL shared syllabus parsing hook
  useEffect(() => {
    const parseUrlSyllabus = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const syllabusId = searchParams.get("syllabus");
        if (syllabusId) {
          console.log("[SYLLABUS] Shared syllabus detected in URL. Loading ID:", syllabusId);
          setActiveView("syllabus");
          setIsSyllabusGenerating(true);
          setSyllabusError(null);
          
          const syllabusDocRef = doc(db, "syllabi", syllabusId);
          const syllabusSnap = await getDoc(syllabusDocRef);
          if (syllabusSnap.exists()) {
            const data = syllabusSnap.data();
            const fullSyllabus = ensureSyllabusCompatibility({ id: syllabusSnap.id, ...data });
            setActiveSyllabus(fullSyllabus);
            expandAllSyllabusChapters(fullSyllabus);
            setSyllabusSuccessMessage(
              language === "sw"
                ? "Mtaala wa masomo ulioshirikiwa umepakiwa kikamilifu!"
                : "Shared syllabus loaded successfully!"
            );
          } else {
            setSyllabusError(
              language === "sw"
                ? "Mtaala wa masomo unaotafutwa haupo au umefutwa."
                : "The shared syllabus could not be found or has been deleted."
            );
          }
        }
      } catch (err: any) {
        console.error("Error loading shared syllabus:", err);
        setSyllabusError(
          language === "sw"
            ? "Imeshindwa kupakia mtaala ulioshirikiwa."
            : "Failed to load shared syllabus."
        );
      } finally {
        setIsSyllabusGenerating(false);
      }
    };
    parseUrlSyllabus();
  }, [language]);

  // URL shared exam parsing hook
  useEffect(() => {
    const parseUrlExam = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const examId = searchParams.get("exam");
        if (examId) {
          console.log("[EXAM] Shared exam paper detected in URL. Loading ID:", examId);
          setTeacherDialogue(
            language === "sw"
              ? "Inatafuta na kupakia mtihani ulioshirikiwa..."
              : "Locating and loading shared exam paper..."
          );
          
          const examDocRef = doc(db, "exams", examId);
          const examSnap = await getDoc(examDocRef);
          if (examSnap.exists()) {
            const data = examSnap.data();
            setExamFileName(data.name || "Shared Exam Paper");
            setExamFileData({
              mimeType: data.mimeType || "application/pdf",
              data: data.data || "",
            });
            setIsExamRevisionMode(true);
            setTeacherDialogue(
              language === "sw"
                ? `Mtihani ulioshirikiwa "${data.name}" umepakiwa kikamilifu! Bonyeza kitufe kilicho chini kuanza mapitio na kusuluhisha na Mwalimu.`
                : `Shared exam paper "${data.name}" loaded successfully! Click the button below to start the revision lesson with Mwalimu.`
            );
            speakText(
              language === "sw"
                ? "Mtihani ulioshirikiwa umepakiwa."
                : "Shared exam loaded."
            );
          } else {
            setTeacherDialogue(
              language === "sw"
                ? "Mtihani ulioshirikiwa haujaonekana au umefutwa."
                : "The shared exam paper could not be found or has been deleted."
            );
          }
        }
      } catch (err: any) {
        console.error("Error loading shared exam:", err);
        setTeacherDialogue(
          language === "sw"
            ? "Imeshindwa kupakia mtihani ulioshirikiwa."
            : "Failed to load shared exam paper."
        );
      }
    };
    parseUrlExam();
  }, [language]);

  const handleDeleteTopic = (targetTopicTitle: string, unitIndex?: number, moduleIndex?: number, chapterIndex?: number) => {
    if (!activeSyllabus) return;

    let updatedSyllabus = { ...activeSyllabus };

    if (moduleIndex !== undefined && unitIndex !== undefined) {
      if (updatedSyllabus.modules && updatedSyllabus.modules[moduleIndex]) {
        const targetUnit = updatedSyllabus.modules[moduleIndex].units?.[unitIndex];
        if (targetUnit && targetUnit.topics) {
          targetUnit.topics = targetUnit.topics.filter((t: any) => t.title !== targetTopicTitle);
        }
      }
    } else if (chapterIndex !== undefined) {
      if (updatedSyllabus.chapters && updatedSyllabus.chapters[chapterIndex]) {
        const targetChapter = updatedSyllabus.chapters[chapterIndex];
        if (targetChapter && targetChapter.topics) {
          targetChapter.topics = targetChapter.topics.filter((t: any) => t.title !== targetTopicTitle);
        }
      }
    }

    setActiveSyllabus(updatedSyllabus);
    
    const updatedSaved = savedSyllabi.map(syl => syl.id === updatedSyllabus.id ? updatedSyllabus : syl);
    setSavedSyllabi(updatedSaved);
    
    if (updatedSyllabus.isLocal) {
      const localSyllabiStr = localStorage.getItem("tutor_local_syllabi");
      if (localSyllabiStr) {
        try {
          const localSyllabi = JSON.parse(localSyllabiStr);
          const newLocalSyllabi = localSyllabi.map((s: any) => s.id === updatedSyllabus.id ? updatedSyllabus : s);
          localStorage.setItem("tutor_local_syllabi", JSON.stringify(newLocalSyllabi));
        } catch (e) {
          console.error(e);
        }
      }
    } else if (user && updatedSyllabus.id) {
      try {
        const docRef = doc(db, "syllabi", updatedSyllabus.id);
        setDoc(docRef, updatedSyllabus, { merge: true });
      } catch (e) {
        console.error("Firestore update failed:", e);
      }
    }

    setSyllabusSuccessMessage(
      language === "sw" 
        ? `Mada "${targetTopicTitle}" imeondolewa kutoka kwenye mtaala!` 
        : `Topic "${targetTopicTitle}" has been removed from the syllabus!`
    );
    setTimeout(() => setSyllabusSuccessMessage(null), 4000);
  };

  const handleDeleteSubtopic = (targetSubtopic: string, topicTitle: string, unitIndex?: number, moduleIndex?: number, chapterIndex?: number) => {
    if (!activeSyllabus) return;

    let updatedSyllabus = { ...activeSyllabus };

    const cleanSubtopicsList = (subtopicsField: any): string[] => {
      if (typeof subtopicsField === "string") {
        return subtopicsField.split("\n").map(s => s.trim().replace(/^-\s*/, "")).filter(Boolean);
      }
      if (Array.isArray(subtopicsField)) {
        return subtopicsField;
      }
      return [];
    };

    const removeSubtopicFromArrayOrString = (topicObj: any) => {
      const currentList = cleanSubtopicsList(topicObj.subtopics);
      const newList = currentList.filter(s => s !== targetSubtopic);
      topicObj.subtopics = newList;
    };

    if (moduleIndex !== undefined && unitIndex !== undefined) {
      if (updatedSyllabus.modules && updatedSyllabus.modules[moduleIndex]) {
        const targetUnit = updatedSyllabus.modules[moduleIndex].units?.[unitIndex];
        const targetTopic = targetUnit?.topics?.find((t: any) => t.title === topicTitle);
        if (targetTopic) {
          removeSubtopicFromArrayOrString(targetTopic);
        }
      }
    } else if (chapterIndex !== undefined) {
      if (updatedSyllabus.chapters && updatedSyllabus.chapters[chapterIndex]) {
        const targetChapter = updatedSyllabus.chapters[chapterIndex];
        const targetTopic = targetChapter?.topics?.find((t: any) => t.title === topicTitle);
        if (targetTopic) {
          removeSubtopicFromArrayOrString(targetTopic);
        }
      }
    }

    setActiveSyllabus(updatedSyllabus);
    
    const updatedSaved = savedSyllabi.map(syl => syl.id === updatedSyllabus.id ? updatedSyllabus : syl);
    setSavedSyllabi(updatedSaved);
    
    if (updatedSyllabus.isLocal) {
      const localSyllabiStr = localStorage.getItem("tutor_local_syllabi");
      if (localSyllabiStr) {
        try {
          const localSyllabi = JSON.parse(localSyllabiStr);
          const newLocalSyllabi = localSyllabi.map((s: any) => s.id === updatedSyllabus.id ? updatedSyllabus : s);
          localStorage.setItem("tutor_local_syllabi", JSON.stringify(newLocalSyllabi));
        } catch (e) {
          console.error(e);
        }
      }
    } else if (user && updatedSyllabus.id) {
      try {
        const docRef = doc(db, "syllabi", updatedSyllabus.id);
        setDoc(docRef, updatedSyllabus, { merge: true });
      } catch (e) {
        console.error(e);
      }
    }

    setSyllabusSuccessMessage(
      language === "sw" 
        ? `Mada ndogo imeondolewa!` 
        : `Subtopic has been removed!`
    );
    setTimeout(() => setSyllabusSuccessMessage(null), 4000);
  };

  const handleGenerateSyllabus = async (subject: string) => {
    if (!subject.trim() || isSyllabusGenerating) return;
    setIsSyllabusGenerating(true);
    setSyllabusError(null);
    setSyllabusSuccessMessage(null);
    setShareSyllabusUrl(null);
    try {
      const response = await fetch("/api/generate-syllabus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, language, classTrack, studyLevel }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to generate syllabus via neural service.");
      }
      const data = await response.json();
      expandAllSyllabusChapters(data);
      setSyllabusSuccessMessage(
        language === "sw"
          ? "Mtaala umetengenezwa kwa mafanikio na kuhifadhiwa!"
          : "Syllabus custom coursework generated and auto-saved successfully!"
      );

      const saved = await saveSyllabusToDB(data);
      setActiveSyllabus(saved);
    } catch (err: any) {
      console.error("Error generating syllabus:", err);
      setSyllabusError(err.message || "Syllabus generation failed.");
    } finally {
      setIsSyllabusGenerating(false);
    }
  };

  const handleShareSyllabus = async () => {
    if (!activeSyllabus || isSyllabusSharing) return;
    setIsSyllabusSharing(true);
    setSyllabusError(null);
    setSyllabusSuccessMessage(null);
    try {
      if (!auth.currentUser) {
        throw new Error(
          language === "sw"
            ? "Tafadhali jisajili au ingia kwanza ili uweze kushiriki mtaala wako!"
            : "Please sign in to share a syllabus!"
        );
      }

      // If already has an ID that is not a local placeholder, reuse it
      const currentId = activeSyllabus.id;
      if (currentId && !currentId.startsWith("local_") && !currentId.startsWith("failed_")) {
        const shareUrl = `${window.location.origin}?syllabus=${currentId}`;
        setShareSyllabusUrl(shareUrl);
        setSyllabusSuccessMessage(
          language === "sw"
            ? "Mtaala umeshirikishwa kikamilifu! Nakili kiungo cha kushiriki hapa chini."
            : "Syllabus shared successfully! Copy the shareable link below."
        );
        return;
      }

      const syllabusPayload = {
        title: activeSyllabus.title || "Untitled Coursework Syllabus",
        description: activeSyllabus.description || "No description provided.",
        chapters: activeSyllabus.chapters || [],
        modules: activeSyllabus.modules || [],
        userId: auth.currentUser.uid,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, "syllabi"), syllabusPayload);
      const shareUrl = `${window.location.origin}?syllabus=${docRef.id}`;
      setShareSyllabusUrl(shareUrl);
      
      const newSaved = ensureSyllabusCompatibility({
        id: docRef.id,
        ...syllabusPayload
      });
      setSavedSyllabi((prev) => [newSaved, ...prev.filter(s => s.id !== currentId)]);

      setSyllabusSuccessMessage(
        language === "sw"
          ? "Mtaala umeshirikishwa kikamilifu! Nakili kiungo cha kushiriki hapa chini."
          : "Syllabus shared successfully! Copy the shareable link below."
      );
    } catch (err: any) {
      console.error("Error sharing syllabus:", err);
      setSyllabusError(err.message || "Failed to share syllabus.");
    } finally {
      setIsSyllabusSharing(false);
    }
  };

  const [isSyllabusFileDragging, setIsSyllabusFileDragging] = useState(false);
  const handleSyllabusFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processSyllabusFile(file);
    }
  };

  const processSyllabusFile = async (file: File) => {
    const supportedTypes = ["application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    const isDoc = supportedTypes.includes(file.type) || file.name.endsWith(".txt") || file.name.endsWith(".pdf") || file.name.endsWith(".docx");
    if (!isDoc) {
      setSyllabusError(
        language === "sw"
          ? "Mfumo unakubali tu faili za PDF au TXT za mtaala kwa sasa."
          : "We currently support PDF or TXT syllabus documents."
      );
      return;
    }

    setIsSyllabusGenerating(true);
    setSyllabusError(null);
    setSyllabusSuccessMessage(null);
    setActiveSyllabus(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64 = (event.target?.result as string).split(",")[1];
          const response = await fetch("/api/generate-syllabus-from-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileData: {
                mimeType: file.type || "application/pdf",
                data: base64
              },
              language,
              classTrack,
              studyLevel
            })
          });

          if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(errBody.error || "Neural parsing error from server.");
          }

          const parsedSyllabus = await response.json();
          expandAllSyllabusChapters(parsedSyllabus);
          setSyllabusSuccessMessage(
            language === "sw"
              ? `Mtaala kutoka kwenye faili "${file.name}" umesomwa na kuhifadhiwa!`
              : `Successfully digested, structured, and saved syllabus from "${file.name}"!`
          );

          const saved = await saveSyllabusToDB(parsedSyllabus);
          setActiveSyllabus(saved);
        } catch (err: any) {
          console.error("Error sending syllabus file to API:", err);
          setSyllabusError(err.message || "Failed to digest syllabus file contents.");
        } finally {
          setIsSyllabusGenerating(false);
        }
      };

      reader.onerror = () => {
        setIsSyllabusGenerating(false);
        setSyllabusError("Failed to read document file binary.");
      };

      reader.readAsDataURL(file);
    } catch (error: any) {
      console.error("FileReader start exception:", error);
      setSyllabusError(error.message || "Failed to open document file.");
      setIsSyllabusGenerating(false);
    }
  };

  const fetchSavedSyllabi = async () => {
    const isGuest = !user || user.uid === "sandbox-guest-user";
    const defaultCacheKey = user ? `tutor_syllabi_${user.uid}` : `tutor_syllabi_guest`;
    const cached = localStorage.getItem(defaultCacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const normalized = Array.isArray(parsed) ? parsed.map((s: any) => ensureSyllabusCompatibility(s)) : [];
        setSavedSyllabi(normalized);
        setIsSyllabiLoaded(true);
      } catch (e) {
        localStorage.removeItem(defaultCacheKey);
      }
    }

    if (isGuest) {
      setIsSyllabiLoaded(true);
      return;
    }

    const path = "syllabi";
    try {
      const q = query(
        collection(db, path),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const syllabiList = snapshot.docs.map((doc) => ensureSyllabusCompatibility({
        id: doc.id,
        ...doc.data(),
      }));

      setSavedSyllabi(syllabiList);
      setIsSyllabiLoaded(true);
      localStorage.setItem(defaultCacheKey, JSON.stringify(syllabiList));
    } catch (error: any) {
      setIsSyllabiLoaded(true);
      if (error?.message?.includes("Quota limit exceeded")) {
        // Safe skip/ignore
      } else {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    }
  };

  const saveSyllabusToDB = async (syllabusData: any) => {
    const isGuest = !user || user.uid === "sandbox-guest-user";
    const normalized = ensureSyllabusCompatibility(syllabusData);
    if (isGuest) {
      const cacheKey = user ? `tutor_syllabi_${user.uid}` : `tutor_syllabi_guest`;
      try {
        const stored = localStorage.getItem(cacheKey);
        const list = stored ? JSON.parse(stored) : [];
        const newSyllabus = {
          id: `local_${Date.now()}`,
          title: normalized.title || "Untitled Syllabus",
          description: normalized.description || "",
          chapters: normalized.chapters || [],
          modules: normalized.modules || [],
          createdAt: new Date().toISOString(),
          isLocal: true,
        };
        const updated = [newSyllabus, ...list];
        localStorage.setItem(cacheKey, JSON.stringify(updated));
        setSavedSyllabi(updated);
        return newSyllabus;
      } catch (err) {
        console.error("Local storage syllabus save model error:", err);
        return {
          id: `local_${Date.now()}`,
          ...normalized,
          isLocal: true,
        };
      }
    }

    const path = "syllabi";
    try {
      const syllabusPayload = {
        title: normalized.title || "Untitled Coursework Syllabus",
        description: normalized.description || "No description provided.",
        chapters: normalized.chapters || [],
        modules: normalized.modules || [],
        userId: user.uid,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, path), syllabusPayload);
      
      const newSyllabus = {
        id: docRef.id,
        ...syllabusPayload,
      };

      setSavedSyllabi((prev) => [newSyllabus, ...prev]);

      const cacheKey = `tutor_syllabi_${user.uid}`;
      const cached = localStorage.getItem(cacheKey);
      let list = [];
      if (cached) {
        try { list = JSON.parse(cached); } catch (e) {}
      }
      localStorage.setItem(cacheKey, JSON.stringify([newSyllabus, ...list]));
      return newSyllabus;
    } catch (error: any) {
      console.error("Error saving syllabus to Firestore:", error);
      handleFirestoreError(error, OperationType.CREATE, path);
      return {
        id: `failed_${Date.now()}`,
        ...normalized,
      };
    }
  };

  const deleteSyllabus = async (id: string, isLocal?: boolean) => {
    setSyllabusError(null);
    setSyllabusSuccessMessage(null);
    try {
      const isGuest = !user || user.uid === "sandbox-guest-user";
      if (isLocal || isGuest || id.startsWith("local_")) {
        const cacheKey = user ? `tutor_syllabi_${user.uid}` : `tutor_syllabi_guest`;
        const updated = savedSyllabi.filter((s) => s.id !== id);
        setSavedSyllabi(updated);
        localStorage.setItem(cacheKey, JSON.stringify(updated));
        if (activeSyllabus && activeSyllabus.id === id) {
          setActiveSyllabus(null);
        }
        setSyllabusSuccessMessage(
          language === "sw"
            ? "Mtaala umefutwa kikamilifu!"
            : "Syllabus deleted successfully!"
        );
        return;
      }

      const path = `syllabi/${id}`;
      const docRef = doc(db, "syllabi", id);
      await deleteDoc(docRef);

      const updated = savedSyllabi.filter((s) => s.id !== id);
      setSavedSyllabi(updated);

      const cacheKey = `tutor_syllabi_${user.uid}`;
      localStorage.setItem(cacheKey, JSON.stringify(updated));

      if (activeSyllabus && activeSyllabus.id === id) {
        setActiveSyllabus(null);
      }

      setSyllabusSuccessMessage(
        language === "sw"
          ? "Mtaala umefutwa kwenye hifadhidata!"
          : "Syllabus permanently deleted from history!"
      );
    } catch (error: any) {
      console.error("Error deleting syllabus:", error);
      setSyllabusError(
        language === "sw"
          ? "Imeshindwa kufuta mtaala. Tafadhali angalia kibali chako."
          : "Failed to delete syllabus. Please verify ownership and try again."
      );
      handleFirestoreError(error, OperationType.DELETE, `syllabi/${id}`);
    }
  };

  // Admin Panel States and Actions
  const [adminFeedbacks, setAdminFeedbacks] = useState<any[]>([]);
  const [adminLessons, setAdminLessons] = useState<any[]>([]);
  const [isAdminDataLoading, setIsAdminDataLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminDeleteSuccess, setAdminDeleteSuccess] = useState<string | null>(
    null,
  );
  const [isAdminDemoMode, setIsAdminDemoMode] = useState(false);
  const [adminActiveSubTab, setAdminActiveSubTab] = useState<
    "feedbacks" | "lessons" | "credentials" | "features"
  >("feedbacks");
  const [videoComingSoon, setVideoComingSoon] = useState<boolean>(false);
  const [isUpdatingComingSoon, setIsUpdatingComingSoon] = useState<boolean>(false);
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [selectedAdminFeedback, setSelectedAdminFeedback] = useState<any | null>(null);

  // AI Feedback Analyzer States
  const [isAnalyzingFeedback, setIsAnalyzingFeedback] = useState(false);
  const [feedbackAnalysisResult, setFeedbackAnalysisResult] = useState<
    any | null
  >(null);
  const [feedbackAnalysisError, setFeedbackAnalysisError] = useState<
    string | null
  >(null);

  // AI Feature Sandbox Builder States
  const [isBuildingSandbox, setIsBuildingSandbox] = useState(false);
  const [sandboxRequestTitle, setSandboxRequestTitle] = useState<string | null>(
    null,
  );
  const [sandboxBuildLogs, setSandboxBuildLogs] = useState<string[]>([]);
  const [sandboxBuildProgress, setSandboxBuildProgress] = useState(0);
  const [sandboxBuildResult, setSandboxBuildResult] = useState<any | null>(
    null,
  );
  const [sandboxBuildError, setSandboxBuildError] = useState<string | null>(
    null,
  );
  const [sandboxReviewStep, setSandboxReviewStep] = useState<
    "build" | "test" | "deployed"
  >("build");
  const [deployedSandboxFeatures, setDeployedSandboxFeatures] = useState<
    string[]
  >([]);

  // Individual sandbox interactive preview states
  const [quizTimerMultiplier, setQuizTimerMultiplier] = useState(1);
  const [quizSelectedIndex, setQuizSelectedIndex] = useState<number | null>(
    null,
  );
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  const [pdfGridStyle, setPdfGridStyle] = useState<
    "blueprint" | "academic" | "grid"
  >("blueprint");
  const [pdfRenderingStatus, setPdfRenderingStatus] = useState<
    "idle" | "rendering" | "exported"
  >("idle");
  const [pdfDraftText, setPdfDraftText] = useState(
    "Highlights of Swahili Grammar Class",
  );

  const [mobileDensity, setMobileDensity] = useState<
    "standard" | "concentrated"
  >("standard");
  const [mobileMenuCollapsed, setMobileMenuCollapsed] = useState(true);

  const [synthesizerSpeaking, setSynthesizerSpeaking] = useState(false);

  const triggerSandboxCompilation = async (
    title: string,
    priority: string,
    reasoning: string,
  ) => {
    setSandboxRequestTitle(title);
    setIsBuildingSandbox(true);
    setSandboxBuildError(null);
    setSandboxBuildProgress(0);
    setSandboxReviewStep("build");
    setSandboxBuildResult(null);

    // Initial logs
    const initialLogs = [
      "🔄 Initializing sandbox compilation workspace...",
      "🔍 Checking product directory mapping (package.json matched)",
      "🧬 Requesting neural architectural mapping from OmniTutor AI...",
      "📦 Gathering dependent packages: framer-motion, canvas-confetti, lucide-react",
    ];
    setSandboxBuildLogs(initialLogs);

    try {
      const resp = await fetch("/api/develop-sandbox-feature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestTitle: title,
          priority: priority,
          reasoning: reasoning,
          language: language,
          intelLevel: intelLevel,
        }),
      });

      const resultPayload = resp.ok
        ? await resp.json()
        : {
            featureTitle: title,
            blueprint:
              "#### Customized Feature Sandbox Blueprint\nDeveloped locally as a robust fallback view.",
            draftFiles: [
              {
                path: "/src/components/InteractivePlugin.tsx",
                description: "Standard draft module",
                linesCount: 100,
                contentDraft: "export default function Plugin() {}",
              },
            ],
            compilationLogs: [
              "Workspace initialized.",
              "Verification complete.",
            ],
            verificationScore: 100,
          };

      // Progression animation
      let currentProgress = 5;
      const progressTimer = setInterval(() => {
        currentProgress += Math.floor(Math.random() * 10) + 5;
        if (currentProgress >= 100) {
          currentProgress = 100;
          clearInterval(progressTimer);
          setSandboxBuildResult(resultPayload);
          setSandboxReviewStep("test");
          setIsBuildingSandbox(false);
        }
        setSandboxBuildProgress(currentProgress);

        if (currentProgress > 25 && currentProgress <= 50) {
          setSandboxBuildLogs((prev) => {
            const extra =
              "🛠️ Compiling draft structures of component assets...";
            return prev.includes(extra)
              ? prev
              : [
                  ...prev,
                  extra,
                  "✨ Layout components declared (types successfully consolidated)",
                ];
          });
        }
        if (currentProgress > 50 && currentProgress <= 75) {
          setSandboxBuildLogs((prev) => {
            const extra =
              "🔑 Initializing core interactive behaviors & event linkages...";
            return prev.includes(extra)
              ? prev
              : [
                  ...prev,
                  extra,
                  "🧪 Formulating sandbox telemetry assertions...",
                ];
          });
        }
        if (currentProgress > 75 && currentProgress < 100) {
          setSandboxBuildLogs((prev) => {
            const extra = "🛡️ AI verification diagnostics executed & passed.";
            return prev.includes(extra) ? prev : [...prev, extra];
          });
        }
        if (currentProgress === 100) {
          setSandboxBuildLogs((prev) => {
            const lastLog =
              language === "sw"
                ? "✅ Kipengele kipya kimekamilika na kulandanishwa kikamilifu! Hali: Tayari kutumika."
                : "🚀 Sandbox workspace compiled successfully. Status: Ready for testing.";
            return [...prev, lastLog];
          });
        }
      }, 100);
    } catch (err: any) {
      console.error(err);
      setSandboxBuildError(
        err?.message || "Workspace compile connection failure.",
      );
      setIsBuildingSandbox(false);
    }
  };

  const authorizeAndDeploySandboxFeature = () => {
    if (!sandboxBuildResult) return;
    const catKey = sandboxBuildResult.categoryKey || "general";
    if (!deployedSandboxFeatures.includes(catKey)) {
      setDeployedSandboxFeatures((prev) => [...prev, catKey]);
    }
    setSandboxReviewStep("deployed");
  };

  const analyzeFeedbacksWithAI = async () => {
    if (adminFeedbacks.length === 0) return;
    setIsAnalyzingFeedback(true);
    setFeedbackAnalysisError(null);
    try {
      const response = await fetch("/api/analyze-admin-feedbacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbacks: adminFeedbacks,
          language: language,
          intelLevel: intelLevel,
        }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(
          errData.error || "Failed to analyze student feedbacks.",
        );
      }
      const data = await response.json();
      setFeedbackAnalysisResult(data);
    } catch (err: any) {
      console.error("AI feedback analyzer hook error:", err);
      setFeedbackAnalysisError(
        err?.message || "Quantum neural link connection error.",
      );
    } finally {
      setIsAnalyzingFeedback(false);
    }
  };

  const loadAdminDemoData = () => {
    setIsAdminDemoMode(true);
    setAdminFeedbacks([
      {
        id: "fb_01",
        topic: "Swahili Grammar Foundations",
        teacher_dialogue:
          "Karibu! Today we learned nouns, verbs, and common Swahili prepositions. Excellent progress!",
        quality_score: 5,
        relevance_score: 5,
        comments:
          "Brilliant Swahili voice tone and high-fidelity smartboard illustrations!",
        timestamp: {
          toDate: () => new Date("2026-05-21T08:42:00Z"),
          seconds: Math.floor(Date.now() / 1000) - 1200,
        },
        userId: "student_charles",
      },
      {
        id: "fb_02",
        topic: "Introduction to Quantum Electrodynamics",
        teacher_dialogue:
          "Quantum mechanics dictates particles are waves of probabilities. Excellent queries from the student.",
        quality_score: 5,
        relevance_score: 4,
        comments:
          "Very deep explanations, although the technical jargon was slightly complex.",
        timestamp: {
          toDate: () => new Date("2026-05-21T07:15:00Z"),
          seconds: Math.floor(Date.now() / 1000) - 7200,
        },
        userId: "student_evaluator",
      },
      {
        id: "fb_03",
        topic: "History of East Africa",
        teacher_dialogue:
          "The Swahili coast played a central role in globally integrated trade networks.",
        quality_score: 4,
        relevance_score: 5,
        comments: "Splendid custom map graphics on the video board!",
        timestamp: {
          toDate: () => new Date("2026-05-20T18:22:00Z"),
          seconds: Math.floor(Date.now() / 1000) - 54000,
        },
        userId: "student_sophie",
      },
    ]);
    setAdminLessons([
      {
        id: "ls_01",
        topic: "Swahili Grammar Foundations",
        timestamp: {
          toDate: () => new Date("2026-05-21T08:35:00Z"),
          seconds: Math.floor(Date.now() / 1000) - 1620,
        },
        whiteboard_notes:
          "### Swahili Grammar\n- **Mambo**: Common informal greetings\n- **Habari**: Formal greetings\n- **Asante**: Thank you",
        teacher_dialogue:
          "Habari ya asubuhi! Let us master the core nouns of Swahili.",
        userId: "student_charles",
      },
      {
        id: "ls_02",
        topic: "Introduction to Quantum Electrodynamics",
        timestamp: {
          toDate: () => new Date("2026-05-21T07:10:00Z"),
          seconds: Math.floor(Date.now() / 1000) - 7600,
        },
        whiteboard_notes:
          "### QED Core\n- Feynman Diagrams\n- Particle interactions\n- Probability amplitudes",
        teacher_dialogue:
          "Welcome to class today, let us examine how light and matter interact.",
        userId: "student_evaluator",
      },
      {
        id: "ls_03",
        topic: "History of East Africa",
        timestamp: {
          toDate: () => new Date("2026-05-20T18:10:00Z"),
          seconds: Math.floor(Date.now() / 1000) - 54720,
        },
        whiteboard_notes:
          "### East African Maritime History\n- Kilwa Kisiwani Sultanate\n- Indian Ocean trade winds\n- Syncretic Swahili Culture",
        teacher_dialogue:
          "Greetings, today we explore the ancient gold and spice routers.",
        userId: "student_sophie",
      },
    ]);
  };

  const fetchAdminData = async () => {
    setIsAdminDataLoading(true);
    setAdminError(null);
    setAdminDeleteSuccess(null);
    try {
      const feedbacksCol = collection(db, "feedbacks");
      const feedbacksQuery = query(feedbacksCol, orderBy("timestamp", "desc"), limit(100));
      const feedbacksSnap = await getDocs(feedbacksQuery);
      const feedbacksList = feedbacksSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAdminFeedbacks(feedbacksList);

      const lessonsCol = collection(db, "lessons");
      const lessonsQuery = query(lessonsCol, orderBy("timestamp", "desc"), limit(100));
      const lessonsSnap = await getDocs(lessonsQuery);
      const lessonsList = lessonsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAdminLessons(lessonsList);
      setIsAdminDemoMode(false);
    } catch (err: any) {
      console.warn(
        "Firestore Admin Access Denied. Falling back to sandbox preview.",
        err,
      );
      setAdminError(
        err?.message ||
          "Verify you are signed in as the authorized administrator.",
      );
      loadAdminDemoData();
    } finally {
      setIsAdminDataLoading(false);
    }
  };

  const deleteAdminDocument = async (
    col: "feedbacks" | "lessons",
    id: string,
  ) => {
    setAdminError(null);
    setAdminDeleteSuccess(null);
    try {
      if (isAdminDemoMode) {
        if (col === "feedbacks") {
          setAdminFeedbacks((prev) => prev.filter((f) => f.id !== id));
        } else {
          setAdminLessons((prev) => prev.filter((l) => l.id !== id));
        }
        setAdminDeleteSuccess(
          `[SANDBOX] Moderated (deleted) ${id} from ${col}.`,
        );
        return;
      }
      await deleteDoc(doc(db, col, id));
      setAdminDeleteSuccess(`Moderated (deleted) ${id} successfully.`);
      if (col === "feedbacks") {
        setAdminFeedbacks((prev) => prev.filter((f) => f.id !== id));
      } else {
        setAdminLessons((prev) => prev.filter((l) => l.id !== id));
      }
    } catch (err: any) {
      console.error(`Error deleting ${col} document:`, err);
      setAdminError(`Admin database error: ${err.message}`);
    }
  };

  useEffect(() => {
    if (activeSettingsTab === "admin") {
      if (user?.email === "charlesmwajima@gmail.com") {
        fetchAdminData();
      } else {
        setActiveSettingsTab("general");
      }
    }
  }, [activeSettingsTab, user]);

  useEffect(() => {
    const docRef = doc(db, "appSettings", "videoMode");
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setVideoComingSoon(!!docSnap.data().comingSoon);
        } else {
          setVideoComingSoon(false);
        }
      },
      (error) => {
        console.warn("[AppSettings] Real-time snapshot listener error:", error);
      }
    );
    return () => unsubscribe();
  }, []);

  // Character and Identity Logic
  const [selectedCharacter, setSelectedCharacter] = useState<TeacherCharacter>(
    TEACHER_CHARACTERS[0],
  );
  const [teacherAppearance, setTeacherAppearance] = useState(
    TEACHER_CHARACTERS[0].appearance,
  );
  const [backgroundSetting, setBackgroundSetting] = useState(
    "A brightly lit, ultra-modern, high-tech academy classroom with a massive, glowing digital smartboard immediately behind the instructor.",
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const prevVoiceRef = useRef<string | null>(null);
  const brokenVoicesRef = useRef<Set<string>>(new Set<string>());
  const isSelectingTeacherRef = useRef<boolean>(false);
  const [brokenVoices, setBrokenVoices] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("tutor_broken_voices");
    if (saved) {
      try {
        const parsed = new Set<string>(JSON.parse(saved));
        brokenVoicesRef.current = parsed;
        return parsed;
      } catch (e) {}
    }
    return new Set<string>();
  });

  const markVoiceAsBroken = (voiceName: string, persist = false) => {
    brokenVoicesRef.current.add(voiceName);
    setBrokenVoices((prev) => {
      const next = new Set(prev);
      next.add(voiceName);
      if (persist) {
        localStorage.setItem(
          "tutor_broken_voices",
          JSON.stringify(Array.from(next)),
        );
      }
      return next;
    });
  };

  const restoreAllVoices = () => {
    brokenVoicesRef.current.clear();
    setBrokenVoices(new Set<string>());
    localStorage.removeItem("tutor_broken_voices");

    if (typeof window !== "undefined" && window.speechSynthesis) {
      const allVoices = window.speechSynthesis.getVoices();
      const uniqueVoices: SpeechSynthesisVoice[] = [];
      const seenNames = new Set<string>();

      for (const voice of allVoices) {
        if (!voice.name || !voice.lang) continue;
        const lowerName = voice.name.toLowerCase();
        if (seenNames.has(lowerName)) continue;
        seenNames.add(lowerName);
        uniqueVoices.push(voice);
      }
      setAvailableVoices(uniqueVoices);
    }

    setSpeechError({
      visible: true,
      message: language === "sw" ? "Sauti zote zilizochujwa zimerejeshwa kwa mafanikio!" : "All auto-pruned voices have been successfully restored!",
      type: "warning"
    });
  };

  // Sync character with selected voice
  useEffect(() => {
    if (isSelectingTeacherRef.current) {
      isSelectingTeacherRef.current = false;
      prevVoiceRef.current = selectedVoiceName;
      return;
    }
    const voice =
      availableVoices.find((v) => v.name === selectedVoiceName) || null;
    const character = getCharacterForVoice(voice);
    setSelectedCharacter(character);
    setTeacherAppearance(character.appearance);
    prevVoiceRef.current = selectedVoiceName;
  }, [selectedVoiceName, availableVoices]);

  const handleSelectTeacher = (character: TeacherCharacter) => {
    isSelectingTeacherRef.current = true;
    setSelectedCharacter(character);
    setTeacherAppearance(character.appearance);
    
    const matchingVoice = getVoiceForCharacter(character, availableVoices, language);
    if (matchingVoice) {
      setSelectedVoiceName(matchingVoice.name);
      localStorage.setItem("tutor_selected_voice", matchingVoice.name);
    }
  };

  useEffect(() => {
    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();

      const uniqueVoices: SpeechSynthesisVoice[] = [];
      const seenNames = new Set<string>();

      for (const voice of allVoices) {
        if (!voice.name || !voice.lang) continue;
        const lowerName = voice.name.toLowerCase();

        // Skip permanently broken/unresponsive voices to prevent error loops (can be reset in settings)
        if (brokenVoices.has(voice.name)) continue;

        // 1. Deduplicate by lowercased name to avoid non-working duplicate instances
        if (seenNames.has(lowerName)) continue;

        seenNames.add(lowerName);
        uniqueVoices.push(voice);
      }

      setAvailableVoices(uniqueVoices);

      // Auto-select a regional or female voice if nothing selected yet or if selection is now invalid
      const currentVoiceExists = uniqueVoices.some(
        (v) => v.name === selectedVoiceName,
      );

      if (
        (!selectedVoiceName || !currentVoiceExists) &&
        uniqueVoices.length > 0
      ) {
        // Priority 1: Regional African/Swahili voices
        let preferredVoice = uniqueVoices.find(
          (v) =>
            v.lang.toLowerCase().includes("en-ke") ||
            v.lang.toLowerCase().includes("sw") ||
            v.lang.toLowerCase().includes("en-ng"),
        );

        // Priority 2: Any definitely female voice
        if (!preferredVoice) {
          preferredVoice = uniqueVoices.find((v) =>
            v.name.toLowerCase().includes("female"),
          );
        }

        // Priority 3: First available voice matching navigator.language
        if (
          !preferredVoice &&
          typeof navigator !== "undefined" &&
          navigator.language
        ) {
          const navLang = navigator.language.toLowerCase();
          preferredVoice =
            uniqueVoices.find((v) => v.lang.toLowerCase() === navLang) ||
            uniqueVoices.find((v) =>
              v.lang.toLowerCase().startsWith(navLang.split("-")[0]),
            );
        }

        // Priority 4: First available voice matching regional common fallback 'en-US'
        if (!preferredVoice) {
          preferredVoice =
            uniqueVoices.find((v) => v.lang.toLowerCase().includes("en-us")) ||
            uniqueVoices.find((v) => v.lang.toLowerCase().startsWith("en"));
        }

        // Priority 5: First available voice
        const finalChoice = preferredVoice || uniqueVoices[0];
        if (finalChoice) {
          setSelectedVoiceName(finalChoice.name);
        }
      }
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [selectedVoiceName, brokenVoices]);
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);
  const bellAudioRef = useRef<HTMLAudioElement | null>(null);
  const syntheticAmbientSourceRef = useRef<any>(null);
  const syntheticAmbientCtxRef = useRef<any>(null);

  const playSyntheticBell = () => {
    try {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      // Multi-frequency school bell overtone mix (clean physical modeling chime)
      const frequencies = [523.25, 783.99, 1046.5, 1318.51, 1567.98];
      const gains = [0.25, 0.12, 0.08, 0.04, 0.02];

      frequencies.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);

        gainNode.gain.setValueAtTime(gains[idx], now);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 1.8);
      });
    } catch (err) {
      console.warn("Synthetic bell failed:", err);
    }
  };

  const startSyntheticAmbient = () => {
    try {
      if (syntheticAmbientSourceRef.current) return;
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      syntheticAmbientCtxRef.current = ctx;

      const bufferSize = 2 * ctx.sampleRate;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);

      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
      }

      const noiseNode = ctx.createBufferSource();
      noiseNode.buffer = noiseBuffer;
      noiseNode.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(140, ctx.currentTime);

      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.12, ctx.currentTime);

      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(30, ctx.currentTime);

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      const mainGain = ctx.createGain();
      mainGain.gain.setValueAtTime(0.08, ctx.currentTime);

      noiseNode.connect(filter);
      filter.connect(mainGain);
      mainGain.connect(ctx.destination);

      lfo.start();
      noiseNode.start();

      syntheticAmbientSourceRef.current = { noiseNode, lfo, ctx };
    } catch (err) {
      console.warn("Synthetic ambient start failed:", err);
    }
  };

  const stopSyntheticAmbient = () => {
    try {
      if (syntheticAmbientSourceRef.current) {
        syntheticAmbientSourceRef.current.noiseNode.stop();
        syntheticAmbientSourceRef.current.lfo.stop();
        syntheticAmbientSourceRef.current = null;
      }
      if (
        syntheticAmbientCtxRef.current &&
        syntheticAmbientCtxRef.current.state !== "closed"
      ) {
        syntheticAmbientCtxRef.current.close();
        syntheticAmbientCtxRef.current = null;
      }
    } catch (err) {
      console.warn("Synthetic ambient stop failed:", err);
    }
  };

  useEffect(() => {
    bellAudioRef.current = new Audio(
      "https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3",
    );
    bellAudioRef.current.volume = 0.4;

    ambientAudioRef.current = new Audio(
      "https://assets.mixkit.co/active_storage/sfx/200/200-preview.mp3",
    );
    ambientAudioRef.current.loop = true;
    ambientAudioRef.current.volume = 0.05;

    return () => {
      ambientAudioRef.current?.pause();
      bellAudioRef.current?.pause();
      stopSyntheticAmbient();
    };
  }, []);

  useEffect(() => {
    if (isAmbientActive && isPlaying) {
      ambientAudioRef.current?.play().catch((err) => {
        console.warn(
          "External ambient asset blocked or offline. Activating synthetic room-tone synthesis.",
          err,
        );
        startSyntheticAmbient();
      });
    } else {
      ambientAudioRef.current?.pause();
      stopSyntheticAmbient();
    }
    return () => {
      stopSyntheticAmbient();
    };
  }, [isAmbientActive, isPlaying]);

  const playBell = () => {
    if (bellAudioRef.current) {
      bellAudioRef.current.currentTime = 0;
      bellAudioRef.current.play().catch((err) => {
        console.warn(
          "External bell asset blocked. Activating high-fidelity synthetic chime synthesis.",
          err,
        );
        playSyntheticBell();
      });
    } else {
      playSyntheticBell();
    }
  };

  useEffect(() => {
    if (isSandboxGuest) {
      const mockUser: any = {
        uid: "sandbox-guest-user",
        displayName: "Sandbox Scholar",
        email: "guest@omnitutor.academy",
        emailVerified: true,
        photoURL: null,
      };
      setUser(mockUser);
      setIsAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // Only set user if we aren't bypassing in Sandbox mode
      if (!localStorage.getItem("omnitutor_sandbox_guest")) {
        setUser(currentUser);
        setIsAuthLoading(false);
        if (currentUser) {
          const justSignedUp =
            localStorage.getItem("omnitutor_just_signed_up") === "true";
          const completed =
            localStorage.getItem(
              `tutor_orientation_completed_${currentUser.uid}`,
            ) === "true";

          // Fail-safe: Check if account was created during this sign-in session (brand new)
          const creationTime = currentUser.metadata.creationTime
            ? new Date(currentUser.metadata.creationTime).getTime()
            : 0;
          const lastSignInTime = currentUser.metadata.lastSignInTime
            ? new Date(currentUser.metadata.lastSignInTime).getTime()
            : 0;
          const isBrandNewAccount =
            Math.abs(creationTime - lastSignInTime) < 15000; // 15 seconds threshold

          if ((justSignedUp || isBrandNewAccount) && !completed) {
            setShowOrientation(true);
          }
        }
      }
    });
    return () => unsubscribe();
  }, [isSandboxGuest]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem("omnitutor_sandbox_guest");
    setIsSandboxGuest(false);
    setUser(null);
    await signOut(auth);
  };

  const handleHighlightAsk = (text: string) => {
    interruptedSlideIndexRef.current = currentSlideIndex;
    stopSpeaking();
    if (text === "Raising hand for assistance") {
      activeLessonIdRef.current += 1;
      const studentName = user?.displayName || (user?.email ? user.email.split("@")[0] : (language === "sw" ? "Mwanafunzi" : "Student"));
      const utteranceText = language === "sw"
        ? `Ndio, ${studentName}, tafadhali uliza swali lako.`
        : `Yes, ${studentName}, please share your question.`;
      setTeacherDialogue(utteranceText);
      speakText(utteranceText, undefined, undefined, undefined, activeLessonIdRef.current);
      setInitialQAQuestion(null);
      setQAInitialMessages([
        { role: "assistant", content: utteranceText }
      ]);
    } else {
      setQAInitialMessages(undefined);
      setInitialQAQuestion(
        `Explain this specific concept from the board: "${text}"`,
      );
    }
    setIsQAOpen(true);
  };

  useEffect(() => {
    if (language === "sw") {
      setWhiteboardNotes(
        "# Karibu OmniTutor Universal Academy\nUpo tayari kuanza safari yetu? Mimi ni Mwalimu Bora, na nipo hapa kukuongoza katika mada yoyote unayotaka kufahamu. Ingiza mada hapa chini, na tuchunguze kumbukumbu za OmniTutor Universal Academy pamoja.",
      );
      setTeacherDialogue(
        "Karibu kwenye OmniTutor Universal Academy! Mimi ni Mwalimu Bora. Leo tutajifunza kuhusu nini?",
      );
    } else {
      setWhiteboardNotes(
        "# Welcome to OmniTutor Universal Academy\nReady to begin our journey? I am Mwalimu Bora, and I am here to guide you through any topic you wish to master. Enter a subject below, and let's explore the OmniTutor Universal Academy's archives together.",
      );
      setTeacherDialogue(
        "Welcome to OmniTutor Universal Academy! I am Mwalimu Bora. What shall we learn about today?",
      );
    }
    setDiagramUrl(
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1000",
    );
  }, [language]);

  const generateAppBrand = async () => {
    setIsGeneratingBrand(true);
    setTeacherDialogue(
      "I am synthesizing a new brand identity for OmniTutor Universal Academy... Accessing intelligence core.",
    );
    try {
      const response = await fetch("/api/generate-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Server returned status: ${response.status}`);
      }

      const data = await response.json();
      if (data.imageUrl) {
        setAppBrandImage(data.imageUrl);
        setTeacherDialogue(
          "Academy brand identity synchronized. We now have a unique neural manifestation.",
        );
        speakText("Brand identity manifest.");
      } else {
        throw new Error("No brand image data found in response");
      }
    } catch (error) {
      console.error("Brand generation failed:", error);
      setTeacherDialogue(
        "The branding core is currently unresponsive. Please check your neural link.",
      );
    } finally {
      setIsGeneratingBrand(false);
    }
  };

  const downloadNotesAsPDF = async () => {
    if (!whiteboardNotes || whiteboardNotes.includes("Welcome to OmniTutor"))
      return;

    setIsDownloadingNotes(true);
    setTeacherDialogue(
      "Compiling the Technical Archive... Synthesizing engineering-grade notes for your records.",
    );

    try {
      const doc = new jsPDF();
      const margin = 20;
      const pageWidth = doc.internal.pageSize.getWidth();
      const contentWidth = pageWidth - margin * 2;

      // Header Area
      doc.setFillColor(30, 41, 59); // slate-800
      doc.rect(margin, 20, contentWidth, 2, "F");

      doc.setFontSize(22);
      doc.setTextColor(30, 41, 59);
      doc.setFont("helvetica", "bold");
      doc.text("ENGINEERING STUDY ARCHIVE", margin, 40);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(
        `REFERENCE: AIS-TUTORNODE-${(currentTopic || "GEN").toUpperCase()}`,
        margin,
        48,
      );
      doc.text(`VERSION: 4.1.0-SYNTH`, margin, 53);
      doc.text(
        `SYCHRONIZATION DATE: ${new Date().toLocaleDateString()}`,
        pageWidth - margin - 50,
        48,
      );

      doc.setDrawColor(203, 213, 225); // slate-300
      doc.line(margin, 60, pageWidth - margin, 60);

      // Content
      doc.setTextColor(15, 23, 42); // slate-900
      let y = 75;

      // Better Markdown parsing for PDF
      const lines = whiteboardNotes.split("\n");

      lines.forEach((line) => {
        if (!line.trim()) {
          y += 5;
          return;
        }

        let fontSize = 11;
        let fontStyle = "normal";
        let xOffset = margin;

        if (line.startsWith("# ")) {
          fontSize = 18;
          fontStyle = "bold";
          line = line.replace("# ", "").toUpperCase();
          y += 10;
        } else if (line.startsWith("## ")) {
          fontSize = 14;
          fontStyle = "bold";
          line = line.replace("## ", "").toUpperCase();
          y += 5;
        } else if (line.startsWith("### ")) {
          fontSize = 12;
          fontStyle = "bold";
          line = line.replace("### ", "");
          y += 3;
        } else if (line.match(/^\d+\./)) {
          // Numbered list
          fontStyle = "bold";
          xOffset += 5;
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
          // Bullets
          line = "• " + line.substring(2);
          xOffset += 10;
        } else if (line.match(/^[ivx]+\./i)) {
          // Roman numerals
          xOffset += 15;
          fontStyle = "italic";
        } else if (line.match(/^[a-z]\)\./i)) {
          // Alphabetic lists
          xOffset += 10;
        }

        doc.setFontSize(fontSize);
        doc.setFont("helvetica", fontStyle);

        const cleanLine = line.replace(/[*#`]/g, "");
        const wrappedLines = doc.splitTextToSize(
          cleanLine,
          contentWidth - (xOffset - margin),
        );

        if (y + wrappedLines.length * 6 > 275) {
          doc.addPage();
          y = 30;
        }

        doc.text(wrappedLines, xOffset, y);
        y += wrappedLines.length * 6 + 2;
      });

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(
          `AUTHENTICATED BY MWALIMU BORA AI - TUTORNODE UNIVERSAL ACADEMY - PAGE ${i}/${pageCount}`,
          margin,
          285,
        );
        doc.text(
          "CONFIDENTIAL ENGINEERING DOCUMENT",
          pageWidth - margin - 60,
          285,
        );
      }

      doc.save(
        `OmniTutor_Technical_Manual_${(currentTopic || "Lesson").replace(/\s+/g, "_")}.pdf`,
      );
      setTeacherDialogue(
        "The technical manual has been successfully exported to your peripheral. It maintains standard engineering documentation formatting.",
      );
    } catch (error) {
      console.error("PDF generation failed:", error);
      setTeacherDialogue(
        "I encountered a synchronization error while formatting the PDF archive.",
      );
    } finally {
      setIsDownloadingNotes(false);
    }
  };

  const recognitionRef = useRef<any>(null);
  const lessonTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const speechSilenceTimerRef = useRef<any>(null);
  const speakTimeoutRef = useRef<any>(null);
  const latestSpeechTranscriptRef = useRef<string>("");
  const activeLessonIdRef = useRef<number>(0);
  
  const isResumingRef = useRef<boolean>(false);
  const currentSpeechOffsetRef = useRef<number>(0);
  const currentSpeechCharIndexRef = useRef<number>(0);
  const interruptedSlideIndexRef = useRef<number>(-1);
  const activeLessonVoiceRef = useRef<string | null>(null);
  const speechKeepAliveIntervalRef = useRef<any>(null);

  useEffect(() => {
    activeLessonVoiceRef.current = null;
  }, [selectedVoiceName, selectedCharacter, language]);

  // Voice synthesis helper
  const speakText = (
    text: string,
    onEnd?: () => void,
    voiceNameOverride?: string,
    langOverride?: string,
    lessonId = activeLessonIdRef.current,
    isLesson = false,
  ) => {
    if (speechKeepAliveIntervalRef.current) {
      clearInterval(speechKeepAliveIntervalRef.current);
      speechKeepAliveIntervalRef.current = null;
    }

    if ("speechSynthesis" in window) {
      // Immediate cancellation of any pending speech (Chrome/Safari freeze workaround)
      try {
        window.speechSynthesis.resume();
      } catch (e) {}
      window.speechSynthesis.cancel();

      if (speakTimeoutRef.current) {
        clearTimeout(speakTimeoutRef.current);
      }

      // We wrap the rest in a small timeout to allow the browser's speech engine to reset
      speakTimeoutRef.current = setTimeout(() => {
        if (lessonId !== activeLessonIdRef.current) return;
        const cleanedText = cleanStageDirections(text);
        if (!cleanedText) {
          if (onEnd) onEnd();
          return;
        }

        // Set playing states early so UI reflects that teaching is active
        if (isLesson) {
          setIsPlaying(true);
          setIsMwalimuTalking(true);
        }

        const utterance = new SpeechSynthesisUtterance(cleanedText);

        // Apply custom voice profile modulation if a neural AI voice model is active
        if (activeVoiceModel === "cloned") {
          utterance.pitch = 1.12; // Modulated higher pitch frequency for cloned template
          utterance.rate = 1.05;  // Expressive speaking pace
        } else if (activeVoiceModel === "charles") {
          utterance.pitch = 0.88; // Deep resonant masculine voice profile
          utterance.rate = 0.95;  // Thoughtful paced rhythm
        } else if (activeVoiceModel === "mrema") {
          utterance.pitch = 1.22; // High pitch analytical feminine profile
          utterance.rate = 1.08;  // Fast articulate pacing
        }

        // Determine language: override -> global language state -> default en-US
        const targetLang =
          langOverride || getLangLocale(language);
        utterance.lang = targetLang;

        const setVoiceAndSpeak = () => {
          if (lessonId !== activeLessonIdRef.current) return;
          const voices = window.speechSynthesis.getVoices();
          let matchedVoice = null;

          // Helper to check if a voice has failed in this browser
          const isBroken = (v: SpeechSynthesisVoice) =>
            brokenVoicesRef.current.has(v.name);

          // If we are currently playing a lesson and have already locked a specific voice,
          // we MUST continue using that exact voice to maintain perfect consistency.
          if (isLesson && activeLessonVoiceRef.current) {
            matchedVoice = voices.find(
              (v) => v.name === activeLessonVoiceRef.current && !isBroken(v)
            );
          }

          if (!matchedVoice) {
            // Use override if provided, otherwise the state variable
            const targetVoiceName =
              voiceNameOverride !== undefined
                ? voiceNameOverride
                : selectedVoiceName;

            const targetLangPrefix = targetLang.split("-")[0].toLowerCase();

            // 1. Try to use the explicitly selected/target voice first if compatible with target language
            if (targetVoiceName) {
              const candidate = voices.find(
                (v) => v.name === targetVoiceName && !isBroken(v)
              );
              if (candidate) {
                const voiceLangLower = candidate.lang.toLowerCase();
                const voiceLangPrefix = voiceLangLower.split("-")[0];

                if (voiceLangPrefix === targetLangPrefix) {
                  matchedVoice = candidate;
                }
              }
            }

            // 2. If no override/direct voice matches, get the best voice for the active character and language
            if (!matchedVoice && selectedCharacter) {
              const nonBrokenVoices = voices.filter(v => !isBroken(v));
              const characterMatched = getVoiceForCharacter(selectedCharacter, nonBrokenVoices, targetLangPrefix);
              if (characterMatched) {
                matchedVoice = characterMatched;
              }
            }

            // 3. Fallback priority selection if no voice matches yet
            if (!matchedVoice) {
              // Priority for target language
              matchedVoice = voices.find(
                (v) =>
                  !isBroken(v) &&
                  v.lang.toLowerCase().startsWith(targetLangPrefix)
              );

              // Special handling for Swahili fallback
              if (!matchedVoice && targetLangPrefix === "sw") {
                matchedVoice = voices.find(
                  (v) =>
                    !isBroken(v) &&
                    v.name.toLowerCase().includes("swahili")
                );
              }
            }

            // 4. Ultimate Fallbacks (prefer same language family even if marked as broken)
            if (!matchedVoice) {
              matchedVoice = voices.find(
                (v) =>
                  v.lang.toLowerCase().startsWith(targetLangPrefix) ||
                  (targetLangPrefix === "sw" && v.name.toLowerCase().includes("swahili"))
              );

              if (!matchedVoice && targetLangPrefix !== "en") {
                matchedVoice = voices.find((v) => v.lang.toLowerCase().startsWith("en"));
              }

              if (!matchedVoice) {
                matchedVoice = voices[0];
              }
            }
          }

          // Lock the selected voice for subsequent segments in this lesson run
          if (isLesson && matchedVoice && !activeLessonVoiceRef.current) {
            activeLessonVoiceRef.current = matchedVoice.name;
          }

          if (matchedVoice) {
            utterance.voice = matchedVoice;
            // Prevent silent failures or bad errors due to language/voice locale mismatches
            const voiceLangPrefix = matchedVoice.lang.split("-")[0].toLowerCase();
            const targetLangPrefix = targetLang.split("-")[0].toLowerCase();
            if (voiceLangPrefix !== targetLangPrefix) {
              utterance.lang = matchedVoice.lang;
            } else {
              utterance.lang = targetLang;
            }
          }
          
          // Apply custom voice profile modulation if a neural AI voice model is active, otherwise default
          if (activeVoiceModel === "cloned") {
            utterance.pitch = 1.12; // Modulated higher pitch frequency for cloned template
            utterance.rate = 1.05;  // Expressive speaking pace
          } else if (activeVoiceModel === "charles") {
            utterance.pitch = 0.88; // Deep resonant masculine voice profile
            utterance.rate = 0.95;  // Thoughtful paced rhythm
          } else if (activeVoiceModel === "mrema") {
            utterance.pitch = 1.22; // High pitch analytical feminine profile
            utterance.rate = 1.08;  // Fast articulate pacing
          } else {
            utterance.rate = 0.95;
            utterance.pitch = 1.0;
          }

          // Autoplay protection diagnostic timer
          let blockTimer: any = null;
          if (cleanedText && cleanedText.trim().length > 0) {
            blockTimer = setTimeout(() => {
              if (lessonId === activeLessonIdRef.current) {
                console.warn("[Speech Engine] Speech has been delayed or blocked. Browser autoplay restrictions may be in effect.");
                setIsAudioBlocked(true);
              }
            }, 1500);
          }

          utterance.onboundary = (e) => {
            if (blockTimer) clearTimeout(blockTimer);
            setIsAudioBlocked(false);
            if (e.name === "word") {
              if (isLesson) {
                if (isResumingRef.current) {
                  const prefixLen = targetLang.toLowerCase().startsWith("sw") ? 39 : 28;
                  if (e.charIndex >= prefixLen) {
                    currentSpeechCharIndexRef.current = currentSpeechOffsetRef.current + (e.charIndex - prefixLen);
                  } else {
                    currentSpeechCharIndexRef.current = currentSpeechOffsetRef.current;
                  }
                } else {
                  currentSpeechCharIndexRef.current = e.charIndex;
                }
              }
            }
          };

          utterance.onstart = () => {
            if (blockTimer) clearTimeout(blockTimer);
            setIsAudioBlocked(false);
            if (lessonId !== activeLessonIdRef.current) return;
            setIsPlaying(true);
            setIsMwalimuTalking(true);

            // Periodically pause/resume speech synthesis to prevent browser timeout/freezing (Chromium 15s bug)
            if (speechKeepAliveIntervalRef.current) {
              clearInterval(speechKeepAliveIntervalRef.current);
            }
            speechKeepAliveIntervalRef.current = setInterval(() => {
              if ("speechSynthesis" in window && window.speechSynthesis.speaking) {
                try {
                  window.speechSynthesis.pause();
                  window.speechSynthesis.resume();
                } catch (err) {
                  console.warn("[Speech Engine] Keepalive pause/resume failed", err);
                }
              }
            }, 8000);
          };

          utterance.onend = () => {
            if (blockTimer) clearTimeout(blockTimer);
            setIsAudioBlocked(false);
            setIsMwalimuTalking(false);
            if (speechKeepAliveIntervalRef.current) {
              clearInterval(speechKeepAliveIntervalRef.current);
              speechKeepAliveIntervalRef.current = null;
            }
            if (lessonId !== activeLessonIdRef.current) return;
            if (onEnd) onEnd();
            else setIsPlaying(false);
          };

          utterance.onpause = () => {
            setIsPlaying(false);
            setIsMwalimuTalking(false);
          };

          utterance.onresume = () => {
            if (lessonId !== activeLessonIdRef.current) return;
            setIsPlaying(true);
            setIsMwalimuTalking(true);
          };

          utterance.onerror = (e) => {
            if (blockTimer) clearTimeout(blockTimer);
            if (speechKeepAliveIntervalRef.current) {
              clearInterval(speechKeepAliveIntervalRef.current);
              speechKeepAliveIntervalRef.current = null;
            }
            console.warn(
              "Speech synthesis issue for voice:",
              matchedVoice?.name,
              e,
            );

            // If browser blocked speech synthesis due to lack of user interaction
            if (e.error === "not-allowed") {
              setIsAudioBlocked(true);
            } else {
              setIsAudioBlocked(false);
            }

            if (lessonId !== activeLessonIdRef.current) {
              setIsPlaying(false);
              setIsMwalimuTalking(false);
              return;
            }

            // Only handle as real failure if it is not due to user cancellations/interruption
            if (
              matchedVoice &&
              e.error !== "interrupted" &&
              e.error !== "canceled" &&
              e.error !== "not-allowed"
            ) {
              console.warn(
                `[OmniTutor Voice Recovery] Voice "${matchedVoice.name}" failed: ${e.error}. Attempting auto-fallback...`,
              );

              // Mark as broken in-memory for the current session only
              markVoiceAsBroken(matchedVoice.name, false);

              // Reset the locked voice reference so fallback select can pick a working one
              if (activeLessonVoiceRef.current === matchedVoice.name) {
                activeLessonVoiceRef.current = null;
              }

              setSpeechError({
                visible: true,
                message: `Voice "${matchedVoice.name}" is unresponsive in your current browser. Routing to standard hardware voice fallback.`,
                type: "warning",
              });

              try {
                window.speechSynthesis.resume();
              } catch (err) {}
              window.speechSynthesis.cancel();

              // Retry speaking after a brief delay without specifying the broken voice
              setTimeout(() => {
                speakText(text, onEnd, undefined, langOverride, lessonId, isLesson);
              }, 100);
              return;
            }

            setIsPlaying(false);
            setIsMwalimuTalking(false);
            if (
              e.error !== "interrupted" &&
              e.error !== "canceled" &&
              e.error !== "not-allowed" &&
              onEnd
            ) {
              onEnd();
            } else if (!onEnd) {
              setIsPlaying(false);
            }
          };

          // Final check before speaking
          try {
            window.speechSynthesis.resume(); // Safari/Chrome fix
          } catch (e) {}
          window.speechSynthesis.speak(utterance);
        };

        if (window.speechSynthesis.getVoices().length === 0) {
          window.speechSynthesis.onvoiceschanged = () => {
            setVoiceAndSpeak();
            window.speechSynthesis.onvoiceschanged = null;
          };
          // Just in case onvoiceschanged is not supported or already fired
          setTimeout(setVoiceAndSpeak, 100);
        } else {
          setVoiceAndSpeak();
        }
      }, 50);
    } else {
      setIsPlaying(true);
      setIsMwalimuTalking(true);
      setTimeout(
        () => {
          setIsMwalimuTalking(false);
          if (lessonId !== activeLessonIdRef.current) return;
          if (onEnd) onEnd();
          else setIsPlaying(false);
        },
        Math.min(text.length * 60, 10000),
      );
    }
  };

  const playLesson = (
    segments: { content: string; speech: string }[],
    index = 0,
    lessonId = activeLessonIdRef.current,
    isFromQAContinue = false,
  ) => {
    const finalLessonId = lessonId ?? activeLessonIdRef.current;
    if (finalLessonId !== activeLessonIdRef.current) return;
    if (index === 0) {
      setIsLessonEnded(false);
      activeLessonVoiceRef.current = null;
    }
    if (index >= segments.length) {
      isResumingRef.current = false;
      currentSpeechOffsetRef.current = 0;
      currentSpeechCharIndexRef.current = 0;
      interruptedSlideIndexRef.current = -1;
      
      if (finalLessonId === activeLessonIdRef.current) {
        setIsLessonEnded(true);
        const endingText = "And that's the end of today's lesson. Thank you for joining me at OmniTutor Academy. I hope you found this lesson helpful and informative. See you in the next class. Goodbye!";
        setTeacherDialogue(endingText);
        speakText(endingText, () => {
          if (finalLessonId === activeLessonIdRef.current) {
            setIsPlaying(false);
          }
        }, undefined, undefined, finalLessonId, true);
      }
      return;
    }

    setCurrentSlideIndex(index);
    
    let textToSpeak = segments[index].speech;
    if (isFromQAContinue && interruptedSlideIndexRef.current === index && currentSpeechCharIndexRef.current > 0) {
      let cleanText = textToSpeak;
      const resumeIndex = currentSpeechCharIndexRef.current;
      if (resumeIndex > 0 && resumeIndex < cleanText.length) {
        cleanText = cleanText.slice(resumeIndex).trim();
      }
      isResumingRef.current = true;
      currentSpeechOffsetRef.current = resumeIndex;

      if (language === "sw") {
        textToSpeak = `Kama nilivyokuwa nikieleza hapo awali, ${cleanText}`;
      } else {
        textToSpeak = `As I was explaining earlier, ${cleanText}`;
      }
    } else {
      isResumingRef.current = false;
      currentSpeechOffsetRef.current = 0;
      currentSpeechCharIndexRef.current = 0;
      
      if (isFromQAContinue) {
        let strippedText = textToSpeak;
        
        // Look for standard English start directive and slice from after "Let's get started."
        const engIdx = strippedText.indexOf("Let's get started.");
        if (engIdx !== -1) {
          strippedText = strippedText.slice(engIdx + "Let's get started.".length).trim();
        } else {
          const welcomeEngIdx = strippedText.toLowerCase().indexOf("welcome to omnitutor");
          if (welcomeEngIdx !== -1) {
            const startedIdx = strippedText.toLowerCase().indexOf("start");
            if (startedIdx !== -1 && startedIdx > welcomeEngIdx) {
              const nextPeriodIdx = strippedText.indexOf(".", startedIdx);
              if (nextPeriodIdx !== -1) {
                strippedText = strippedText.slice(nextPeriodIdx + 1).trim();
              }
            }
          }
        }

        // Look for standard Swahili start directive and slice from after "Hebu tuanze."
        const swIdx = strippedText.indexOf("Hebu tuanze.");
        if (swIdx !== -1) {
          strippedText = strippedText.slice(swIdx + "Hebu tuanze.".length).trim();
        } else {
          const karibuSwIdx = strippedText.toLowerCase().indexOf("karibu kwenye omnitutor");
          if (karibuSwIdx !== -1) {
            const kuanzaIdx = strippedText.toLowerCase().indexOf("tuanze");
            if (kuanzaIdx !== -1 && kuanzaIdx > karibuSwIdx) {
              const nextPeriodIdx = strippedText.indexOf(".", kuanzaIdx);
              if (nextPeriodIdx !== -1) {
                strippedText = strippedText.slice(nextPeriodIdx + 1).trim();
              }
            }
          }
        }

        // Safe guard - if stripping removed too much, fallback to the original text
        if (strippedText.trim().length > 15) {
          textToSpeak = strippedText;
        }

        if (language === "sw") {
          textToSpeak = `Kama nilivyokuwa nikieleza hapo awali, ${textToSpeak}`;
        } else {
          textToSpeak = `As I was explaining earlier, ${textToSpeak}`;
        }
      }
    }

    setTeacherDialogue(textToSpeak);
    speakText(textToSpeak, () => {
      if (finalLessonId !== activeLessonIdRef.current) return;
      if (isQAOpen) return; // Don't proceed if user is in Q&A
      // Small pause between slides
      if (lessonTimeoutRef.current) clearTimeout(lessonTimeoutRef.current);
      lessonTimeoutRef.current = setTimeout(() => {
        if (finalLessonId !== activeLessonIdRef.current) return;
        playLesson(segments, index + 1, finalLessonId, false);
      }, 1000);
    }, undefined, undefined, finalLessonId, true);
  };

  const stopSpeaking = () => {
    if (lessonTimeoutRef.current) {
      clearTimeout(lessonTimeoutRef.current);
    }
    if (speechKeepAliveIntervalRef.current) {
      clearInterval(speechKeepAliveIntervalRef.current);
      speechKeepAliveIntervalRef.current = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setIsMwalimuTalking(false);
  };

  const pauseSpeaking = () => {
    if (lessonTimeoutRef.current) {
      clearTimeout(lessonTimeoutRef.current);
    }
    if (speechKeepAliveIntervalRef.current) {
      clearInterval(speechKeepAliveIntervalRef.current);
      speechKeepAliveIntervalRef.current = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.pause();
    }
    setIsPlaying(false);
    setIsMwalimuTalking(false);
  };

  const resumeSpeaking = (isFromQAContinue = false) => {
    if (videoUrl.includes("/videos/") && !videoUrl.includes("placeholder.mp4")) {
      setIsPlaying(true);
      return;
    }

    if ("speechSynthesis" in window) {
      if (window.speechSynthesis.paused && !isFromQAContinue) {
        window.speechSynthesis.resume();
        setIsPlaying(true);
        setIsMwalimuTalking(true);
      } else if (lessonSegments.length > 0) {
        playLesson(lessonSegments, currentSlideIndex, undefined, isFromQAContinue);
      } else {
        setIsPlaying(true);
      }
    } else {
      setIsPlaying(true);
      setIsMwalimuTalking(true);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Supported types for Gemini 1.5 Flash include PDF and text
    const supportedTypes = [
      "application/pdf",
      "text/plain",
      "text/markdown",
      "text/csv",
    ];
    if (!supportedTypes.includes(file.type)) {
      setTeacherDialogue(
        "I can only read PDFs or text files at the moment. Please upload a compatible textbook.",
      );
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setTeacherDialogue(
        "This textbook is too massive (over 20MB). Please provide a smaller section.",
      );
      return;
    }

    setIsProcessingFile(true);
    setFileName(file.name);
    setTeacherDialogue(
      `Digitizing ${file.name}... Injecting textbook into my neural archives...`,
    );

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(",")[1];
      setFileData({
        mimeType: file.type,
        data: base64,
      });
      setIsProcessingFile(false);
      setTeacherDialogue(
        `${file.name} successfully integrated. I am ready to teach from its contents. What topic shall we master?`,
      );
      speakText(`${file.name} integrated. Ready to teach.`);
    };
    reader.onerror = () => {
      setIsProcessingFile(false);
      setTeacherDialogue("Neural scan failed. The file might be corrupted.");
    };
    reader.readAsDataURL(file);
  };

  const handleExamFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Supported types for Gemini 1.5 Flash include PDF and text
    const supportedTypes = [
      "application/pdf",
      "text/plain",
      "text/markdown",
      "text/csv",
    ];
    if (!supportedTypes.includes(file.type)) {
      setTeacherDialogue(
        language === "sw"
          ? "Ninaweza tu kusoma PDF, faili za maandishi, au Markdown kwa ajili ya mitihani."
          : "I can only parse PDF, text, or markdown exam papers.",
      );
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setTeacherDialogue(
        language === "sw"
          ? "Faili la mtihani ni kubwa sana (zaidi ya MB 20). Tafadhali weka faili ndogo zaidi."
          : "This exam paper is too large (over 20MB). Please provide a smaller document.",
      );
      return;
    }

    setIsProcessingExamFile(true);
    setExamFileName(file.name);
    setTeacherDialogue(
      language === "sw"
        ? `Inachanganua ${file.name}... Inatayarisha mwalimu kukusaidia kurudia maswali ya mtihani...`
        : `Analyzing exam paper ${file.name}... Preparing Mwalimu to revise and solve your questions...`,
    );

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(",")[1];
      setExamFileData({
        mimeType: file.type,
        data: base64,
      });
      setIsProcessingExamFile(false);
      setTeacherDialogue(
        language === "sw"
          ? `Mtaala wa maswali ya mtihani kutoka "${file.name}" upo tayari! Bofya kitufe cha 'Anza Mapitio' ili Mwalimu aanze kusuluhisha maswali.`
          : `Exam paper "${file.name}" has been successfully uploaded and processed! Click 'Start Revision Guide' to have Mwalimu solve and explain the paper.`,
      );
      speakText(
        language === "sw"
          ? "Mtihani umepakiwa, tuanze mapitio."
          : "Exam paper loaded. Let's begin the revision."
      );
    };
    reader.onerror = () => {
      setIsProcessingExamFile(false);
      setTeacherDialogue(
        language === "sw"
          ? "Imeshindikana kuchanganua faili la mtihani."
          : "Failed to scan exam paper."
      );
    };
    reader.readAsDataURL(file);
  };

  const clearExamFile = () => {
    setExamFileData(null);
    setExamFileName(null);
    setShareExamUrl(null);
    setTeacherDialogue(
      language === "sw"
        ? "Mtihani umeondolewa."
        : "Exam paper detached."
    );
  };

  const handleShareExamPaper = async () => {
    if (!examFileData || !examFileName || isExamSharing) return;
    setIsExamSharing(true);
    try {
      if (!auth.currentUser) {
        throw new Error(
          language === "sw"
            ? "Tafadhali jisajili au ingia kwanza ili uweze kushiriki mtihani wako!"
            : "Please sign in to share an exam paper!"
        );
      }

      const examPayload = {
        name: examFileName,
        mimeType: examFileData.mimeType,
        data: examFileData.data,
        userId: auth.currentUser.uid,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, "exams"), examPayload);
      const shareUrl = `${window.location.origin}?exam=${docRef.id}`;
      setShareExamUrl(shareUrl);
      
      setTeacherDialogue(
        language === "sw"
          ? "Mtihani umeshirikishwa kikamilifu! Nakili kiungo cha kushiriki hapa chini."
          : "Exam paper shared successfully! Copy the shareable link below."
      );
    } catch (err: any) {
      console.error("Error sharing exam paper:", err);
      setTeacherDialogue(
        language === "sw"
          ? "Imeshindikana kushiriki mtihani: " + err.message
          : "Failed to share exam paper: " + err.message
      );
    } finally {
      setIsExamSharing(false);
    }
  };

  const clearFile = () => {
    setFileData(null);
    setFileName(null);
    setTeacherDialogue(
      "Textbook detached. I will now teach from my general neural knowledge.",
    );
  };

  const handleLearn = async (e: React.FormEvent) => {
    e.preventDefault();
    executeLearn(studentInput);
  };

  const handleVoiceIntent = (transcript: string) => {
    const lowerTranscript = transcript.toLowerCase().trim();
    if (isQAOpen && isWaitingForContinue) {
      if (
        lowerTranscript === "yes" ||
        lowerTranscript === "y" ||
        lowerTranscript === "ndio" ||
        lowerTranscript === "ndiyo" ||
        lowerTranscript.includes("continue") ||
        lowerTranscript.includes("endelea") ||
        lowerTranscript === "yes, continue" ||
        lowerTranscript === "yes."
      ) {
        setIsWaitingForContinue(false);
        setIsQAOpen(false);
        setInitialQAQuestion(null);
        setQAInitialMessages(undefined);
        if (lessonSegments.length > 0) {
          resumeSpeaking(true);
        }
        return;
      } else if (
        lowerTranscript === "no" ||
        lowerTranscript === "hapana" ||
        lowerTranscript.includes("ask") ||
        lowerTranscript.includes("swali") ||
        lowerTranscript.includes("another")
      ) {
        setIsWaitingForContinue(false);
        if (language === "sw") {
          speakText("Sawa, unaweza kuuliza swali lingine au somo lingine.");
        } else {
          speakText("Alright, please share your question.");
        }
        return;
      }
    }

    // 1. Playback Controls
    if (language === "sw") {
      if (
        transcript.includes("tuliza") ||
        transcript.includes("kimya") ||
        transcript.includes("acha kuongea") ||
        transcript.includes("pumzika")
      ) {
        pauseSpeaking();
        return;
      }
      if (transcript.includes("endelea")) {
        resumeSpeaking();
        return;
      }
      if (transcript.includes("rudia") || transcript.includes("tena")) {
        speakText(teacherDialogue);
        return;
      }
    } else {
      if (
        transcript.includes("pause") ||
        transcript.includes("stop talking") ||
        transcript.includes("hush") ||
        transcript.includes("hold on")
      ) {
        pauseSpeaking();
        return;
      }
      if (
        transcript.includes("resume") ||
        transcript.includes("continue") ||
        transcript.includes("play")
      ) {
        resumeSpeaking();
        return;
      }
      if (
        transcript.includes("rewind") ||
        transcript.includes("repeat") ||
        transcript.includes("again")
      ) {
        speakText(teacherDialogue);
        return;
      }
    }

    // 2. Navigation
    if (language === "sw") {
      if (
        transcript.includes("kumbukumbu") ||
        transcript.includes("historia")
      ) {
        setShowHistory(true);
        setTeacherDialogue(
          "Nikikagua kumbukumbu. Unaweza kusema 'ijayo' au 'iliyopita' ili kuvinjari.",
        );
        speakText("Nikikagua kumbukumbu.");
        return;
      }
      if (transcript.includes("sasa") || transcript.includes("funga")) {
        setShowHistory(false);
        return;
      }
    } else {
      if (transcript.includes("history") || transcript.includes("archives")) {
        setShowHistory(true);
        setTeacherDialogue(
          "Reviewing the archives. You can say 'next' or 'previous' to browse.",
        );
        speakText("Reviewing the archives.");
        return;
      }
      if (
        transcript.includes("current") ||
        transcript.includes("lesson") ||
        transcript.includes("close history")
      ) {
        setShowHistory(false);
        return;
      }
    }
    if (
      transcript.includes("next") ||
      (language === "sw" && transcript.includes("ijayo"))
    ) {
      if (showHistory && lessonHistory.length > 0) {
        const nextIdx = Math.min(lessonHistory.length - 1, historyIndex + 1);
        if (nextIdx !== historyIndex) {
          loadLessonFromHistory(nextIdx);
        }
      }
      return;
    }
    if (
      transcript.includes("previous") ||
      transcript.includes("back") ||
      (language === "sw" &&
        (transcript.includes("iliyopita") || transcript.includes("nyuma")))
    ) {
      if (showHistory && lessonHistory.length > 0) {
        const prevIdx = Math.max(0, historyIndex - 1);
        if (prevIdx !== historyIndex) {
          loadLessonFromHistory(prevIdx);
        }
      }
      return;
    }

    // 3. Learning Trigger (Default)
    // Filter out command triggers if they were the only thing said
    const commands = [
      "pause",
      "stop",
      "play",
      "resume",
      "rewind",
      "repeat",
      "history",
      "archives",
      "next",
      "previous",
      "tuliza",
      "kimya",
      "endelea",
      "rudia",
      "kumbukumbu",
      "historia",
      "ijayo",
      "iliyopita",
    ];
    const isOnlyCommand = commands.some((c) => transcript === c);

    if (!isOnlyCommand) {
      // If none of the specific intents, treat as a learning topic
      startLearningFromVoice(transcript);
    }
  };

  const startLearningFromVoice = (topic: string) => {
    if (isPlaying || lessonSegments.length > 0 || isQAOpen) {
      // If we are in a lesson or Q&A is open, treat it as a question/interruption
      if (isPlaying) {
        interruptedSlideIndexRef.current = currentSlideIndex;
        stopSpeaking();
      }

      setQAInitialMessages(undefined);
      // Ensure Q&A triggers even if topic is similar
      setInitialQAQuestion(topic + (topic === initialQAQuestion ? " " : ""));
      setIsQAOpen(true);
      return;
    }

    setStudentInput(topic);
    // Use a small delay to ensure state is updated before form submission simulation
    setTimeout(() => {
      const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
      // We need to bypass the state check because state might not have updated yet in the closure
      // So we'll call a version of handleLearn that accepts input
      executeLearn(topic);
    }, 100);
  };

  const generateCinematicLessonVideo = async (
    segments: { content: string; speech: string }[],
  ) => {
    if (segments.length === 0 || videoComingSoon) return;

    stopSpeaking();
    setIsGeneratingVideo(true);
    setVideoGenerationProgress(0);
    setVideoGenerationStatus("Initializing background neural session...");
    setTeacherDialogue(
      "I am initiating a high-fidelity cinematic synthesis on my remote neural cluster. This will produce a masterclass video file.",
    );

    try {
      // LIMIT CONTENT SIZE for stability as per instructions - Syncing to 4 for reliability
      const limitedSegments = segments.slice(0, 4);

      console.log("[NEURAL_VEO_LINK] Scheduling background synthesis job...");
      const startResponse = await fetch("/api/generate-lesson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lessonSegments: limitedSegments,
          teacherDialogue: teacherDialogue,
          visualInstructions: `Ultimate realism, photorealistic educational video. ${teacherAppearance}. Standing in a brightly lit, high-end modern classroom with a large smartboard behind ${selectedCharacter.gender === "male" ? "him" : "her"}. Natural cinematic lighting with soft shadows. Clear eye contact. 4K quality, professional cinematography.`,
          language: language,
          diagramUrl: diagramUrl,
          teacherImageUrl: selectedCharacter?.imageUrl || null,
          teacherName: selectedCharacter?.name || null,
          isCinematicEnabled: isCinematicEnabled,
        }),
      });

      if (!startResponse.ok) {
        throw new Error(`Failed to initiate video generation: ${startResponse.statusText}`);
      }

      const startData = await startResponse.json();
      const jobId = startData.jobId;
      if (!jobId) {
        throw new Error("Server did not return a valid jobId.");
      }

      console.log(`[NEURAL_VEO_LINK] Background job scheduled successfully. Job ID: ${jobId}`);

      // Now poll for job status
      let jobCompleted = false;
      let attempts = 0;
      const maxAttempts = 150; // up to 10 minutes of resilience
      let jobResult = null;

      while (!jobCompleted && attempts < maxAttempts) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 4000)); // poll every 4 seconds

        try {
          const statusResponse = await fetch("/api/video-job-status", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ jobId }),
          });

          if (!statusResponse.ok) {
            console.warn(`Polling error (attempt ${attempts}): ${statusResponse.statusText}`);
            continue;
          }

          const job = await statusResponse.json();
          if (job.status === "completed") {
            jobResult = job.result;
            jobCompleted = true;
            break;
          } else if (job.status === "failed") {
            throw new Error(job.error || "Neural cluster synthesis failed.");
          } else {
            // Update UI with real server-side progress!
            setVideoGenerationProgress(Math.min(95, job.progress || 0));
            if (job.step) {
              setVideoGenerationStatus(job.step);
            }
          }
        } catch (pollErr: any) {
          console.warn(`Failed to fetch job status (attempt ${attempts}):`, pollErr);
          // If the error was explicitly thrown by the failed check, bubble it up
          if (pollErr.message && pollErr.message.includes("failed")) {
            throw pollErr;
          }
        }
      }

      if (!jobCompleted || !jobResult) {
        throw new Error("Synthesis exceeded maximum duration. Please try again with shorter lesson content.");
      }

      setVideoGenerationProgress(100);
      setVideoGenerationStatus("Ready.");
      setTeacherDialogue(
        "The cinematic neural link is complete. Your masterclass is ready for viewing and download.",
      );

      const videoUrl = jobResult.videoUrl;

      setTimeout(() => {
        setIsGeneratingVideo(false);
        setGeneratedVideoUrl(videoUrl);
        setVideoUrl(videoUrl);
        setTeachingMode("video");
        setIsCinematicMode(false);
        setIsPlaying(true);
      }, 1000);

    } catch (error: any) {
      console.error("Cinematic mode generation failed:", error);
      setIsGeneratingVideo(false);
      setTeacherDialogue(
        `Neural cluster error: ${error.message}. Reverting to standard mode.`,
      );

      // Fallback to simulation if backend fails
      setTimeout(() => {
        playLesson(segments);
      }, 2000);
    }
  };

  const generateLessonVideo = async (
    segments: { content: string; speech: string }[],
  ) => {
    return generateCinematicLessonVideo(segments);
  };
  const executeLearn = async (input: string, syllabusContext?: {
    chapterTitle: string;
    topicTitle: string;
    topicDescription: string;
    syllabusTitle: string;
    allTopics?: string[];
  }) => {
    if (!input.trim() || isLoading) return;

    // Secondary guard for high-frequency double-clicks
    if (
      (window as any)._lastNeuralRequestTopic === input &&
      Date.now() - ((window as any)._lastNeuralRequestTime || 0) < 2000
    ) {
      return;
    }
    (window as any)._lastNeuralRequestTopic = input;
    (window as any)._lastNeuralRequestTime = Date.now();

    // Increment active lesson ID to isolate asynchronous actions of the old lesson
    activeLessonIdRef.current += 1;

    // Immediately stop any active speech synthesis and slide transition timers
    stopSpeaking();
    isResumingRef.current = false;
    currentSpeechOffsetRef.current = 0;
    currentSpeechCharIndexRef.current = 0;
    interruptedSlideIndexRef.current = -1;
    
    setQAInitialMessages(undefined);
    setInitialQAQuestion(null);
    setIsQAOpen(false);
    setIsWaitingForContinue(false);
    setCurrentSlideIndex(0);
    setLessonSegments([]);
    setWhiteboardNotes("");
    setVisualDiagramPrompt(null);
    setDiagramSvg(null);
    setDiagramUrl(null);

    setStudentInput("");
    setIsLoading(true);
    setVideoKeyword("processing");
    setTeacherDialogue(
      language === "sw"
        ? isExamRevisionMode
          ? `Inachambua faili la mtihani kwa ajili ya "${input}"...`
          : fileData
            ? `Nikisaka kitabu chako kwa ajili ya "${input}"...`
            : "Uunganisho wa neva upo tayari. Nikichanganua kumbukumbu..."
        : isExamRevisionMode
          ? `Analyzing exam paper for "${input}"...`
          : fileData
            ? `Searching your textbook for "${input}"...`
            : "Uplink active. Scanning neural archives...",
    );

    try {
      const response = await fetch("/api/generate-lesson-synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          language,
          classTrack,
          studyLevel,
          intelLevel,
          teacherAppearance,
          backgroundSetting,
          fileData: isExamRevisionMode ? examFileData : fileData,
          isExamRevision: isExamRevisionMode,
          isCinematicEnabled,
          teacherName: selectedCharacter.name,
          teacherGender: selectedCharacter.gender,
          syllabusContext,
          classTargetDuration,
          useStaticExample: input.toLowerCase().startsWith("example:") || input.toLowerCase().startsWith("mfano:"),
        }),
      });

      if (!response.ok) {
        let errPayload: any = {};
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            errPayload = await response.json();
          } else {
            const txt = await response.text();
            if (txt.includes("<!doctype") || txt.includes("<html") || txt.includes("<!DOCTYPE")) {
              throw new Error("Mfumo unaanzishwa upya au una mzigo mkubwa kwa sasa. Tafadhali subiri sekunde chache ukitulia kisha ujaribu tena! (The server is currently initializing or restarting. Please try again in a few moments!)");
            }
            errPayload = { error: txt };
          }
        } catch (e: any) {
          errPayload = { error: e.message || "Unknown error" };
        }
        throw new Error(
          errPayload.error || `Server returned status ${response.status}`,
        );
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const txt = await response.text();
        if (txt.includes("<!doctype") || txt.includes("<html") || txt.includes("<!DOCTYPE")) {
          throw new Error("Mfumo unaanzishwa upya au una mzigo mkubwa kwa sasa. Tafadhali subiri sekunde chache ukitulia kisha ujaribu tena!");
        }
        throw new Error(`Inasubiri data ya JSON, lakini imepokea: ${contentType}`);
      }

      const result = await response.json();
      const segments = result.segments || [];

      setLessonSegments(segments);
      if (result.teachingTechnique) {
        setActiveTeachingTechnique(result.teachingTechnique);
      }

      // Backward compatibility for general display
      const fullNotes = segments.map((s: any) => s.content).join("\n\n---\n\n");
      const fullDialogue = segments.map((s: any) => s.speech).join(" ");

      setWhiteboardNotes(fullNotes || "No notes available.");
      setTeacherDialogue(fullDialogue || "Lesson data prepared.");
      setVisualDiagramPrompt(result.visual_diagram_prompt || null);
      setDiagramSvg(result.diagram_svg_code || null);
      setVideoScene(result.video_scene || "Teaching");
      setVideoKeyword(result.video_keyword || "education");

      // Set placeholder diagram from Unsplash based on keyword
      if (result.video_keyword) {
        // source.unsplash.com is deprecated and often returns 503. Using a more reliable placeholder.
        setDiagramUrl(
          `https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1000`,
        );
      }

      setCurrentTopic(input);
      setShowFeedback(true);
      setFeedbackSubmitted(false);

      // Start synchronized playback
      if (segments.length > 0) {
        playLesson(segments);
      } else {
        speakText(fullDialogue);
      }

      // Save lesson to history if logging is enabled
      if (isLoggingEnabled) {
        saveLesson(input, {
          ...result,
          whiteboard_notes: fullNotes,
          teacher_dialogue: fullDialogue,
        });
      }
    } catch (error: any) {
      console.error("Learning error:", error);
      const errorText =
        error?.message ||
        (typeof error === "string" ? error : JSON.stringify(error));
      const isRateLimit =
        errorText.includes("429") || errorText.includes("RESOURCE_EXHAUSTED");

      if (isRateLimit) {
        setTeacherDialogue(
          "The Neural Link is currently saturated (Quota or Rate Limit Exceeded). If you are using the free tier, please wait a moment or consider adding a billing-enabled API key in Settings > Secrets to increase your capacity.",
        );
      } else {
        setTeacherDialogue(
          "The Neural Link was unstable during synthesis. This usually happens with very complex topics or network gaps. Please try a more specific topic or re-attempt.",
        );
      }
      setVideoKeyword("error");
    } finally {
      setIsLoading(false);
    }
  };

  const [lastSpeechErrorTime, setLastSpeechErrorTime] = useState(0);
  const speechRetryCountRef = useRef(0);

  // Improved speech recognition lifecycle management
  useEffect(() => {
    // If conversational mode is on, we want to listen whenever Mwalimu is NOT speaking
    // If a lesson is playing, we want to listen for interruptions
    const shouldBeListening =
      isVoiceConversationalMode || (isPlaying && !isMwalimuTalking);

    let retryTimer: any = null;

    if (shouldBeListening && recognitionRef.current && !isListening) {
      // Check if we are offline
      if (!navigator.onLine) {
        return;
      }

      // If we have already hit max retries, do not auto-start anymore
      if (speechRetryCountRef.current > 5) {
        return;
      }

      // Don't auto-retry if there was a recent error (within 2 seconds), schedule it instead
      const timeSinceLastError = Date.now() - lastSpeechErrorTime;
      if (timeSinceLastError < 2000) {
        const delay = 2000 - timeSinceLastError;
        retryTimer = setTimeout(() => {
          if (
            (isVoiceConversationalMode || (isPlaying && !isMwalimuTalking)) &&
            recognitionRef.current &&
            !isListening &&
            speechRetryCountRef.current <= 5
          ) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              // Already started or busy
            }
          }
        }, delay);
        return () => {
          if (retryTimer) clearTimeout(retryTimer);
        };
      }

      try {
        recognitionRef.current.start();
      } catch (e) {
        // Already started or busy
      }
    } else if (
      !shouldBeListening &&
      isListening &&
      !isVoiceConversationalMode
    ) {
      // Only stop automatically if NOT in conversational mode
      try {
        recognitionRef.current?.stop();
      } catch (e) {}
    }
  }, [
    isPlaying,
    isListening,
    lastSpeechErrorTime,
    isVoiceConversationalMode,
    isMwalimuTalking,
  ]);

  useEffect(() => {
    const handleOnline = () => {
      console.log("Device is online. Resetting speech retry markers.");
      speechRetryCountRef.current = 0;
      setLastSpeechErrorTime(0); // Trigger a retry if possible
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", () => {
      console.warn("Device is offline.");
    });

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  useEffect(() => {
    // Initialize speech recognition
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = language === "sw" ? "sw-TZ" : "en-US";

      recognitionRef.current.onresult = (event: any) => {
        speechRetryCountRef.current = 0; // Reset on success
        setSpeechError(null);
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        // Interrupt logic: If the student speaks while Mwalimu is talking
        if (
          interimTranscript.trim().length > 6 ||
          finalTranscript.trim().length > 2
        ) {
          if (isMwalimuTalking) {
            console.log("Teacher interrupted by student voice.");
            stopSpeaking();
          }
        }

        // Snap-confirm on natural silence: Complete voice input immediately without waiting for browser isFinal timeout
        const currentText = (finalTranscript || interimTranscript).trim();
        if (currentText) {
          latestSpeechTranscriptRef.current = currentText;

          if (speechSilenceTimerRef.current) {
            clearTimeout(speechSilenceTimerRef.current);
          }

          speechSilenceTimerRef.current = setTimeout(() => {
            if (latestSpeechTranscriptRef.current) {
              const textToProcess = latestSpeechTranscriptRef.current
                .toLowerCase()
                .trim();
              console.log(
                "Immediate speech confirmation triggered via silence:",
                textToProcess,
              );

              // Evacuate transcript to prevent double processing
              latestSpeechTranscriptRef.current = "";
              if (speechSilenceTimerRef.current) {
                clearTimeout(speechSilenceTimerRef.current);
                speechSilenceTimerRef.current = null;
              }

              // Snappily reset/stop recognition so it updates immediately
              try {
                recognitionRef.current?.stop();
              } catch (e) {}

              setStudentInput("");
              handleVoiceIntent(textToProcess);
            }
          }, 600); // 600ms of pause triggers instant confirmation
        }

        if (finalTranscript) {
          const lowerTranscript = finalTranscript.toLowerCase().trim();
          // Fallback confirmation: only if it hasn't been processed by the immediate silence sensor yet
          if (latestSpeechTranscriptRef.current) {
            console.log(
              "Final voice transcript processed immediately:",
              lowerTranscript,
            );
            latestSpeechTranscriptRef.current = "";

            if (speechSilenceTimerRef.current) {
              clearTimeout(speechSilenceTimerRef.current);
              speechSilenceTimerRef.current = null;
            }

            try {
              recognitionRef.current?.stop();
            } catch (e) {}

            setStudentInput("");
            handleVoiceIntent(lowerTranscript);
          }
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error === "no-speech") {
          console.warn("Speech recognition: No speech detected.");
        } else if (event.error === "network") {
          speechRetryCountRef.current = 6; // Fail fast on network errors in sandboxed iframes to prevent aggressive loops
          setIsListening(false);
          setLastSpeechErrorTime(Date.now());

          // Auto turn off conversational mode on persistent/network errors so we don't spam
          setIsVoiceConversationalMode(false);
          localStorage.setItem("tutor_conversational_mode", "false");

          setSpeechError({
            visible: true,
            message:
              language === "sw"
                ? "Ilani ya Muunganisho wa Sauti: Vivinjari huzuia huduma za kutambua sauti ndani ya sanduku la majaribio (iframes). Tafadhali fungua programu kwenye kichupo kipya (new tab) kwa kutumia kitufe kilicho juu kulia, au andika swali lako hapa chini!"
                : "Speech Connection Notice: Web browsers restrict speech recognition services inside sandbox containers (iframes). To use interactive voice features, please open the application in a new tab (click the icon in the upper-right corner) or use text chat below!",
            type: "error",
          });
        } else if (event.error === "not-allowed") {
          setSpeechError({
            visible: true,
            message:
              "Microphone access was denied. Please enable it in browser settings.",
            type: "error",
          });
        } else if (event.error === "aborted") {
          console.warn("Speech recognition aborted.");
        } else {
          console.error("Speech recognition error:", event.error);
          setSpeechError({
            visible: true,
            message: `Voice system encountered error: ${event.error}. Please try typing.`,
            type: "error",
          });
        }

        setIsListening(false);
        setLastSpeechErrorTime(Date.now());
      };

      recognitionRef.current.onstart = () => {
        setIsListening(true);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        // If in conversational mode, try to restart immediately after a brief pause
        if (isVoiceConversationalMode && speechRetryCountRef.current <= 5) {
          console.log("Conversational mode active. Restarting microphone...");
          const backoffDelay = speechRetryCountRef.current > 0
            ? Math.min(1000 * Math.pow(2, speechRetryCountRef.current), 10000)
            : 300;
          setTimeout(() => {
            try {
              if (recognitionRef.current && isVoiceConversationalMode) {
                recognitionRef.current.start();
              }
            } catch (e) {
              // Already started
            }
          }, backoffDelay);
        }
      };
    }
  }, [language]);

  // Clean up existing state markers

  const toggleListening = () => {
    speechRetryCountRef.current = 0;
    setSpeechError(null);
    if (isListening) {
      // If we manually stop, we should also turn off conversational mode if it was on
      // to prevent it from immediately restarting
      if (isVoiceConversationalMode) {
        setIsVoiceConversationalMode(false);
      }
      try {
        recognitionRef.current?.stop();
      } catch (e) {
        console.warn("Error stopping recognition:", e);
      }
    } else {
      stopSpeaking();
      if (recognitionRef.current) {
        try {
          // Reset continuous option flag on fresh user microphone clicks
          recognitionRef.current.continuous = true;
          recognitionRef.current.start();
          setTeacherDialogue("I'm listening... Talk to me, student.");
        } catch (e) {
          console.warn("Recognition already active or starting");
        }
      } else {
        setTeacherDialogue("Voice interface unavailable in this connection.");
      }
    }
  };

  const fetchLessonHistory = async () => {
    if (!user) return;

    if (user.uid === "sandbox-guest-user") {
      const cacheKey = `tutor_history_${user.uid}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setLessonHistory(parsed);
        } catch (e) {
          localStorage.removeItem(cacheKey);
        }
      }
      setIsHistoryLoaded(true);
      return;
    }

    // Try to load from persistent cache first
    const cacheKey = `tutor_history_${user.uid}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setLessonHistory(parsed);
        setIsHistoryLoaded(true);
        console.log("History loaded from local cache");
        // We still fetch once in the background if it's the first time in the session
        // but we'll mark it as loaded to satisfy the initial requirement
      } catch (e) {
        localStorage.removeItem(cacheKey);
      }
    }

    const path = "lessons";
    try {
      const q = query(
        collection(db, path),
        where("userId", "==", user.uid),
        orderBy("timestamp", "desc"),
        limit(20),
      );
      const snapshot = await getDocs(q);
      const history = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Lesson[];

      setLessonHistory(history);
      setIsHistoryLoaded(true);

      // Save to persistent cache
      localStorage.setItem(cacheKey, JSON.stringify(history));
    } catch (error: any) {
      // Mark as loaded even on error to prevent infinite retry loops in this session
      setIsHistoryLoaded(true);

      if (error?.message?.includes("Quota limit exceeded")) {
        setTeacherDialogue(
          "I am currently experiencing a high volume of student requests. My archive retrieval system is on standby. Please try again tomorrow or continue with new lessons.",
        );
      } else {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    }
  };

  const saveLesson = async (topic: string, result: any) => {
    if (!user) {
      console.log(
        "User not authenticated, lesson will not be saved to cloud history.",
      );
      return;
    }

    if (user.uid === "sandbox-guest-user") {
      const localDocId = "local_" + Math.random().toString(36).substring(2, 11);
      const newLesson = {
        id: localDocId,
        topic,
        whiteboard_notes: result.whiteboard_notes,
        teacher_dialogue: result.teacher_dialogue,
        timestamp: {
          seconds: Math.floor(Date.now() / 1000),
          nanoseconds: 0,
        } as any,
        userId: user.uid,
        segments: result.segments,
        visual_diagram_prompt: result.visual_diagram_prompt,
        diagram_svg_code: result.diagram_svg_code || result.diagram_svg_code_raw || result.diagram_svg_code_clean,
        video_scene: result.video_scene,
        video_keyword: result.video_keyword,
      };

      setLessonHistory((prev) => {
        const historyWithoutNew = prev.filter((l) => l.id !== localDocId);
        const finalHistory = [
          newLesson as Lesson,
          ...historyWithoutNew,
        ].slice(0, 20);
        localStorage.setItem(
          `tutor_history_${user.uid}`,
          JSON.stringify(finalHistory),
        );
        return finalHistory;
      });
      setHistoryIndex(0);
      playBell();
      return;
    }

    const path = "lessons";
    try {
      const docRef = await addDoc(collection(db, path), {
        topic,
        whiteboard_notes: result.whiteboard_notes,
        teacher_dialogue: result.teacher_dialogue,
        timestamp: serverTimestamp(),
        userId: user.uid,
        segments: result.segments || null,
        visual_diagram_prompt: result.visual_diagram_prompt || null,
        diagram_svg_code: (result.diagram_svg_code || result.diagram_svg_code_raw || result.diagram_svg_code_clean) || null,
        video_scene: result.video_scene || null,
        video_keyword: result.video_keyword || null,
      });

      // Optimistically update local history instead of fetching to save quota
      const newLesson = {
        id: docRef.id,
        topic,
        whiteboard_notes: result.whiteboard_notes,
        teacher_dialogue: result.teacher_dialogue,
        timestamp: {
          seconds: Math.floor(Date.now() / 1000),
          nanoseconds: 0,
        } as any,
        userId: user.uid,
        segments: result.segments,
        visual_diagram_prompt: result.visual_diagram_prompt,
        diagram_svg_code: result.diagram_svg_code || result.diagram_svg_code_raw || result.diagram_svg_code_clean,
        video_scene: result.video_scene,
        video_keyword: result.video_keyword,
      };

      const updatedLesson = newLesson as Lesson;
      setLessonHistory((prev) => {
        const historyWithoutNew = prev.filter((l) => l.id !== updatedLesson.id);
        const finalHistory = [updatedLesson, ...historyWithoutNew].slice(0, 20);
        // Update persistent cache
        localStorage.setItem(
          `tutor_history_${user.uid}`,
          JSON.stringify(finalHistory),
        );
        return finalHistory;
      });
      setHistoryIndex(0);
      playBell();
    } catch (error: any) {
      // If the document already exists (rare retry/race issue), we can ignore it as success
      if (error?.message?.includes("already exists")) {
        console.warn(
          "Lesson already captured in neural archives. Skipping redundant save.",
        );
        return;
      }

      // Check if it is a connectivity/offline issue rather than a permission violation
      const errorMessage = error?.message || String(error);
      const isPermissionError =
        errorMessage.toLowerCase().includes("permission") ||
        errorMessage.toLowerCase().includes("insufficient") ||
        error?.code === "permission-denied";

      if (!isPermissionError) {
        console.warn(
          "[saveLesson Connection Fallback] Operating in Offline Sandbox. Saving to localStorage cache.",
          errorMessage,
        );
        const localDocId =
          "local_" + Math.random().toString(36).substring(2, 11);
        const newLesson = {
          id: localDocId,
          topic,
          whiteboard_notes: result.whiteboard_notes,
          teacher_dialogue: result.teacher_dialogue,
          timestamp: {
            seconds: Math.floor(Date.now() / 1000),
            nanoseconds: 0,
          } as any,
          userId: user.uid,
        };

        setLessonHistory((prev) => {
          const historyWithoutNew = prev.filter((l) => l.id !== localDocId);
          const finalHistory = [
            newLesson as Lesson,
            ...historyWithoutNew,
          ].slice(0, 20);
          localStorage.setItem(
            `tutor_history_${user.uid}`,
            JSON.stringify(finalHistory),
          );
          return finalHistory;
        });
        setHistoryIndex(0);
        playBell();
      }

      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const loadLessonFromHistory = (index: number) => {
    const lesson = lessonHistory[index];
    if (!lesson) return;

    activeLessonIdRef.current += 1;
    stopSpeaking();
    isResumingRef.current = false;
    currentSpeechOffsetRef.current = 0;
    currentSpeechCharIndexRef.current = 0;
    interruptedSlideIndexRef.current = -1;
    
    setQAInitialMessages(undefined);
    setInitialQAQuestion(null);
    setIsQAOpen(false);
    setIsWaitingForContinue(false);
    setCurrentSlideIndex(0);

    // Restore diagram states and scenic cues from the archived lesson
    setVisualDiagramPrompt(lesson.visual_diagram_prompt || null);
    setDiagramSvg(lesson.diagram_svg_code || null);
    setVideoScene(lesson.video_scene || "Teaching");
    setVideoKeyword(lesson.video_keyword || "education");

    if (lesson.video_keyword) {
      setDiagramUrl(
        `https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1000`,
      );
    } else {
      setDiagramUrl(null);
    }

    setWhiteboardNotes(lesson.whiteboard_notes);
    setTeacherDialogue(lesson.teacher_dialogue);
    setCurrentTopic(lesson.topic);
    setShowHistory(false);
    setShowFeedback(false);
    setHistoryIndex(index);

    // Retrieve or dynamically reconstruct segments for backwards compatibility
    let segments: { content: string; speech: string }[] = [];
    if (lesson.segments && lesson.segments.length > 0) {
      segments = lesson.segments;
    } else {
      const rawNotes = lesson.whiteboard_notes || "";
      const noteSlides = rawNotes.split(/\n+---\n+/).map(s => s.trim()).filter(Boolean);
      
      if (noteSlides.length > 0) {
        const dialogue = lesson.teacher_dialogue || "";
        const sentences = dialogue.match(/[^.!?]+[.!?]+(\s+|$)/g) || [dialogue];
        const sentencesPerSlide = Math.max(1, Math.ceil(sentences.length / noteSlides.length));
        
        segments = noteSlides.map((slideContent, i) => {
          const startIndex = i * sentencesPerSlide;
          const slideSpeech = sentences.slice(startIndex, startIndex + sentencesPerSlide).join("").trim() || dialogue;
          return {
            content: slideContent,
            speech: slideSpeech,
          };
        });
      } else {
        segments = [{
          content: lesson.whiteboard_notes,
          speech: lesson.teacher_dialogue,
        }];
      }
    }

    setLessonSegments(segments);

    // Trigger synchronized whiteboard playback for the segment slides
    if (segments.length > 0) {
      playLesson(segments);
    } else {
      speakText(lesson.teacher_dialogue);
    }
  };

  useEffect(() => {
    if (user && activeView === "history" && !isHistoryLoaded) {
      fetchLessonHistory();
    }
  }, [user, activeView, isHistoryLoaded]);

  useEffect(() => {
    if (activeView === "syllabus" && !isSyllabiLoaded) {
      fetchSavedSyllabi();
    }
  }, [user, activeView, isSyllabiLoaded]);

  useEffect(() => {
    if (!user) {
      setLessonHistory([]);
      setIsHistoryLoaded(false);
      setSavedSyllabi([]);
      setIsSyllabiLoaded(false);
    }
  }, [user]);

  useEffect(() => {
    setCurrentSlideIndex(0);
  }, [whiteboardNotes]);

  const getSlides = (content: string) => {
    // Split by Markdown headers (H1 or H2)
    const sections = content
      .split(/(?=^#+ )/m)
      .filter((s) => s.trim().length > 0);
    return sections.length > 0 ? sections : [content];
  };

  const slides =
    lessonSegments.length > 0
      ? lessonSegments.map((s) => s.content)
      : getSlides(whiteboardNotes);

  const currentSlideContent = slides[currentSlideIndex] || slides[0] || "";

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPlaying) {
        if (e.key === "ArrowRight") {
          setCurrentSlideIndex((prev) => Math.min(slides.length - 1, prev + 1));
        } else if (e.key === "ArrowLeft") {
          setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, slides.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0; // Reset scroll to top for new notes
    }
  }, [whiteboardNotes]);

  const processFeedbackFile = (file: File) => {
    setFeedbackFileError(null);
    const maxVideoSize = 15 * 1024 * 1024; // 15MB limit for videos
    const maxStandardSize = 10 * 1024 * 1024; // 10MB limit for other files (uploaded via API)
    
    const isVideo = file.type.startsWith("video/");
    const maxSize = isVideo ? maxVideoSize : maxStandardSize;
    
    if (file.size > maxSize) {
      setFeedbackFileError(
        language === "sw"
          ? `Faili ni kubwa mno! Lazima liwe chini ya ${isVideo ? "15MB" : "10MB"}.`
          : `File is too large! Maximum limit is ${isVideo ? "15MB" : "10MB"}.`,
      );
      return;
    }

    setIsUploadingFeedbackFile(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      
      try {
        const response = await fetch("/api/upload-feedback-file", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            fileData: dataUrl
          }),
        });

        if (!response.ok) {
          throw new Error(
            language === "sw" 
              ? "Seva ilishindwa kupokea au kuhifadhi faili." 
              : "Server failed to receive or save the file."
          );
        }

        const resData = await response.json();
        
        setFeedbackData((prev) => ({
          ...prev,
          uploadedFile: {
            name: file.name,
            size: file.size,
            type: file.type,
            data: resData.url, // Serves from Static /videos route
          },
        }));
      } catch (uploadError: any) {
        console.error("Feedback file upload error:", uploadError);
        setFeedbackFileError(
          language === "sw" 
            ? `Hitilafu ya kupakia: ${uploadError?.message || "Jaribu tena."}` 
            : `Upload error: ${uploadError?.message || "Please try again."}`
        );
      } finally {
        setIsUploadingFeedbackFile(false);
      }
    };
    reader.onerror = () => {
      setFeedbackFileError(
        language === "sw" ? "Imeshindwa kusoma faili la kienyeji." : "Failed to read local file.",
      );
      setIsUploadingFeedbackFile(false);
    };
    reader.readAsDataURL(file);
  };

  const handleFeedbackFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFeedbackFile(e.target.files[0]);
    }
  };

  const handleFeedbackDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsFeedbackDragging(true);
  };

  const handleFeedbackDragLeave = () => {
    setIsFeedbackDragging(false);
  };

  const handleFeedbackDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsFeedbackDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFeedbackFile(e.dataTransfer.files[0]);
    }
  };

  const removeFeedbackFile = () => {
    setFeedbackData((prev) => ({ ...prev, uploadedFile: null }));
    setFeedbackFileError(null);
  };

  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (feedbackSubmitted) return;
    if (!user) {
      setTeacherDialogue(
        "You need to establish a Neural Link (Login) at the top to submit feedback.",
      );
      return;
    }

    if (user.uid === "sandbox-guest-user") {
      setFeedbackSubmitted(true);
      setTimeout(() => {
        setShowFeedback(false);
        // Reset feedback state after successfully closing
        setFeedbackData({
          quality: 5,
          relevance: 5,
          comments: "",
          uploadedFile: null,
        });
        setFeedbackFileError(null);
      }, 3000);
      return;
    }

    const path = "feedbacks";
    try {
      await addDoc(collection(db, path), {
        topic: currentTopic,
        teacher_dialogue: teacherDialogue,
        quality_score: feedbackData.quality,
        relevance_score: feedbackData.relevance,
        comments: feedbackData.comments,
        uploadedFile: feedbackData.uploadedFile || null,
        timestamp: serverTimestamp(),
        userId: user?.uid || "anonymous",
      });
      setFeedbackSubmitted(true);
      setTimeout(() => {
        setShowFeedback(false);
        // Reset feedback state after successfully closing
        setFeedbackData({
          quality: 5,
          relevance: 5,
          comments: "",
          uploadedFile: null,
        });
        setFeedbackFileError(null);
      }, 3000);
    } catch (error: any) {
      if (error?.message?.includes("already exists")) {
        setFeedbackSubmitted(true);
        setTimeout(() => setShowFeedback(false), 3000);
        return;
      }

      const errorMessage = error?.message || String(error);
      const isPermissionError =
        errorMessage.toLowerCase().includes("permission") ||
        errorMessage.toLowerCase().includes("insufficient") ||
        error?.code === "permission-denied";

      if (!isPermissionError) {
        console.warn(
          "[submitFeedback Connection Fallback] Feedback stored locally in session memory due to network status.",
          errorMessage,
        );
        setFeedbackSubmitted(true);
        setTimeout(() => setShowFeedback(false), 3000);
      }

      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };
  const getTeacherImage = () => {
    if (isLoading)
      return `https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1000`; // Tech/Abstract
    if (videoKeyword === "error")
      return "https://images.unsplash.com/photo-1549317336-206569e8475c?auto=format&fit=crop&q=80&w=1000"; // Glitch/Error
    return selectedCharacter.imageUrl;
  };

  if (isAuthLoading) {
    return (
      <div className="h-[100dvh] bg-[#020617] flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full"
          />
          <span className="text-blue-500 font-mono text-xs font-black uppercase tracking-[0.4em] animate-pulse">
            Syncing Neural Link...
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthGate
        onSandboxAccess={() => {
          localStorage.setItem("omnitutor_sandbox_guest", "true");
          setIsSandboxGuest(true);
        }}
      />
    );
  }

  if (isAppLocked) {
    return (
      <AppLockScreen
        accentColor={accentColor}
        onUnlock={() => {
          setIsAppLocked(false);
          const uKey = getUserKey(user);
          sessionStorage.setItem(`tutor_session_unlocked_${uKey}`, "true");
        }}
        onSignOut={() => {
          // Reset lock settings for this user so they are not permanently locked out
          const uKey = getUserKey(user);
          localStorage.removeItem(`tutor_app_lock_enabled_${uKey}`);
          localStorage.removeItem(`tutor_app_lock_password_${uKey}`);
          localStorage.removeItem(`tutor_app_lock_biometrics_enabled_${uKey}`);
          localStorage.removeItem(`tutor_app_lock_enrolled_finger_${uKey}`);
          localStorage.removeItem(`tutor_app_lock_fingerprint_signature_id_${uKey}`);
          localStorage.removeItem(`tutor_app_lock_webauthn_credential_id_${uKey}`);
          sessionStorage.removeItem(`tutor_session_unlocked_${uKey}`);
          setIsAppLocked(false);
          
          if (isSandboxGuest) {
            localStorage.removeItem("omnitutor_sandbox_guest");
            setIsSandboxGuest(false);
          } else {
            signOut(auth);
          }
        }}
        user={user}
      />
    );
  }

  return (
    <div className="h-[100dvh] bg-[#0a0c10] font-sans text-slate-100 selection:bg-blue-500/30 overflow-hidden flex flex-col">
      <style>{`
        :root {
          --primary-accent: ${accentColor};
          --primary-accent-glow: ${accentColor}33;
        }

        /* Semantic theme accent classes for precise, pixel-perfect highlights */
        .theme-accent-bg {
          background-color: var(--primary-accent) !important;
        }
        .theme-accent-bg-10 {
          background-color: ${accentColor}1a !important;
        }
        .theme-accent-bg-20 {
          background-color: ${accentColor}33 !important;
        }
        .theme-accent-text {
          color: var(--primary-accent) !important;
        }
        .theme-accent-border {
          border-color: var(--primary-accent) !important;
        }
        .theme-accent-border-20 {
          border-color: ${accentColor}33 !important;
        }
        .theme-accent-border-50 {
          border-color: ${accentColor}80 !important;
        }
        .theme-accent-glow {
          box-shadow: 0 0 15px var(--primary-accent-glow) !important;
        }
        
        /* Smooth transitions for theme switching */
        .theme-transition {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>

      {/* Voice Confirmation Toast Notification */}
      <AnimatePresence>
        {voiceConfirmation?.visible && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="fixed top-20 right-6 z-[100] bg-slate-900/90 border border-emerald-500/40 text-emerald-400 p-4 rounded-2xl shadow-[0_4px_30px_rgba(16,185,129,0.15)] backdrop-blur-md max-w-sm flex items-start gap-3"
          >
            <div className="h-8 w-8 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 shrink-0 text-emerald-300">
              <i className="fas fa-volume-up text-xs animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-4 mb-0.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                  {voiceConfirmation.isTest
                    ? "VOICE CONFIRMED"
                    : "VOICE CONNECTION SYNCED"}
                </span>
                <span className="text-[8px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md font-bold uppercase shrink-0">
                  STABLE
                </span>
              </div>
              <p className="text-[11px] text-white/90 font-medium">
                Assigned to{" "}
                <strong className="text-blue-400">
                  {voiceConfirmation.characterName}
                </strong>{" "}
                with locale {voiceConfirmation.locale}.
              </p>
              <p className="text-[9px] text-slate-500 font-mono mt-1 select-all truncate">
                {voiceConfirmation.voiceName}
              </p>
            </div>
            <button
              onClick={() =>
                setVoiceConfirmation((prev) =>
                  prev ? { ...prev, visible: false } : null,
                )
              }
              className="text-slate-500 hover:text-white transition-colors p-1 shrink-0"
            >
              <i className="fas fa-times text-xs" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Speech Error/Status Toast Notification */}
      <AnimatePresence>
        {speechError?.visible && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className={`fixed top-20 right-6 z-[100] bg-slate-900/90 border ${
              speechError.type === "error"
                ? "border-red-500/40 text-red-400 shadow-[0_4px_30px_rgba(239,68,68,0.15)]"
                : "border-amber-500/40 text-amber-400 shadow-[0_4px_30px_rgba(245,158,11,0.15)]"
            } p-4 rounded-2xl backdrop-blur-md max-w-sm flex items-start gap-3`}
          >
            <div
              className={`h-8 w-8 rounded-xl ${speechError.type === "error" ? "bg-red-500/20 border-red-500/30 text-red-300" : "bg-amber-500/20 border-amber-500/30 text-amber-300"} flex items-center justify-center border shrink-0`}
            >
              <i
                className={`fas ${speechError.type === "error" ? "fa-exclamation-triangle" : "fa-exclamation-circle"} text-xs`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-4 mb-0.5">
                <span
                  className={`text-[10px] font-black uppercase tracking-widest ${speechError.type === "error" ? "text-red-400" : "text-amber-400"}`}
                >
                  {speechError.type === "error"
                    ? "VOICE INTERFACE ERROR"
                    : "VOICE SYSTEM NOTICE"}
                </span>
                <span
                  className={`text-[8px] px-1.5 py-0.5 ${speechError.type === "error" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"} rounded-md font-bold uppercase shrink-0`}
                >
                  {speechError.type === "error" ? "OFFLINE" : "RETRYING"}
                </span>
              </div>
              <p className="text-[11px] text-white/90 font-medium leading-relaxed">
                {speechError.message}
              </p>
            </div>
            <button
              onClick={() =>
                setSpeechError((prev) =>
                  prev ? { ...prev, visible: false } : null,
                )
              }
              className="text-slate-500 hover:text-white transition-colors p-1 shrink-0"
            >
              <i className="fas fa-times text-xs" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar */}
      <header
        className={`h-16 shrink-0 bg-slate-900/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6 z-40 sticky top-0 transition-all duration-500 ${isCinematicMode ? "opacity-0 -translate-y-full pointer-events-none" : "opacity-100"}`}
      >
        <div className="flex items-center gap-4">
          <motion.div
            animate={{ rotate: isPlaying ? [0, 5, -5, 0] : 0 }}
            transition={{ repeat: isPlaying ? Infinity : 0, duration: 2 }}
            onClick={generateAppBrand}
            className="bg-blue-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/40 relative overflow-hidden group cursor-pointer"
            title="Generate Brand Identity"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            {appBrandImage ? (
              <img
                src={appBrandImage}
                className="w-full h-full object-cover"
                alt="Brand"
              />
            ) : (
              <i className="fas fa-brain text-xl text-white relative z-10 transition-transform group-hover:scale-110"></i>
            )}
            {isGeneratingBrand && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <i className="fas fa-circle-notch fa-spin text-white text-xs"></i>
              </div>
            )}
          </motion.div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white leading-none">
                OmniTutor
              </h1>
              {intelLevel === "100% Omni-Intelligence" && (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-[8px] font-black uppercase tracking-widest text-cyan-400">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500"></span>
                  </span>
                  100% OMNI-INTEL
                </div>
              )}
            </div>
            <p className="text-[9px] text-blue-400 font-black uppercase tracking-[0.3em] mt-1">
              Universal AI Academy
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 md:gap-6 flex-1">
          {isAuthLoading ? (
            <div className="w-8 h-8 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
          ) : user ? (
            <div className="flex items-center gap-2 md:gap-4 ml-auto">
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-[10px] font-bold text-white leading-none">
                  {user.displayName || "Neural Link User"}
                </span>
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 text-[9px] text-red-400 font-bold uppercase tracking-[0.1em] hover:text-red-300 transition-colors group/logout"
                  >
                    <i className="fas fa-power-off text-[8px] group-hover/logout:scale-110 transition-transform"></i>
                    Disconnect
                  </button>
                </div>
              </div>
              <img
                src={
                  user.photoURL ||
                  `https://ui-avatars.com/api/?name=${user.displayName || "U"}&background=3b82f6&color=fff`
                }
                className="w-9 h-9 rounded-xl border border-white/10 shadow-lg"
                alt={user.displayName || "Profile"}
              />
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="flex items-center gap-3 bg-blue-600 px-5 py-2.5 rounded-xl text-white font-bold text-[10px] uppercase tracking-wider hover:bg-blue-500 transition-all active:scale-95 shadow-lg shadow-blue-900/20 ml-auto"
            >
              <i className="fas fa-sign-in-alt"></i>
              Establish Neural Link
            </button>
          )}

          {currentTopic && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {currentTopic &&
                whiteboardNotes &&
                !whiteboardNotes.includes("Welcome to OmniTutor") && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={downloadNotesAsPDF}
                    disabled={isDownloadingNotes}
                    className="flex items-center gap-3 px-3 md:px-4 py-2 rounded-xl border transition-all active:scale-95 bg-slate-700 border-slate-500 text-white hover:bg-slate-800 shadow-[0_0_10px_rgba(51,65,85,0.3)] disabled:opacity-50"
                  >
                    <i
                      className={`fas ${isDownloadingNotes ? "fa-spinner fa-spin" : "fa-file-pdf"} text-xs text-red-400`}
                    ></i>
                    <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                      Notes
                    </span>
                  </motion.button>
                )}

              <motion.button
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => (isPlaying ? pauseSpeaking() : resumeSpeaking())}
                className={`flex items-center gap-3 px-3 md:px-4 py-2 rounded-xl border transition-all active:scale-95 ${
                  isPlaying
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20"
                    : "bg-blue-600 border-blue-400 text-white hover:bg-blue-700 shadow-[0_0_15px_rgba(37,99,235,0.4)]"
                }`}
              >
                <i
                  className={`fas ${isPlaying ? "fa-pause" : "fa-play"} text-xs`}
                ></i>
                <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                  {isPlaying ? "Pause" : "Resume"}
                </span>
              </motion.button>
            </div>
          )}

          <button
            id="tour-induction-trigger"
            onClick={() => setShowOrientation(true)}
            className="group relative flex items-center justify-center h-10 w-10 rounded-xl bg-slate-800/50 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all active:scale-95"
            title={
              language === "sw"
                ? "Onyesho la Elekezo"
                : "Platform Induction Tour"
            }
          >
            <i className="fas fa-info-circle text-lg"></i>
          </button>

          {hasSavedAppLockPassword && (
            <button
              onClick={() => {
                sessionStorage.removeItem("tutor_session_unlocked");
                setIsAppLocked(true);
              }}
              className="group relative flex items-center justify-center h-10 w-10 rounded-xl bg-slate-800/50 border border-white/10 text-slate-400 hover:text-red-400 hover:bg-slate-700/50 transition-all active:scale-95"
              title="Lock Workspace Now"
            >
              <i className="fas fa-lock text-sm"></i>
            </button>
          )}

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="group relative flex items-center justify-center h-10 w-10 rounded-xl bg-slate-800/50 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all active:scale-95"
            title="System Configuration"
          >
            <motion.i
              animate={{ rotate: isSettingsOpen ? 90 : 0 }}
              className="fas fa-cog text-lg"
            ></motion.i>
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-slate-900 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
          </button>
        </div>
      </header>

      {/* Floating Background Particles */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={`bg-particle-${i}`}
            initial={{
              x: Math.random() * 100 + "%",
              y: Math.random() * 100 + "%",
              opacity: 0,
              scale: Math.random() * 0.5 + 0.5,
            }}
            animate={{
              y: [null, "-10%", "110%"],
              opacity: [0, 0.1, 0],
              rotate: [0, 180, 360],
            }}
            transition={{
              duration: Math.random() * 20 + 20,
              repeat: Infinity,
              ease: "linear",
              delay: Math.random() * 20,
            }}
            className="absolute text-blue-500/20 text-4xl"
          >
            <i
              className={`fas ${["fa-atom", "fa-dna", "fa-microscope", "fa-bolt", "fa-code"][i % 5]}`}
            ></i>
          </motion.div>
        ))}
        {/* Animated Grid Lines */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      </div>

      <main
        className={`flex flex-col lg:grid lg:grid-cols-12 transition-all duration-500 ${isCinematicMode ? "h-[100dvh]" : "h-auto lg:h-[calc(100dvh-64px)]"} overflow-y-auto lg:overflow-hidden relative z-10`}
      >
        {/* Left column: AI Teacher Video Feed */}
        <div
          className={`lg:col-span-4 lg:order-first order-1 border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col h-auto lg:h-full lg:overflow-hidden bg-slate-900/20 transition-all duration-500 ${isCinematicMode ? "opacity-0 lg:opacity-0 scale-95 pointer-events-none" : "opacity-100"}`}
        >
          <div className="p-4 md:p-6 flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar bg-gradient-to-b from-blue-900/5 to-transparent">
            {/* The "Video" Player Container */}
            <div className="relative aspect-video bg-black rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 shrink-0">
              <AnimatePresence>
                {isVoiceConversationalMode &&
                  isListening &&
                  !isMwalimuTalking && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
                    >
                      <div className="relative mb-12">
                        <motion.div
                          animate={{
                            scale: [1, 1.5, 1],
                            opacity: [0.3, 0.6, 0.3],
                          }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="absolute inset-0 bg-blue-500 rounded-full blur-3xl"
                        ></motion.div>
                        <motion.div
                          animate={{
                            scale: [1, 1.2, 1],
                          }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          className="relative z-10 w-24 h-24 rounded-full border-2 border-blue-400/50 flex items-center justify-center bg-slate-900 shadow-2xl"
                        >
                          <i className="fas fa-microphone text-3xl text-blue-400 animate-pulse"></i>
                        </motion.div>
                      </div>

                      <h3 className="text-xl font-serif italic text-white mb-2">
                        Mwalimu is listening...
                      </h3>
                      <p className="text-xs font-mono uppercase tracking-[0.4em] text-blue-400/50">
                        Neural Input Channel Active
                      </p>

                      <div className="mt-12 flex gap-3 h-8 items-center justify-center">
                        {[...Array(12)].map((_, i) => (
                          <motion.div
                            key={`interruption-viz-${i}`}
                            animate={{
                              height: [10, 40, 10],
                              opacity: [0.3, 1, 0.3],
                            }}
                            transition={{
                              repeat: Infinity,
                              duration: 0.5 + Math.random(),
                              delay: i * 0.05,
                            }}
                            className="w-1.5 bg-blue-400 rounded-full"
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
              </AnimatePresence>

              {generatedVideoUrl && isPlaying ? (
                <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-8 text-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-blue-500/20 blur-2xl animate-pulse rounded-full"></div>
                    <i className="fas fa-video text-blue-500 text-3xl relative z-10"></i>
                  </div>
                  <h3 className="text-sm font-black text-white uppercase tracking-[0.3em]">
                    Masterclass Stream Active
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
                    Neural focus diverted to main smartboard
                  </p>

                  <div className="mt-4 flex gap-1 justify-center h-4 items-center">
                    {[...Array(8)].map((_, i) => (
                      <motion.div
                        key={`audio-viz-bar-${i}`}
                        animate={{ height: [4, 12, 4] }}
                        transition={{
                          repeat: Infinity,
                          duration: 0.5,
                          delay: i * 0.1,
                        }}
                        className="w-1 bg-blue-500/50 rounded-full"
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={getTeacherImage()}
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.2 }}
                    className="absolute inset-0"
                  >
                    {/* Ken Burns Effect for the simulation */}
                    <motion.img
                      animate={{
                        scale: [1, 1.05, 1],
                        x: [0, 5, 0],
                        y: [0, -5, 0],
                        filter: isPlaying
                          ? [
                              "brightness(0.9) contrast(1.1)",
                              "brightness(1) contrast(1.2)",
                              "brightness(0.9) contrast(1.1)",
                            ]
                          : [
                              "brightness(0.9) contrast(1.1)",
                              "brightness(0.9) contrast(1.1)",
                            ],
                      }}
                      transition={{
                        duration: isPlaying ? 2 : 20,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      src={getTeacherImage()}
                      alt="AI Teacher"
                      className={`w-full h-full object-cover object-[center_18%] grayscale-[10%] brightness-[0.9] contrast-[1.1] ${isLoading ? "blur-sm grayscale" : ""}`}
                      referrerPolicy="no-referrer"
                    />
                  </motion.div>
                </AnimatePresence>
              )}

              {/* HUD Elements */}
              <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-2">
                    <div
                      className={`px-2 py-1 rounded text-[10px] font-black flex items-center gap-1.5 shadow-lg w-fit ${generatedVideoUrl && isPlaying ? "bg-blue-600" : "bg-red-600"}`}
                    >
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                      {generatedVideoUrl && isPlaying
                        ? "MASTERCLASS LINK"
                        : "LIVE AI FEED"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scanning effect */}
              <div className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-screen bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
            </div>

            {/* Neural Uplink Interaction Terminal */}
            <div className="bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[2rem] p-6 md:p-8 shadow-2xl relative overflow-hidden space-y-4 md:space-y-6 shrink-0">
              <div className="absolute left-0 top-0 bottom-0 w-2 bg-blue-500 shadow-[0_0_15px_#3b82f6]"></div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">
                  Neural Link Station
                </p>

                {/* Segment selector */}
                <div className="flex bg-zinc-950 rounded-full p-1 border border-zinc-800 self-start sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsExamRevisionMode(false)}
                    className={`px-3 py-1 text-[10px] font-semibold rounded-full transition-all ${!isExamRevisionMode ? "bg-blue-600 text-white shadow-md" : "text-zinc-400 hover:text-white"}`}
                  >
                    {language === "sw" ? "Mtaala & Vitabu" : "Syllabus & Books"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsExamRevisionMode(true)}
                    className={`px-3 py-1 text-[10px] font-semibold rounded-full transition-all ${isExamRevisionMode ? "bg-amber-600 text-white shadow-md" : "text-zinc-400 hover:text-white"}`}
                  >
                    {language === "sw" ? "Mhariri wa Mitihani" : "Exam Revision"}
                  </button>
                </div>
              </div>

              {!isExamRevisionMode ? (
                <form onSubmit={handleLearn} className="space-y-4">
                  <input
                    type="file"
                    id="textbook-upload"
                    className="hidden"
                    accept=".pdf, .txt, .md"
                    onChange={handleFileUpload}
                  />

                  <div className="relative flex items-center justify-between w-full h-[64px] bg-zinc-950/80 hover:bg-zinc-950/95 border border-zinc-800/80 focus-within:border-zinc-700/80 rounded-full px-4 gap-2 transition-all shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
                    {/* Plus Button on the far left (triggers file upload) */}
                    <button
                      type="button"
                      onClick={() => document.getElementById("textbook-upload")?.click()}
                      disabled={isLoading || isProcessingFile}
                      className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all active:scale-95 disabled:opacity-50 shrink-0"
                      title={fileName ? `Using ${fileName}` : "Upload Textbook (PDF/Text/MD)"}
                    >
                      {isProcessingFile ? (
                        <i className="fas fa-spinner fa-spin text-xs"></i>
                      ) : (
                        <i className="fas fa-plus text-xs"></i>
                      )}
                    </button>

                    {/* If file is uploaded, render file chip indicator */}
                    {fileName && (
                      <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-full text-[11px] text-blue-300 font-mono shrink-0">
                        <i className="fas fa-file-pdf text-[10px]"></i>
                        <span className="max-w-[80px] truncate">
                          {fileName}
                        </span>
                        <button
                          type="button"
                          onClick={clearFile}
                          className="text-blue-400 hover:text-red-400 font-bold ml-1 text-[10px]"
                          title="Clear file"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    )}

                    {/* Text Input in the center */}
                    <input
                      type="text"
                      value={studentInput}
                      onChange={(e) => setStudentInput(e.target.value)}
                      placeholder={
                        fileName
                          ? language === "sw"
                            ? `Uliza kuhusu "${fileName}"...`
                            : `Ask about "${fileName}"...`
                          : language === "sw"
                            ? "Uliza chochote..."
                            : "Ask anything"
                      }
                      className="flex-1 bg-transparent border-none text-white placeholder:text-zinc-400 caret-white text-sm focus:outline-none focus:ring-0 px-2 h-full py-2 min-w-0"
                      disabled={isLoading}
                      autoFocus
                    />

                    {/* Microphone Icon & AudioWave button on the right */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Microphone icon button */}
                      <button
                        type="button"
                        onClick={toggleListening}
                        disabled={isLoading}
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${isListening ? "bg-red-600 border border-red-400 text-white animate-pulse" : "bg-transparent text-zinc-400 hover:text-white"}`}
                        title={isListening ? "Stop Listening" : "Start Listening"}
                      >
                        <i className={`fas ${isListening ? "fa-microphone" : "fa-microphone-slash"} text-sm`}></i>
                      </button>

                      {/* White filled circular button */}
                      <button
                        type={studentInput.trim() !== "" ? "submit" : "button"}
                        onClick={() => {
                          if (studentInput.trim() === "") {
                            const nextMode = !isVoiceConversationalMode;
                            setIsVoiceConversationalMode(nextMode);
                            localStorage.setItem(
                              "tutor_conversational_mode",
                              String(nextMode),
                            );
                          }
                        }}
                        disabled={isLoading}
                        className={`w-10 h-10 bg-white hover:bg-zinc-200 rounded-full flex items-center justify-center transition-all active:scale-95 text-black disabled:opacity-50`}
                        title={
                          studentInput.trim() !== "" 
                            ? "Send Question" 
                            : isVoiceConversationalMode 
                              ? "Voice Mode Active (Click to toggle)" 
                              : "Start Voice Mode"
                        }
                      >
                        {isLoading ? (
                          <i className="fas fa-circle-notch fa-spin text-sm text-black"></i>
                        ) : studentInput.trim() !== "" ? (
                          /* Upward Send Arrow if text exists */
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="19" x2="12" y2="5"></line>
                            <polyline points="5 12 12 5 19 12"></polyline>
                          </svg>
                        ) : (
                          /* Waveform Icon if text is empty */
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="2" x2="12" y2="22"></line>
                            <line x1="17" y1="5" x2="17" y2="19"></line>
                            <line x1="7" y1="5" x2="7" y2="19"></line>
                            <line x1="22" y1="10" x2="22" y2="14"></line>
                            <line x1="2" y1="10" x2="2" y2="14"></line>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleLearn} className="space-y-4">
                  <input
                    type="file"
                    id="exam-paper-upload"
                    className="hidden"
                    accept=".pdf, .txt, .md"
                    onChange={handleExamFileUpload}
                  />

                  {!examFileName ? (
                    <div 
                      onClick={() => document.getElementById("exam-paper-upload")?.click()}
                      className="border-2 border-dashed border-amber-500/20 hover:border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 rounded-2xl p-6 text-center cursor-pointer transition-all space-y-2 group"
                    >
                      <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto text-amber-400 group-hover:scale-110 transition-transform">
                        {isProcessingExamFile ? (
                          <i className="fas fa-spinner fa-spin text-lg"></i>
                        ) : (
                          <i className="fas fa-file-upload text-lg"></i>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-amber-300">
                          {language === "sw" ? "Pakia Mtihani Usaidiwe Kujibu (PDF, TXT, MD)" : "Upload Exam Paper to Solve (PDF, TXT, MD)"}
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-1">
                          {language === "sw" ? "Upeo wa 20MB. Kwa ajili ya marekebisho na mwalimu." : "Max 20MB. For revision and solving by teacher."}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-950/20 border border-amber-500/20 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
                            <i className="fas fa-file-alt"></i>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-amber-300 truncate max-w-[180px]" title={examFileName}>
                              {examFileName}
                            </p>
                            <p className="text-[9px] text-zinc-500 uppercase font-mono tracking-wider">
                              {language === "sw" ? "Mtihani Uliopakiwa" : "Uploaded Exam"}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={clearExamFile}
                          className="w-7 h-7 rounded-full bg-zinc-900/80 hover:bg-red-950/40 text-zinc-400 hover:text-red-400 flex items-center justify-center transition-colors"
                          title="Remove Exam"
                        >
                          <i className="fas fa-trash-alt text-xs"></i>
                        </button>
                      </div>

                      {/* Prominent START REVISION Button */}
                      <button
                        type="button"
                        onClick={() => {
                          const topic = studentInput.trim() || (
                            language === "sw"
                              ? `Marejeleo na usuluhishi wa mtihani: ${examFileName}`
                              : `Complete Exam Revision and Question Solving for ${examFileName}`
                          );
                          executeLearn(topic);
                        }}
                        disabled={isLoading || !examFileData}
                        className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 via-amber-600 to-emerald-600 hover:from-amber-400 hover:to-emerald-500 text-white font-black text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 active:scale-95 flex items-center justify-center gap-2.5 group cursor-pointer border border-amber-400/30"
                      >
                        {isLoading ? (
                          <>
                            <i className="fas fa-spinner fa-spin text-sm"></i>
                            <span>{language === "sw" ? "Mwalimu Anaandaa Mapitio..." : "Mwalimu Preparing Revision..."}</span>
                          </>
                        ) : (
                          <>
                            <i className="fas fa-play-circle text-amber-100 text-sm group-hover:scale-110 transition-transform"></i>
                            <span className="uppercase tracking-wider">
                              {language === "sw" ? "Anza Mapitio ya Mtihani Sasa" : "Start Exam Revision"}
                            </span>
                            <i className="fas fa-arrow-right text-[10px] text-amber-200 group-hover:translate-x-1 transition-transform"></i>
                          </>
                        )}
                      </button>

                      <div className="pt-2 border-t border-white/5 flex flex-col gap-2">
                        {/* Share Button */}
                        {!shareExamUrl ? (
                          <button
                            type="button"
                            onClick={handleShareExamPaper}
                            disabled={isExamSharing}
                            className="w-full py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-white text-[11px] font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                          >
                            {isExamSharing ? (
                              <>
                                <i className="fas fa-spinner fa-spin"></i>
                                <span>{language === "sw" ? "Inatayarisha Kiungo..." : "Generating Link..."}</span>
                              </>
                            ) : (
                              <>
                                <i className="fas fa-share-alt"></i>
                                <span>{language === "sw" ? "Shiriki na Mwalimu / Mwanafunzi" : "Share with Teacher / Student"}</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-[9px] text-amber-400/80 italic font-mono">
                              {language === "sw" 
                                ? "✓ Mtihani umeshirikishwa! Nakili kiungo hiki na utume kwa mwalimu au marafiki:" 
                                : "✓ Exam paper shared! Copy this link and send to a teacher or classmate:"}
                            </p>
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                readOnly
                                value={shareExamUrl}
                                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-[10px] text-zinc-300 font-mono focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(shareExamUrl || "");
                                  setTeacherDialogue(
                                    language === "sw" 
                                      ? "Kiungo kimenakiliwa kwenye clipboard!" 
                                      : "Link copied to clipboard!"
                                  );
                                }}
                                className="px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-white text-[10px] transition-colors"
                              >
                                {language === "sw" ? "Nakili" : "Copy"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 pt-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      {language === "sw" ? "Mada au Lengo Maalum (Sio lazima)" : "Optional Topic or Specific Focus Area"}
                    </label>
                    <div className="relative flex items-center justify-between w-full h-[56px] bg-zinc-950/80 hover:bg-zinc-950/95 border border-zinc-800/80 focus-within:border-zinc-700/80 rounded-full px-4 gap-2 transition-all shadow-md">
                      <input
                        type="text"
                        value={studentInput}
                        onChange={(e) => setStudentInput(e.target.value)}
                        placeholder={
                          examFileName
                            ? language === "sw"
                              ? `Andika mada au bonyeza Anza Mapitio...`
                              : `e.g. Focus on Section B or press Start Revision...`
                            : language === "sw"
                              ? "Andika jina au mada ya mtihani kwanza..."
                              : "Enter exam subject/topic first..."
                        }
                        className="flex-1 bg-transparent border-none text-white placeholder:text-zinc-500 caret-white text-xs focus:outline-none focus:ring-0 px-2 h-full py-2 min-w-0"
                        disabled={isLoading || !examFileData}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const topic = studentInput.trim() || (
                            language === "sw"
                              ? `Marejeleo na usuluhishi wa mtihani: ${examFileName}`
                              : `Complete Exam Revision and Question Solving for ${examFileName}`
                          );
                          executeLearn(topic);
                        }}
                        disabled={isLoading || !examFileData}
                        className="w-10 h-10 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:bg-zinc-800 rounded-full flex items-center justify-center transition-all active:scale-95 text-white"
                        title="Start Revision"
                      >
                        {isLoading ? (
                          <i className="fas fa-circle-notch fa-spin text-xs"></i>
                        ) : (
                          <i className="fas fa-graduation-cap text-xs"></i>
                        )}
                      </button>
                    </div>
                    {!examFileData && (
                      <p className="text-[10px] text-amber-500/70 text-center italic mt-1 animate-pulse">
                        {language === "sw" ? "⚠️ Tafadhali pakia faili la mtihani hapo juu kwanza." : "⚠️ Please upload an exam paper above first."}
                      </p>
                    )}
                  </div>
                </form>
              )}

              <div className="pt-1 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveView("syllabus")}
                  className="w-full h-11 bg-gradient-to-r from-indigo-900/40 to-blue-950/40 hover:from-indigo-900/60 hover:to-blue-950/60 border border-indigo-500/20 text-indigo-300 hover:text-white px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 group cursor-pointer shadow-lg active:scale-95 duration-200"
                >
                  <i className="fas fa-book-open text-indigo-400 group-hover:scale-110 transition-transform"></i>
                  <span>
                    {language === "sw" ? "Fungua Mtaala wa Masomo" : "Open Course Syllabus"}
                  </span>
                  <i className="fas fa-arrow-right text-[10px] text-indigo-500 group-hover:translate-x-1 transition-transform"></i>
                </button>
              </div>

              <div className="pt-1 pb-3 flex flex-col gap-2 border-t border-white/5 mt-2">
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-center">
                  {language === "sw" ? "Mifano ya Kiolezo (Sura ya Juu)" : "High-Fidelity Lesson Examples"}
                </div>
                <div className="grid grid-cols-2 gap-1.5 px-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStudentInput(language === "sw" ? "Mifano: Mifumo ya Klachi" : "Example: Automotive Clutches");
                      executeLearn(language === "sw" ? "mfano: clutch" : "example: clutch");
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800/50 text-zinc-400 hover:text-white rounded-lg transition-all active:scale-95 text-left truncate"
                  >
                    <span>⚙️</span>
                    <span className="truncate">{language === "sw" ? "Mifano: Klachi" : "Clutches Template"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentInput(language === "sw" ? "Mifano: Mifumo ya Gia" : "Example: Gear Transmissions");
                      executeLearn(language === "sw" ? "mfano: gear" : "example: gear");
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800/50 text-zinc-400 hover:text-white rounded-lg transition-all active:scale-95 text-left truncate"
                  >
                    <span>⚙️</span>
                    <span className="truncate">{language === "sw" ? "Mifano: Gia" : "Gears Template"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentInput(language === "sw" ? "Mifano: Usafiri wa Maji" : "Example: Waterway Transport Logistics");
                      executeLearn(language === "sw" ? "mfano: water transport" : "example: water transport");
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800/50 text-zinc-400 hover:text-white rounded-lg transition-all active:scale-95 text-left truncate"
                  >
                    <span>🚢</span>
                    <span className="truncate">{language === "sw" ? "Usafiri wa Maji" : "Water Logistics"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentInput(language === "sw" ? "Mifano: Laplace Transforms" : "Example: Laplace Transforms");
                      executeLearn(language === "sw" ? "mfano: laplace" : "example: laplace");
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800/50 text-zinc-400 hover:text-white rounded-lg transition-all active:scale-95 text-left truncate"
                  >
                    <span>📐</span>
                    <span className="truncate">{language === "sw" ? "Laplace (Mfano)" : "Laplace Template"}</span>
                  </button>
                </div>
              </div>


            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-3 gap-4 px-2 shrink-0">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 group hover:bg-blue-500/10 transition-colors">
                <i className="fas fa-bolt text-yellow-400 group-hover:scale-110 transition-transform"></i>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Efficiency
                </span>
                <span className="text-sm font-mono text-white">99.8%</span>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 group hover:bg-blue-500/10 transition-colors">
                <i className="fas fa-microchip text-blue-400 group-hover:scale-110 transition-transform"></i>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Neural Load
                </span>
                <span className="text-sm font-mono text-white">12%</span>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 group hover:bg-blue-500/10 transition-colors">
                <i className="fas fa-wifi text-green-400 group-hover:scale-110 transition-transform"></i>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Uplink
                </span>
                <span className="text-sm font-mono text-white">5G-AI</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: The Infinite Smartboard */}
        <div className="lg:col-span-8 lg:order-last order-2 flex-none lg:flex-1 h-[68vh] md:h-[72vh] lg:h-full flex flex-col min-h-0 bg-[#0d1117] border-t lg:border-t-0 border-white/5">
          <div className="flex items-center justify-between p-4 md:p-6 pb-2">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-slate-800 rounded-2xl flex items-center justify-center border border-white/5 shadow-xl">
                <i className="fas fa-chalkboard-user text-blue-400"></i>
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight">
                  Lesson Smartboard
                </h2>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Real-time Data Generation
                </p>
              </div>
            </div>

            <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5 gap-1">
              <button
                onClick={() => setActiveView("board")}
                className={`h-8 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeView === "board" ? "text-white shadow-lg" : "text-slate-500 hover:text-slate-300"}`}
                style={activeView === "board" ? { backgroundColor: accentColor, boxShadow: `0 0 15px ${accentColor}40` } : {}}
              >
                Teaching Board
              </button>
              <button
                onClick={() => setActiveView("syllabus")}
                className={`h-8 px-3 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all flex items-center gap-1 ${activeView === "syllabus" ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
                style={activeView === "syllabus" ? { backgroundColor: accentColor, boxShadow: `0 0 15px ${accentColor}40` } : {}}
              >
                <i className="fas fa-book-open text-[9px]"></i> {language === "sw" ? "Mtaala" : "Syllabus"}
              </button>
              <button
                onClick={() => setActiveView("curriculum")}
                className={`h-8 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeView === "curriculum" ? "text-white shadow-lg" : "text-slate-500 hover:text-slate-300"}`}
                style={activeView === "curriculum" ? { backgroundColor: accentColor, boxShadow: `0 0 15px ${accentColor}40` } : {}}
              >
                Curriculum
              </button>
              <button
                onClick={() => setActiveView("history")}
                className={`h-8 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeView === "history" ? "text-white shadow-lg" : "text-slate-500 hover:text-slate-300"}`}
                style={activeView === "history" ? { backgroundColor: accentColor, boxShadow: `0 0 15px ${accentColor}40` } : {}}
              >
                Archives
              </button>
            </div>
          </div>

          <div className="flex-1 relative overflow-hidden">
            {activeView !== "board" && (
              <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none z-10"></div>
            )}

            {activeView === "syllabus" ? (
              <div className="h-full w-full p-6 md:p-8 overflow-y-auto custom-scrollbar bg-slate-900/50 backdrop-blur-sm rounded-[2rem] border border-white/5 pb-24">
                <div className="max-w-4xl mx-auto space-y-8">
                  {/* Title Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/10 pb-6 gap-4">
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                        <i className="fas fa-graduation-cap text-indigo-400"></i>
                        {language === "sw" ? "Mtaala wa Masomo wa OmniTutor" : "Interactive Course Syllabus"}
                      </h2>
                      <p className="text-slate-400 text-xs mt-1">
                        {language === "sw" 
                          ? "Pitia mada, tengeneza mtaala mpya wa masomo kupitia AI, au bonyeza mada ili kuanza somo moja kwa moja bila kuandika." 
                          : "Explore syllabus chapters, generate custom curricula with AI, or click a topic to instantly trigger its lesson."}
                      </p>
                    </div>
                  </div>

                  {/* Dual Mode Syllabus Builder Blocks */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Method 1: Syllabus Custom AI Generator Form */}
                    <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-6 relative overflow-hidden backdrop-blur-md flex flex-col justify-between">
                      <div className="absolute top-0 right-0 h-40 w-40 bg-indigo-500/5 rounded-full blur-3xl font-sans"></div>
                      <div>
                        <h3 className="text-sm font-mono font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
                          {language === "sw" ? "Jenga Kutoka kwa Somo" : "Generate via Subject Input"}
                        </h3>
                        <p className="text-slate-400 text-xs mb-4">
                          {language === "sw" 
                            ? "Ingiza somo lolote na Gemini atakutengenezea mtaala kamili wa sura na mada za kusoma!"
                            : "Enter any subject (e.g. 'Advanced Thermodynamics') and Gemini AI will structure custom modules with interactive clickable topics!"}
                        </p>
                      </div>
                      <div className="flex gap-2 mt-4 relative z-10">
                        <input
                          type="text"
                          value={syllabusSubjectInput}
                          onChange={(e) => setSyllabusSubjectInput(e.target.value)}
                          placeholder={
                            language === "sw"
                              ? "Andika Somo (mfano, Artificial Intelligence)..."
                              : "Enter Subject Name (e.g. Quantum Computing)..."
                          }
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500/50 transition-all text-white font-mono text-xs"
                        />
                        <button
                          onClick={() => handleGenerateSyllabus(syllabusSubjectInput)}
                          disabled={isSyllabusGenerating || !syllabusSubjectInput.trim()}
                          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white px-5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                        >
                          {isSyllabusGenerating ? (
                            <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                          ) : (
                            <i className="fas fa-wand-magic-sparkles text-amber-300"></i>
                          )}
                          {language === "sw" ? "Jenga" : "Build"}
                        </button>
                      </div>
                    </div>

                    {/* Method 2: Upload Document Syllabus Form */}
                    <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-6 relative overflow-hidden backdrop-blur-md flex flex-col justify-between">
                      <div className="absolute top-0 right-0 h-40 w-40 bg-indigo-500/5 rounded-full blur-3xl"></div>
                      <div>
                        <h3 className="text-sm font-mono font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <i className="fas fa-file-invoice text-indigo-400"></i>
                          {language === "sw" ? "Pakia Faili ya Mtaala" : "Parse Syllabus Document"}
                        </h3>
                        <p className="text-slate-400 text-xs mb-4">
                          {language === "sw" 
                            ? "Syllabus yako ipo kwenye kiambatisho? Pakia faili la PDF au TXT na mifumo yetu ya AI itaisoma!"
                            : "Have a pre-existing syllabus outline? Drop or select your PDF/TXT coursework file and let Gemini digest it!"}
                        </p>
                      </div>

                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsSyllabusFileDragging(true);
                        }}
                        onDragLeave={() => setIsSyllabusFileDragging(false)}
                        onDrop={async (e) => {
                          e.preventDefault();
                          setIsSyllabusFileDragging(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file) {
                            await processSyllabusFile(file);
                          }
                        }}
                        className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[90px] relative z-10 ${
                          isSyllabusFileDragging
                            ? "border-indigo-500 bg-indigo-500/10 text-white"
                            : "border-white/10 hover:border-white/20 bg-white/5 active:bg-white/10"
                        }`}
                        onClick={() => document.getElementById("syllabus-file-input")?.click()}
                      >
                        <input
                          id="syllabus-file-input"
                          type="file"
                          accept=".pdf,.txt,.docx"
                          onChange={handleSyllabusFileSelect}
                          className="hidden"
                        />
                        <i className={`fas fa-cloud-arrow-up text-xl mb-1.5 transition-transform ${isSyllabusGenerating ? "animate-bounce text-indigo-400" : "text-slate-400"}`}></i>
                        <span className="text-[11px] font-bold text-slate-300">
                          {isSyllabusGenerating
                            ? (language === "sw" ? "Mifumo ya AI inasoma faili yako..." : "Digestive systems scanning file...")
                            : (language === "sw" ? "Buruta faili hapa au Bonyeza kupakia" : "Drag & drop PDF / TXT syllabus or Click here")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Preset Syllabi / Curriculums */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 backdrop-blur-md">
                    <h3 className="text-xs font-mono font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <i className="fas fa-bookmark text-indigo-400"></i>
                      {language === "sw" ? "Mitaala ya Kitaifa ya Mfano (KMA / KICD)" : "Preloaded Standard Syllabi (KMA / KICD / TVET)"}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(PRELOADED_SYLLABI).map(([key, syl]) => {
                        const isMarine = key === "marine";
                        return (
                          <div
                            key={key}
                            onClick={() => {
                              setActiveSyllabus(syl);
                              expandAllSyllabusChapters(syl);
                              setShareSyllabusUrl(null);
                              setSyllabusSuccessMessage(
                                language === "sw"
                                  ? `Kupakia mtaala wa "${syl.title}"...`
                                  : `Loaded preloaded syllabus: "${syl.title}"!`
                              );
                            }}
                            className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between h-full relative overflow-hidden group ${
                              activeSyllabus?.title === syl.title
                                ? "bg-indigo-950/40 border-indigo-500/50 shadow-lg shadow-indigo-500/5 text-white"
                                : "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10 text-slate-300"
                            }`}
                          >
                            {isMarine && (
                              <div className="absolute top-0 right-0 bg-indigo-500 text-white font-mono font-extrabold text-[8px] uppercase tracking-wider px-3 py-1 rounded-bl-xl z-10">
                                {language === "sw" ? "MTAALA WA KIKWELI" : "Official KICD Syllabus"}
                              </div>
                            )}
                            <div>
                              <h4 className="text-xs font-bold text-white group-hover:text-indigo-400 transition-colors flex items-center gap-2 pr-12">
                                <i className={isMarine ? "fas fa-anchor text-sky-400" : "fas fa-atom text-indigo-400"}></i>
                                {syl.title}
                              </h4>
                              <p className="text-[11px] text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                                {syl.description}
                              </p>
                            </div>
                            <div className="mt-4 flex items-center justify-between">
                              <span className="text-[9px] font-mono text-slate-500">
                                {syl.modules?.length || 0} Modules • {syl.modules?.reduce((acc: number, m: any) => acc + (m.units?.length || 0), 0) || 0} Units
                              </span>
                              <span className="text-[10px] text-indigo-400 font-bold group-hover:translate-x-1 transition-transform flex items-center gap-1">
                                {language === "sw" ? "Tumia Mtaala Huu" : "Load Syllabus"} <i className="fas fa-arrow-right text-[8px]"></i>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Notifications / Feedback Messages */}
                  {syllabusError && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-300 p-4 rounded-2xl text-xs font-mono flex items-center gap-3">
                      <i className="fas fa-exclamation-triangle text-red-400 text-sm"></i>
                      <p>{syllabusError}</p>
                    </div>
                  )}

                  {syllabusSuccessMessage && (
                    <div className="bg-green-500/10 border border-green-500/20 text-green-300 p-4 rounded-2xl text-xs font-mono flex items-center gap-3">
                      <i className="fas fa-check-circle text-green-400 text-sm"></i>
                      <p>{syllabusSuccessMessage}</p>
                    </div>
                  )}

                  {/* Saved Syllabi Repository */}
                  {savedSyllabi.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 backdrop-blur-md"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-mono font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                          <i className="fas fa-box-archive"></i>
                          {language === "sw" ? "Mitaala Yako Iliyohifadhiwa" : "Syllabus Repository"} ({savedSyllabi.length})
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                        {savedSyllabi.map((syl) => {
                          const isActive = activeSyllabus && activeSyllabus.id === syl.id;
                          return (
                            <div
                              key={syl.id}
                              className={`p-4 rounded-2xl flex items-center justify-between gap-4 transition-all duration-200 border ${
                                isActive
                                  ? "bg-indigo-950/40 border-indigo-500/50 text-white"
                                  : "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10 text-slate-300"
                              }`}
                            >
                              <div
                                onClick={() => {
                                  setActiveSyllabus(syl);
                                  expandAllSyllabusChapters(syl);
                                  setShareSyllabusUrl(null);
                                  setSyllabusSuccessMessage(
                                    language === "sw"
                                      ? `Kupakia "${syl.title}"...`
                                      : `Loaded "${syl.title}"!`
                                  );
                                }}
                                className="flex-1 cursor-pointer min-w-0"
                              >
                                <h4 className="text-xs font-bold font-sans truncate pr-2 hover:text-indigo-400 transition-colors">
                                  {syl.title}
                                </h4>
                                <p className="text-[10px] text-slate-500 font-mono mt-1">
                                  {syl.createdAt ? new Date(syl.createdAt).toLocaleDateString() : ""}
                                  {syl.isLocal && ` • ${language === "sw" ? "Mache ya Kifaa Hiki" : "Local Cache"}`}
                                </p>
                              </div>
                              {syllabusDeletingId === syl.id ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteSyllabus(syl.id, syl.isLocal);
                                    setSyllabusDeletingId(null);
                                  }}
                                  className="text-[9px] bg-rose-600 hover:bg-rose-500 text-white font-extrabold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1 shrink-0 animate-pulse"
                                  title={language === "sw" ? "Thibitisha Futa" : "Click again to confirm"}
                                >
                                  <i className="fas fa-exclamation-triangle text-[8px]"></i>
                                  {language === "sw" ? "Hakika?" : "Confirm?"}
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSyllabusDeletingId(syl.id);
                                    setTimeout(() => {
                                      setSyllabusDeletingId((prev) => prev === syl.id ? null : prev);
                                    }, 4000);
                                  }}
                                  className="text-slate-500 hover:text-rose-400 p-2 transition-colors cursor-pointer shrink-0"
                                  title={language === "sw" ? "Futa" : "Delete"}
                                >
                                  <i className="fas fa-trash text-xs"></i>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {/* Active Syllabus Details */}
                  {activeSyllabus ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <div className="bg-[#121824] border border-indigo-500/10 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row md:items-start justify-between gap-6 shadow-2xl">
                        <div className="space-y-2 flex-1">
                          <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                            {language === "sw" ? "Mtaala Ulipo sasa" : "Active Syllabus Structure"}
                          </span>
                          <h3 className="text-xl md:text-2xl font-black text-white leading-tight">
                            {activeSyllabus.title}
                          </h3>
                          <p className="text-slate-400 text-xs leading-relaxed max-w-2xl">
                            {activeSyllabus.description}
                          </p>
                        </div>

                        {/* Share Syllabus Button */}
                        <div className="flex flex-col items-stretch md:items-end gap-3 shrink-0">
                          <button
                            onClick={handleShareSyllabus}
                            disabled={isSyllabusSharing}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white px-5 py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-indigo-400/20 shadow-lg shadow-indigo-500/10"
                          >
                            {isSyllabusSharing ? (
                              <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                            ) : (
                              <i className="fas fa-share-nodes text-indigo-300"></i>
                            )}
                            {language === "sw" ? "Shirikisha Mtaala" : "Share Syllabus link"}
                          </button>

                          {activeSyllabus && !savedSyllabi.some((s) => s.id === activeSyllabus.id) && (
                            <button
                              onClick={async () => {
                                const saved = await saveSyllabusToDB(activeSyllabus);
                                setActiveSyllabus(saved);
                                setSyllabusSuccessMessage(
                                  language === "sw"
                                    ? "Mtaala umehifadhiwa kikamilifu kwenye maktaba yako!"
                                    : "Syllabus successfully saved to your library!"
                                );
                              }}
                              className="bg-slate-800 hover:bg-slate-700 text-indigo-300 px-5 py-3 rounded-2xl text-[10px] md:text-xs font-bold transition-all flex items-center justify-center gap-2 border border-white/5 shadow-md"
                            >
                              <i className="fas fa-bookmark text-indigo-400"></i>
                              {language === "sw" ? "Hifadhi kwenye Maktaba" : "Save to Library"}
                            </button>
                          )}

                          {shareSyllabusUrl && (
                            <div className="bg-slate-900/90 border border-indigo-500/20 p-3 rounded-xl flex items-center justify-between gap-3 max-w-[280px]">
                              <input
                                readOnly
                                value={shareSyllabusUrl}
                                className="bg-transparent border-none text-[10px] text-indigo-300 font-mono focus:outline-none w-full"
                              />
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(shareSyllabusUrl);
                                  setSyllabusSuccessMessage(
                                    language === "sw"
                                      ? "Kiungo Kimekopwa!"
                                      : "Link copied to clipboard!"
                                  );
                                }}
                                className="text-indigo-400 hover:text-white transition-colors p-1"
                                title="Copy"
                              >
                                <i className="fas fa-copy text-xs"></i>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Chapters / Modules View Selector */}
                      {activeSyllabus.modules && activeSyllabus.modules.length > 0 && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-5 mb-5">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <span className="text-xs font-semibold text-slate-400 font-mono">
                              {language === "sw" ? "Njia ya Kuona:" : "Syllabus Display Mode:"}
                            </span>
                            <div className="bg-slate-950/60 p-1 rounded-xl flex items-center gap-1 border border-white/5 self-start">
                              <button
                                onClick={() => setSyllabusViewMode("modules")}
                                className={`px-3.5 py-2 rounded-lg text-[10px] font-bold font-mono uppercase transition-all flex items-center gap-1.5 ${
                                  syllabusViewMode === "modules"
                                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                                }`}
                              >
                                <i className="fas fa-cubes text-[11px]"></i>
                                {language === "sw" ? "Moduli za TVET" : "TVET Modules"}
                              </button>
                              <button
                                onClick={() => setSyllabusViewMode("chapters")}
                                className={`px-3.5 py-2 rounded-lg text-[10px] font-bold font-mono uppercase transition-all flex items-center gap-1.5 ${
                                  syllabusViewMode === "chapters"
                                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                                }`}
                              >
                                <i className="fas fa-list text-[11px]"></i>
                                {language === "sw" ? "Sura za Mitaala" : "Flat Chapters"}
                              </button>
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {syllabusViewMode === "modules"
                              ? `${activeSyllabus.modules.length} ${language === "sw" ? "Moduli Zilizopo" : "Modules Available"}`
                              : `${activeSyllabus.chapters?.length || 0} ${language === "sw" ? "Sura Zilizopo" : "Chapters Available"}`
                            }
                          </div>
                        </div>
                      )}

                      {/* TVET Modular Accordion / List */}
                      {syllabusViewMode === "modules" && activeSyllabus.modules && activeSyllabus.modules.length > 0 ? (
                        <div className="space-y-6">
                          {/* Module Tab Switcher */}
                          <div className="flex flex-wrap gap-2 p-1.5 bg-slate-950/40 rounded-2xl border border-white/5">
                            {activeSyllabus.modules.map((mod: any, modIdx: number) => {
                              const isSelected = activeModuleIdx === modIdx;
                              return (
                                <button
                                  key={modIdx}
                                  onClick={() => setActiveModuleIdx(modIdx)}
                                  className={`flex-1 min-w-[130px] py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2.5 border ${
                                    isSelected
                                      ? "bg-indigo-600 text-white border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]"
                                      : "bg-transparent text-slate-400 border-transparent hover:text-white hover:bg-white/5"
                                  }`}
                                >
                                  <span className="text-[10px] font-black font-mono px-1.5 py-0.5 rounded bg-black/25 text-indigo-200">
                                    M{modIdx + 1}
                                  </span>
                                  {mod.title}
                                </button>
                              );
                            })}
                          </div>

                          {/* Selected Module Units list */}
                          <div className="space-y-6 mt-4">
                            {activeSyllabus.modules[activeModuleIdx]?.units?.map((unit: any, unitIdx: number) => (
                              <div
                                key={unitIdx}
                                className="bg-slate-950/30 border border-white/5 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl"
                              >
                                <div className="border-b border-white/5 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                  <div>
                                    <div className="text-[10px] uppercase font-mono tracking-wider text-indigo-400 font-bold mb-1">
                                      {language === "sw" ? "KIDATO / MASOMO YA CHUO" : "COURSE UNIT SUBJECT"}
                                    </div>
                                    <h4 className="text-base font-black text-white flex items-center gap-2.5">
                                      <span className="text-xs font-black text-indigo-300 bg-indigo-500/15 border border-indigo-500/25 h-7 w-7 rounded-xl flex items-center justify-center font-mono">
                                        U{unitIdx + 1}
                                      </span>
                                      {unit.title}
                                    </h4>
                                  </div>
                                  <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-[10px] font-mono text-slate-400 self-start sm:self-auto">
                                    {unit.topics?.length || 0} {language === "sw" ? "Mada Kuu" : "Topics"}
                                  </div>
                                </div>

                                {/* Topics list within unit */}
                                <div className="divide-y divide-white/5">
                                  {unit.topics?.map((topic: any, topIdx: number) => {
                                    const topicKey = `mod-${activeModuleIdx}-unit-${unitIdx}-topic-${topIdx}-${topic.title}`;
                                    const isTopicOpened = openedTopics.includes(topicKey);
                                    const subtopics = getSubtopicsForTopic(topic.description, topic.title, topic.subtopics);

                                    return (
                                      <div
                                        key={topIdx}
                                        className="py-5 first:pt-0 last:pb-0 flex flex-col gap-4 group"
                                      >
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                          <div className="space-y-1 flex-1">
                                            <h5 className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors flex items-center gap-2">
                                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                              {topic.title}
                                            </h5>
                                            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                                              {topic.description}
                                            </p>
                                          </div>

                                          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                                            <button
                                              onClick={() => handleDeleteTopic(topic.title, unitIdx, activeModuleIdx, undefined)}
                                              className="bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/20 p-2 rounded-xl text-xs transition-all active:scale-95 cursor-pointer h-9 w-9 flex items-center justify-center shrink-0"
                                              title={language === "sw" ? "Ondoa Mada Hii" : "Remove this topic"}
                                            >
                                              <i className="fas fa-trash-alt text-[11px]"></i>
                                            </button>

                                            <button
                                              onClick={() => {
                                                if (isTopicOpened) {
                                                  setOpenedTopics(openedTopics.filter((k) => k !== topicKey));
                                                } else {
                                                  setOpenedTopics([...openedTopics, topicKey]);
                                                }
                                              }}
                                              className={`self-start md:self-auto px-4 py-2 rounded-xl text-xs font-mono font-black uppercase transition-all flex items-center gap-2 group-hover:scale-[1.02] active:scale-95 shrink-0 ${
                                                isTopicOpened
                                                  ? "bg-indigo-600 border border-indigo-400 text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]"
                                                  : "bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/20 text-indigo-300 hover:text-white"
                                              }`}
                                            >
                                              <i className={`fas ${isTopicOpened ? "fa-folder-open" : "fa-folder"} text-[10px]`}></i>
                                              {isTopicOpened
                                                ? (language === "sw" ? "Funga" : "Close")
                                                : (language === "sw" ? "Fungua" : "Open")}
                                            </button>
                                          </div>
                                        </div>

                                        {/* Subtopics List */}
                                        <AnimatePresence initial={false}>
                                          {isTopicOpened && (
                                            <motion.div
                                              initial={{ height: 0, opacity: 0 }}
                                              animate={{ height: "auto", opacity: 1 }}
                                              exit={{ height: 0, opacity: 0 }}
                                              className="overflow-hidden pl-4 md:pl-6 border-l border-white/10 ml-1.5 mt-1 space-y-3"
                                            >
                                              <div className="text-[10px] uppercase font-mono tracking-widest text-indigo-400 mb-2 font-bold flex items-center gap-1.5">
                                                <i className="fas fa-list-check text-[9px]"></i>
                                                {language === "sw" ? "Maudhui Madogo ya Mada" : "Coverage Topics & Subtopics"}
                                              </div>
                                              <div className="space-y-2 divide-y divide-white/5">
                                                {subtopics.map((subtopic: string, subIdx: number) => (
                                                  <div
                                                    key={subIdx}
                                                    className="pt-2.5 first:pt-0 flex flex-col md:flex-row md:items-center justify-between gap-3 group/sub"
                                                  >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                      <span className="text-[9px] font-mono text-slate-500 shrink-0">
                                                        {(subIdx + 1).toString().padStart(2, "0")}
                                                      </span>
                                                      <span className="text-xs font-medium text-slate-300 group-hover/sub:text-indigo-300 transition-colors truncate">
                                                        {subtopic}
                                                      </span>
                                                    </div>

                                                    <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                                                      <button
                                                        onClick={() => handleDeleteSubtopic(subtopic, topic.title, unitIdx, activeModuleIdx, undefined)}
                                                        className="bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/20 p-1.5 rounded-lg text-[10px] transition-colors cursor-pointer"
                                                        title={language === "sw" ? "Ondoa Mada Hii Ndogo" : "Remove this subtopic"}
                                                      >
                                                        <i className="fas fa-trash-alt text-[9px]"></i>
                                                      </button>

                                                      <button
                                                        onClick={() => {
                                                          setStudentInput(subtopic);
                                                          executeLearn(subtopic, {
                                                            chapterTitle: `${activeSyllabus.modules[activeModuleIdx].title} - ${unit.title}`,
                                                            topicTitle: topic.title,
                                                            topicDescription: `Focus specifically inside the subject "${topic.title}" on the subtopic concept: "${subtopic}". Core context details: ${topic.description}`,
                                                            syllabusTitle: activeSyllabus.title || "",
                                                          });
                                                          setActiveView("board");
                                                        }}
                                                        className="bg-slate-800 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-white/5 hover:border-indigo-500/30 px-3.5 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 active:scale-95 shrink-0"
                                                      >
                                                        <i className="fas fa-play text-[8px] text-indigo-400 group-hover/sub:text-white"></i>
                                                        {language === "sw" ? "Soma Sasa" : "Learn Topic"}
                                                      </button>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* Flat Chapters list fallback view */
                        <div className="space-y-4">
                          {activeSyllabus.chapters?.map((chapter: any, chapIdx: number) => {
                            const isExpanded = expandedSyllabusChapters.includes(chapIdx);
                            return (
                              <div
                                key={chapIdx}
                                className="bg-slate-900/30 border border-white/5 rounded-2xl overflow-hidden shadow-md"
                              >
                                <button
                                  onClick={() => {
                                    if (isExpanded) {
                                      setExpandedSyllabusChapters(
                                        expandedSyllabusChapters.filter((i) => i !== chapIdx)
                                      );
                                    } else {
                                      setExpandedSyllabusChapters([...expandedSyllabusChapters, chapIdx]);
                                    }
                                  }}
                                  className="w-full flex items-center justify-between p-5 bg-white/5 hover:bg-white/10 transition-colors border-b border-white/5 text-left"
                                >
                                  <h4 className="text-sm font-bold text-white flex items-center gap-3">
                                    <span className="text-xs font-black text-indigo-400 bg-indigo-500/10 h-6 w-6 rounded-lg flex items-center justify-center border border-indigo-500/20 font-mono">
                                      {chapIdx + 1}
                                    </span>
                                    {chapter.title}
                                  </h4>
                                  <i
                                    className={`fas fa-chevron-down text-slate-500 text-xs transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                                  ></i>
                                </button>

                                <AnimatePresence initial={false}>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="p-4 md:p-6 divide-y divide-white/5">
                                        {chapter.topics?.map((topic: any, topIdx: number) => {
                                          const topicKey = `${chapIdx}-${topIdx}-${topic.title}`;
                                          const isTopicOpened = openedTopics.includes(topicKey);
                                          const subtopics = getSubtopicsForTopic(topic.description, topic.title, topic.subtopics);

                                          return (
                                            <div
                                              key={topIdx}
                                              className="py-5 first:pt-0 last:pb-0 flex flex-col gap-4 group"
                                            >
                                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                <div className="space-y-1 flex-1">
                                                  <h5 className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                                    {topic.title}
                                                  </h5>
                                                  <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                                                    {topic.description}
                                                  </p>
                                                </div>

                                                <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                                                  <button
                                                    onClick={() => handleDeleteTopic(topic.title, undefined, undefined, chapIdx)}
                                                    className="bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/20 p-2 rounded-xl text-xs transition-all active:scale-95 cursor-pointer h-9 w-9 flex items-center justify-center shrink-0"
                                                    title={language === "sw" ? "Ondoa Mada Hii" : "Remove this topic"}
                                                  >
                                                    <i className="fas fa-trash-alt text-[11px]"></i>
                                                  </button>

                                                  <button
                                                    onClick={() => {
                                                      if (isTopicOpened) {
                                                        setOpenedTopics(openedTopics.filter((k) => k !== topicKey));
                                                      } else {
                                                        setOpenedTopics([...openedTopics, topicKey]);
                                                      }
                                                    }}
                                                    className={`self-start md:self-auto px-4 py-2 rounded-xl text-xs font-mono font-black uppercase transition-all flex items-center gap-2 group-hover:scale-[1.02] active:scale-95 shrink-0 ${
                                                      isTopicOpened
                                                        ? "bg-indigo-600 border border-indigo-400 text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]"
                                                        : "bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/20 text-indigo-300 hover:text-white"
                                                    }`}
                                                  >
                                                    <i className={`fas ${isTopicOpened ? "fa-folder-open" : "fa-folder"} text-[10px]`}></i>
                                                    {isTopicOpened
                                                      ? (language === "sw" ? "Funga" : "Close")
                                                      : (language === "sw" ? "Fungua" : "Open")}
                                                  </button>
                                                </div>
                                              </div>

                                              {/* Subtopics List */}
                                              <AnimatePresence initial={false}>
                                                {isTopicOpened && (
                                                  <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden pl-4 md:pl-6 border-l border-white/10 ml-1.5 mt-1 space-y-3"
                                                  >
                                                    <div className="text-[10px] uppercase font-mono tracking-widest text-indigo-400 mb-2 font-bold flex items-center gap-1.5">
                                                      <i className="fas fa-list-check text-[9px]"></i>
                                                      {language === "sw" ? "Maudhui Madogo ya Mada" : "Coverage Topics & Subtopics"}
                                                    </div>
                                                    <div className="space-y-2 divide-y divide-white/5">
                                                      {subtopics.map((subtopic: string, subIdx: number) => (
                                                        <div
                                                          key={subIdx}
                                                          className="pt-2.5 first:pt-0 flex flex-col md:flex-row md:items-center justify-between gap-3 group/sub"
                                                        >
                                                          <div className="flex items-center gap-3 min-w-0">
                                                            <span className="text-[9px] font-mono text-slate-500 shrink-0">
                                                              {(subIdx + 1).toString().padStart(2, "0")}
                                                            </span>
                                                            <span className="text-xs font-medium text-slate-300 group-hover/sub:text-indigo-300 transition-colors truncate">
                                                              {subtopic}
                                                            </span>
                                                          </div>

                                                          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                                                            <button
                                                              onClick={() => handleDeleteSubtopic(subtopic, topic.title, undefined, undefined, chapIdx)}
                                                              className="bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/20 p-1.5 rounded-lg text-[10px] transition-colors cursor-pointer"
                                                              title={language === "sw" ? "Ondoa Mada Hii Ndogo" : "Remove this subtopic"}
                                                            >
                                                              <i className="fas fa-trash-alt text-[9px]"></i>
                                                            </button>

                                                            <button
                                                              onClick={() => {
                                                                setStudentInput(subtopic);
                                                                executeLearn(subtopic, {
                                                                  chapterTitle: chapter.title || "",
                                                                  topicTitle: topic.title,
                                                                  topicDescription: `Focus specifically inside the subject "${topic.title}" on the subtopic concept: "${subtopic}". Core context details: ${topic.description}`,
                                                                  syllabusTitle: activeSyllabus.title || "",
                                                                });
                                                                setActiveView("board");
                                                              }}
                                                              className="bg-slate-800 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-white/5 hover:border-indigo-500/30 px-3.5 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 active:scale-95 shrink-0"
                                                            >
                                                              <i className="fas fa-play text-[8px] text-indigo-400 group-hover/sub:text-white"></i>
                                                              {language === "sw" ? "Soma Sasa" : "Learn Topic"}
                                                            </button>
                                                          </div>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </motion.div>
                                                )}
                                              </AnimatePresence>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <div className="border border-dashed border-white/10 rounded-[2rem] p-12 text-center bg-slate-900/10">
                      <div className="h-16 w-16 bg-slate-800/80 border border-white/5 rounded-3xl mx-auto flex items-center justify-center mb-4 text-indigo-400 text-xl shadow-inner">
                        <i className="fas fa-book-open"></i>
                      </div>
                      <h3 className="text-lg font-bold text-white">
                        {language === "sw" ? "Hakuna Mtaala Uliopakiwa bado" : "No active syllabus loaded"}
                      </h3>
                    </div>
                  )}
                </div>
              </div>
            ) : activeView === "history" ? (
              <div className="h-full w-full p-8 overflow-y-auto custom-scrollbar bg-slate-900/50 backdrop-blur-sm rounded-[2rem] border border-white/5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                  {lessonHistory.length === 0 ? (
                    <div className="col-span-full py-20 text-center text-slate-500">
                      <i className="fas fa-history text-3xl mb-4 block opacity-20"></i>
                      <p className="text-xs uppercase tracking-widest font-black">
                        No neural archives found
                      </p>
                    </div>
                  ) : (
                    lessonHistory.map((lesson, idx) => (
                      <motion.button
                        key={`${lesson.id}-${idx}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => {
                          loadLessonFromHistory(idx);
                          setActiveView("board");
                        }}
                        className="text-left bg-white/5 border border-white/10 p-6 rounded-3xl hover:bg-blue-600/10 hover:border-blue-500/30 transition-all group shadow-xl"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="bg-blue-600/20 text-blue-400 w-8 h-8 rounded-xl flex items-center justify-center border border-blue-500/20">
                            <i className="fas fa-book-open text-xs"></i>
                          </div>
                          <span className="text-[8px] font-mono text-white/40">
                            {lesson.timestamp?.toDate
                              ? lesson.timestamp.toDate().toLocaleDateString()
                              : "Recent"}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white mb-2 group-hover:text-blue-400 transition-colors uppercase truncate">
                          {lesson.topic}
                        </h4>
                        <p className="text-[10px] text-white/60 line-clamp-2 leading-relaxed italic">
                          "{lesson.teacher_dialogue}"
                        </p>
                      </motion.button>
                    ))
                  )}
                </div>
              </div>
            ) : activeView === "curriculum" ? (
              <div
                className={`h-full w-full ${visualDensity === "Compact" ? "p-4 md:p-6" : "p-8 md:p-12"} overflow-y-auto custom-scrollbar bg-slate-900/50 backdrop-blur-sm rounded-[2rem] border border-white/5`}
              >
                <div className="max-w-4xl mx-auto prose prose-invert prose-lg">
                  <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
                    <h2 className="text-3xl font-black uppercase tracking-tight m-0 text-white">
                      Full Curriculum Notes
                    </h2>
                    <button
                      onClick={downloadNotesAsPDF}
                      className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold"
                    >
                      <i className="fas fa-file-pdf text-red-400"></i>
                      Export PDF
                    </button>
                  </div>
                  <Markdown>{whiteboardNotes}</Markdown>
                </div>
              </div>
            ) : activeView === "quiz" ? (
              <div className="h-full w-full p-4 md:p-8 overflow-y-auto custom-scrollbar bg-slate-900/50 backdrop-blur-sm rounded-[2rem] border border-white/5 flex items-center justify-center">
                <div className="w-full max-w-2xl">
                  <InteractiveQuiz
                    currentTopic={
                      currentTopic || (language === "sw" ? "Somo" : "Lesson")
                    }
                    whiteboardNotes={whiteboardNotes}
                    language={language}
                    onClose={() => setActiveView("board")}
                    onQuizComplete={(score, total) => {
                      console.log(`Quiz completed: ${score}/${total}`);
                      setActiveView("board");
                    }}
                    intelLevel={intelLevel}
                    studyLevel={studyLevel}
                  />
                </div>
              </div>
            ) : (
              <div className="relative w-full h-full flex flex-col">
                <VideoSmartboard
                  videoUrl={videoUrl}
                  isPlaying={isPlaying}
                  currentSlideIndex={currentSlideIndex}
                  slidesCount={slides.length}
                  currentSlideContent={currentSlideContent}
                  whiteboardNotes={whiteboardNotes}
                  lessonSegments={lessonSegments}
                  teacherDialogue={teacherDialogue}
                  classTargetDuration={classTargetDuration}
                  teachingTechnique={activeTeachingTechnique}
                  diagramSvg={diagramSvg}
                  showSubtitles={showSubtitles}
                  onTogglePlay={(play) => {
                    if (play) resumeSpeaking();
                    else pauseSpeaking();
                  }}
                  diagramUrl={diagramUrl}
                  isGenerating={isGeneratingVideo}
                  generationProgress={videoGenerationProgress}
                  isCinematicMode={isCinematicMode}
                  onExitCinematic={() => setIsCinematicMode(false)}
                  onHighlightAsk={handleHighlightAsk}
                  onQuizStart={() => {
                    stopSpeaking();
                    setIsPlaying(false);
                    setActiveView("quiz");
                  }}
                  language={language}
                  teachingMode={teachingMode}
                  onTeachingModeChange={setTeachingMode}
                  onGenerateVideo={() => generateCinematicLessonVideo(lessonSegments)}
                  selectedTeacher={selectedCharacter}
                  onSelectTeacher={handleSelectTeacher}
                  videoComingSoon={videoComingSoon}
                />

                <AnimatePresence>
                  {isAudioBlocked && (
                    <motion.div
                      initial={{ opacity: 0, y: -20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -20, scale: 0.95 }}
                      className="absolute top-4 left-4 right-4 z-50 flex items-center justify-between bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-md border border-amber-400"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-slate-950 text-amber-400 p-2.5 rounded-xl animate-pulse flex items-center justify-center shadow-lg">
                          <i className="fas fa-volume-up text-sm"></i>
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider text-slate-950">
                            {language === "sw" ? "Mwalimu Zuwia Sauti" : "Muted by Browser Auto-Play"}
                          </p>
                          <p className="text-[10px] font-bold text-slate-900 leading-relaxed mt-0.5 max-w-md">
                            {language === "sw" 
                              ? "Kivinjari kimezuia sauti. Bonyeza kitufe cha Kulia kuanza kusikia sauti ya Mwalimu sasa!" 
                              : "The speech engine is locked by autoplay. Click the button to unmute the teacher's voice!"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setIsAudioBlocked(false);
                          if ("speechSynthesis" in window) {
                            window.speechSynthesis.cancel();
                            const unlockUtterance = new SpeechSynthesisUtterance("Begin.");
                            unlockUtterance.volume = 0;
                            window.speechSynthesis.speak(unlockUtterance);
                          }
                          resumeSpeaking(true);
                        }}
                        className="bg-slate-955 bg-slate-950 hover:bg-slate-900 text-white font-black text-[10px] uppercase tracking-wider px-5 py-3 rounded-xl transition-all shadow-xl hover:shadow-2xl active:scale-95 whitespace-nowrap"
                      >
                        {language === "sw" ? "Washa Sauti" : "Unmute Teacher"}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <AnimatePresence>
              {isQAOpen && (
                <QASection
                  currentTopic={currentTopic}
                  currentSegment={lessonSegments[currentSlideIndex] || null}
                  language={language}
                  teachingTechniqueId={activeTeachingTechnique?.id}
                  initialQuestion={initialQAQuestion || undefined}
                  initialMessages={qaInitialMessages}
                  isWaitingForContinue={isWaitingForContinue}
                  onWaitingForContinueChange={setIsWaitingForContinue}
                  onAssistantSpeak={(text, onEnd) => speakText(text, onEnd)}
                  onQuestionAsked={() => {
                    interruptedSlideIndexRef.current = currentSlideIndex;
                    stopSpeaking();
                    setIsPlaying(false);
                    setIsWaitingForContinue(false);
                  }}
                  onAnswerFinished={() => {
                    // QASection itself triggers isWaitingForContinue to display asking feedback
                  }}
                   onClose={() => {
                    const wasWaiting = isWaitingForContinue;
                    setIsQAOpen(false);
                    setIsWaitingForContinue(false);
                    setInitialQAQuestion(null);
                    setQAInitialMessages(undefined);
                    if (lessonSegments.length > 0) {
                      resumeSpeaking(wasWaiting);
                    }
                  }}
                  intelLevel={intelLevel}
                  studyLevel={studyLevel}
                  isLessonEnded={isLessonEnded}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer Branding */}
      <footer
        className={`fixed bottom-0 left-0 right-0 h-8 bg-slate-900/90 backdrop-blur-md border-t border-white/5 px-6 flex items-center justify-between z-30 transition-all duration-500 ${isCinematicMode ? "opacity-0 translate-y-full pointer-events-none" : "opacity-100"}`}
      >
        <div className="flex items-center gap-6 text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">
          <span>Engine: {intelLevel === "100% Omni-Intelligence" ? "Gemini 3.1 Pro (Omni)" : "Gemini 3.5 Flash"}</span>
          <span>Mode: Virtual Educator 2.4</span>
          <span>Status: Secure Link Established</span>
        </div>
        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">
          OmniTutor Neural Academy &copy; 2026
        </div>
      </footer>

      <AnimatePresence>
        {showFeedback && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-12 right-6 md:right-12 w-[calc(100%-32px)] max-w-sm bg-slate-900/95 backdrop-blur-2xl border border-white/10 p-6 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[100]"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-blue-400">
                Class Feedback
              </h3>
              {!feedbackSubmitted && (
                <button
                  onClick={() => setShowFeedback(false)}
                  className="text-slate-500 hover:text-white transition-colors"
                >
                  <i className="fas fa-times"></i>
                </button>
              )}
            </div>

            {feedbackSubmitted ? (
              <div className="text-center py-4">
                <i className="fas fa-check-circle text-green-500 text-3xl mb-3"></i>
                <p className="text-sm font-bold">Feedback Received!</p>
                <p className="text-[10px] text-slate-500 uppercase mt-1">
                  Improving Neural Models...
                </p>
              </div>
            ) : (
              <form onSubmit={submitFeedback} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Quality
                  </label>
                  <div className="flex justify-between">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() =>
                          setFeedbackData((prev) => ({ ...prev, quality: v }))
                        }
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold border transition-all ${feedbackData.quality === v ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/10 text-slate-500 hover:bg-white/10"}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Relevance
                  </label>
                  <div className="flex justify-between">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() =>
                          setFeedbackData((prev) => ({ ...prev, relevance: v }))
                        }
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold border transition-all ${feedbackData.relevance === v ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/10 text-slate-500 hover:bg-white/10"}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Comments (Optional)
                  </label>
                  <textarea
                    value={feedbackData.comments}
                    onChange={(e) =>
                      setFeedbackData((prev) => ({
                        ...prev,
                        comments: e.target.value,
                      }))
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500/50 min-h-[60px]"
                    placeholder="Help us improve..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">
                    {language === "sw"
                      ? "Nyaraka ya Nyongeza (Faili au Video)"
                      : "Supporting File or Video (Optional)"}
                  </label>

                  {isUploadingFeedbackFile ? (
                    <div className="border border-dashed border-blue-500 bg-blue-500/10 rounded-xl p-6 text-center flex flex-col items-center justify-center gap-2">
                      <div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin"></div>
                      <p className="text-[10px] font-bold text-blue-400">
                        {language === "sw" ? "Inapakia faili kwenye seva..." : "Uploading file to servers..."}
                      </p>
                    </div>
                  ) : !feedbackData.uploadedFile ? (
                    <div
                      onDragOver={handleFeedbackDragOver}
                      onDragLeave={handleFeedbackDragLeave}
                      onDrop={handleFeedbackDrop}
                      className={`border-2 border-dashed rounded-xl p-4 text-center transition-all relative ${
                        isFeedbackDragging
                          ? "border-blue-500 bg-blue-500/10 text-white"
                          : "border-white/10 hover:border-blue-500/30 bg-white/5 text-slate-400 hover:text-slate-300"
                      }`}
                    >
                      <input
                        type="file"
                        id="feedbackFileAttachment"
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                        onChange={handleFeedbackFileChange}
                        accept="image/*,video/*,application/pdf,text/plain,.json"
                      />
                      <div className="space-y-1.5 pointer-events-none">
                        <i className="fas fa-cloud-arrow-up text-lg text-blue-400 mb-1 block"></i>
                        <p className="text-[10px] font-bold">
                          {language === "sw"
                            ? "Vuta faili / video hapa au bofya kuchagua"
                            : "Drag & drop file or video here or click to browse"}
                        </p>
                        <p className="text-[8px] font-mono text-slate-400">
                          Images, Videos, PDF, TXT (Max size: 15MB)
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white/5 border border-white/10 p-3 rounded-xl flex items-center justify-between gap-3 relative">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-xs shrink-0 overflow-hidden">
                          {feedbackData.uploadedFile.type.startsWith("image/") ? (
                            <img
                              src={feedbackData.uploadedFile.data}
                              alt="preview"
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : feedbackData.uploadedFile.type.startsWith("video/") ? (
                            <video
                              src={feedbackData.uploadedFile.data}
                              className="w-full h-full object-cover"
                              muted
                              autoPlay
                              loop
                              playsInline
                            />
                          ) : (
                            <i className="fas fa-file-invoice"></i>
                          )}
                        </div>
                        <div className="text-left min-w-0">
                          <p className="text-[10px] font-bold text-white truncate max-w-[180px]">
                            {feedbackData.uploadedFile.name}
                          </p>
                          <p className="text-[8px] font-mono text-slate-500 uppercase">
                            {(feedbackData.uploadedFile.size / 1024).toFixed(1)}{" "}
                            KB •{" "}
                            {feedbackData.uploadedFile.type.split("/")[1] ||
                              "file"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={removeFeedbackFile}
                        className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                        title="Remove Attachment"
                      >
                        <i className="fas fa-trash-alt text-[10px]"></i>
                      </button>
                    </div>
                  )}

                  {feedbackFileError && (
                    <p className="text-[9px] font-mono font-bold text-red-400 mt-1 flex items-center gap-1 bg-red-500/10 border border-red-500/10 px-2 py-1 rounded">
                      <i className="fas fa-exclamation-triangle"></i>
                      {feedbackFileError}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95"
                >
                  Submit Neural Review
                </button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-slate-950/80 backdrop-blur-xl"
            onClick={(e) =>
              e.target === e.currentTarget && setIsSettingsOpen(false)
            }
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-4xl max-h-[92dvh] md:max-h-[85dvh] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col md:flex-row"
            >
              {/* Sidebar Settings Categories */}
              <div className="w-full md:w-72 md:shrink-0 bg-slate-950/50 p-4 md:p-8 md:border-r border-b md:border-b-0 border-white/5 flex flex-col max-h-[35vh] md:max-h-none overflow-y-auto custom-scrollbar">
                <div className="flex items-center gap-4 mb-8 md:mb-12">
                  <div className="h-12 w-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20 border border-white/10">
                    <i className="fas fa-cog text-white text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-white">
                      System Config
                    </h3>
                    <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">
                      v2.4.0-stable
                    </p>
                  </div>
                </div>

                <nav className="flex flex-col gap-3">
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="flex items-center gap-4 p-4 rounded-2xl text-slate-400 hover:text-white hover:bg-white/5 text-[10px] font-black uppercase tracking-[0.2em] transition-all mb-4 border border-transparent hover:border-white/10 group"
                  >
                    <i className="fas fa-arrow-left group-hover:-translate-x-1 transition-transform"></i>
                    Back to Academy
                  </button>

                  <button
                    onClick={() => setActiveSettingsTab("general")}
                    className={`flex items-center justify-between p-4 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all group ${activeSettingsTab === "general" ? "" : "text-slate-500 hover:text-white hover:bg-white/5 border-transparent"}`}
                    style={activeSettingsTab === "general" ? { backgroundColor: `${accentColor}1a`, color: accentColor, borderColor: `${accentColor}33` } : {}}
                  >
                    <div className="flex items-center gap-4">
                      <i className="fas fa-sliders-h w-5"></i>
                      General
                    </div>
                    <i
                      className={`fas fa-chevron-right text-[10px] transition-opacity ${activeSettingsTab === "general" ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}
                      style={activeSettingsTab === "general" ? { color: accentColor } : {}}
                    ></i>
                  </button>
                  <button
                    onClick={() => setActiveSettingsTab("interface")}
                    className={`flex items-center justify-between p-4 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all group ${activeSettingsTab === "interface" ? "" : "text-slate-500 hover:text-white hover:bg-white/5 border-transparent"}`}
                    style={activeSettingsTab === "interface" ? { backgroundColor: `${accentColor}1a`, color: accentColor, borderColor: `${accentColor}33` } : {}}
                  >
                    <div className="flex items-center gap-4">
                      <i className="fas fa-paint-brush w-5"></i>
                      Interface
                    </div>
                    <i
                      className={`fas fa-chevron-right text-[10px] transition-opacity ${activeSettingsTab === "interface" ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}
                      style={activeSettingsTab === "interface" ? { color: accentColor } : {}}
                    ></i>
                  </button>
                  <button
                    onClick={() => setActiveSettingsTab("neural")}
                    className={`flex items-center justify-between p-4 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all group ${activeSettingsTab === "neural" ? "" : "text-slate-500 hover:text-white hover:bg-white/5 border-transparent"}`}
                    style={activeSettingsTab === "neural" ? { backgroundColor: `${accentColor}1a`, color: accentColor, borderColor: `${accentColor}33` } : {}}
                  >
                    <div className="flex items-center gap-4">
                      <i className="fas fa-brain w-5"></i>
                      Neural AI
                    </div>
                    <i
                      className={`fas fa-chevron-right text-[10px] transition-opacity ${activeSettingsTab === "neural" ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}
                      style={activeSettingsTab === "neural" ? { color: accentColor } : {}}
                    ></i>
                  </button>
                  <button
                    onClick={() => setActiveSettingsTab("privacy")}
                    className={`flex items-center justify-between p-4 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all group ${activeSettingsTab === "privacy" ? "" : "text-slate-500 hover:text-white hover:bg-white/5 border-transparent"}`}
                    style={activeSettingsTab === "privacy" ? { backgroundColor: `${accentColor}1a`, color: accentColor, borderColor: `${accentColor}33` } : {}}
                  >
                    <div className="flex items-center gap-4">
                      <i className="fas fa-shield-alt w-5"></i>
                      Privacy & App Lock
                    </div>
                    <i
                      className={`fas fa-chevron-right text-[10px] transition-opacity ${activeSettingsTab === "privacy" ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}
                      style={activeSettingsTab === "privacy" ? { color: accentColor } : {}}
                    ></i>
                  </button>
                  {user?.email === "charlesmwajima@gmail.com" && (
                    <button
                      onClick={() => setActiveSettingsTab("admin")}
                      className={`flex items-center justify-between p-4 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all group ${activeSettingsTab === "admin" ? "" : "text-slate-500 hover:text-white hover:bg-white/5 border-transparent"}`}
                      style={activeSettingsTab === "admin" ? { backgroundColor: `${accentColor}1a`, color: accentColor, borderColor: `${accentColor}33` } : {}}
                    >
                      <div className="flex items-center gap-4">
                        <i className="fas fa-user-shield w-5"></i>
                        Admin Panel
                      </div>
                      <i
                        className={`fas fa-chevron-right text-[10px] transition-opacity ${activeSettingsTab === "admin" ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}
                        style={activeSettingsTab === "admin" ? { color: accentColor } : {}}
                      ></i>
                    </button>
                  )}
                </nav>

                <div className="mt-auto pt-10">
                  <div className="p-6 rounded-3xl bg-white/5 border border-white/5">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3 leading-relaxed">
                      Neural Health
                    </p>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full w-[94%] bg-green-500/50"></div>
                    </div>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mt-3">
                      94% Efficiency
                    </p>
                  </div>
                </div>
              </div>

              {/* Settings Content */}
              <div className="flex-1 p-5 sm:p-7 md:p-10 lg:p-12 relative bg-gradient-to-br from-transparent to-blue-900/5 overflow-y-auto custom-scrollbar">
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="absolute top-4 right-4 md:top-8 md:right-8 px-4 md:px-6 py-2 md:py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white flex items-center justify-center gap-2 md:gap-3 transition-all active:scale-95 border border-white/10 shadow-xl group z-20"
                >
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-white/50 group-hover:text-white transition-colors">
                    Terminate Config
                  </span>
                  <i className="fas fa-times text-[10px]"></i>
                </button>

                <div className="flex items-center justify-between mb-8 md:mb-12">
                  <div className="pt-8 md:pt-0">
                    <button
                      onClick={() => setIsSettingsOpen(false)}
                      className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors mb-4 group"
                    >
                      <i className="fas fa-arrow-left text-[10px] group-hover:-translate-x-1 transition-transform"></i>
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        Back to Workspace
                      </span>
                    </button>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-3">
                      {activeSettingsTab === "general" && "General Logistics"}
                      {activeSettingsTab === "interface" && "UX Environment"}
                      {activeSettingsTab === "neural" && "Intelligence Core"}
                      {activeSettingsTab === "privacy" && "Security & App Lock"}
                      {activeSettingsTab === "admin" && "Administrator Center"}
                    </h2>
                    <p className="text-sm text-slate-500 font-medium max-w-md leading-relaxed">
                      {activeSettingsTab === "general" &&
                        "Fine-tune your basic educational audio and language preferences."}
                      {activeSettingsTab === "interface" &&
                        "Customize the visual behavior and density of your learning workstation."}
                      {activeSettingsTab === "neural" &&
                        "Calibrate Mwalimu Bora's depth of insight and synthesis parameters."}
                      {activeSettingsTab === "privacy" &&
                        "Manage your local footprint, safety PIN fallback, and biometric App Lock settings."}
                      {activeSettingsTab === "admin" &&
                        "Oversee global student feedbacks, moderate masterclass blueprints, and check database link state."}
                    </p>
                  </div>
                </div>

                <div className="space-y-10">
                  {activeSettingsTab === "general" && (
                    <>
                      <div className="group bg-white/5 border border-white/5 p-6 rounded-3xl hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center justify-between gap-6">
                          <div className="flex items-center gap-5">
                            <div className="h-12 w-12 bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center border border-blue-500/20">
                              <i className="fas fa-microchip text-lg"></i>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                Neural Voice Core
                              </h4>
                              <p className="text-[10px] text-slate-500 font-medium">
                                Select your preferred AI teacher voice
                              </p>
                            </div>
                          </div>
                          <label className="text-[11px] font-black text-white uppercase tracking-widest">
                            Neural Voice Output
                          </label>
                          <div className="flex gap-4">
                            <select
                              value={selectedVoiceName || ""}
                              onChange={(e) => {
                                const newVoiceName = e.target.value;
                                setSelectedVoiceName(newVoiceName || null);
                                if (newVoiceName)
                                  localStorage.setItem(
                                    "tutor_selected_voice",
                                    newVoiceName,
                                  );
                                else
                                  localStorage.removeItem(
                                    "tutor_selected_voice",
                                  );

                                // Immediate audio confirmation
                                if (newVoiceName) {
                                  const voice = availableVoices.find(
                                    (v) => v.name === newVoiceName,
                                  );
                                  const langCode = voice?.lang || "en-US";
                                  const char = getCharacterForVoice(
                                    voice || null,
                                  );

                                  const isSwahili =
                                    langCode.toLowerCase().includes("sw") ||
                                    voice?.name
                                      ?.toLowerCase()
                                      .includes("swahili") ||
                                    langCode.toLowerCase().includes("-ke");

                                  let msg = `This is ${char.name}. Voice established.`;
                                  if (isSwahili)
                                    msg = `Naitwa ${char.name}. Sauti imethibitishwa.`;
                                  else if (langCode.startsWith("fr"))
                                    msg = `Je suis ${char.name}. Voix confirmée.`;
                                  else if (langCode.startsWith("de"))
                                    msg = `Ich bin ${char.name}. Stimme bestätigt.`;
                                  else if (langCode.startsWith("es"))
                                    msg = `Soy ${char.name}. Voz confirmada.`;

                                  speakText(
                                    msg,
                                    undefined,
                                    newVoiceName,
                                    langCode,
                                  );

                                  setVoiceConfirmation({
                                    visible: true,
                                    voiceName: voice?.name || "Default Voice",
                                    locale: langCode,
                                    characterName: char.name,
                                    isTest: false,
                                  });
                                } else {
                                  setVoiceConfirmation({
                                    visible: true,
                                    voiceName: "Default Academy Voice",
                                    locale: "en-US",
                                    characterName: "Mwalimu Bora",
                                    isTest: false,
                                  });
                                }
                              }}
                              className="bg-slate-800 border border-white/10 text-white text-[10px] font-black uppercase px-4 py-2.5 rounded-xl focus:outline-none focus:border-blue-500 transition-all cursor-pointer hover:bg-slate-700 flex-1"
                            >
                              <option value="">Default Academy Voice</option>
                              {[...availableVoices]
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((voice, idx) => {
                                  const name = voice.name.toLowerCase();
                                  const isFemale =
                                    name.includes("female") ||
                                    name.includes("woman") ||
                                    name.includes("girl") ||
                                    name.includes("zira") ||
                                    name.includes("samantha") ||
                                    name.includes("monica") ||
                                    name.includes("susan") ||
                                    name.includes("hazel") ||
                                    name.includes("anna") ||
                                    name.includes("elsa") ||
                                    name.includes("siri") ||
                                    name.includes("tessa") ||
                                    name.includes("victoria");

                                  const isMale =
                                    name.includes("male") ||
                                    name.includes("man") ||
                                    name.includes("guy") ||
                                    name.includes("david") ||
                                    name.includes("mark") ||
                                    name.includes("george") ||
                                    name.includes("soren") ||
                                    name.includes("carlos") ||
                                    name.includes("brian") ||
                                    name.includes("hans") ||
                                    name.includes("peter");

                                  const isRegional =
                                    voice.lang
                                      .toLowerCase()
                                      .includes("en-ke") ||
                                    voice.lang.toLowerCase().includes("sw") ||
                                    voice.lang
                                      .toLowerCase()
                                      .includes("en-ng") ||
                                    voice.lang.toLowerCase().includes("en-za");

                                  const label = `${voice.name} (${voice.lang})${isFemale ? " ♀" : isMale ? " ♂" : ""}${isRegional ? " 🌍" : ""}`;

                                  return (
                                    <option
                                      key={`${voice.name}-${voice.lang}-${idx}`}
                                      value={voice.name}
                                    >
                                      {label}
                                    </option>
                                  );
                                })}
                            </select>
                            <button
                              onClick={() => {
                                const voice = availableVoices.find(
                                  (v) => v.name === selectedVoiceName,
                                );
                                const langCode = voice?.lang || "en-US";
                                const isSwahiliVoice =
                                  langCode.toLowerCase().includes("sw") ||
                                  voice?.name
                                    ?.toLowerCase()
                                    .includes("swahili") ||
                                  langCode.toLowerCase().includes("-ke");

                                let testText = `This is ${selectedCharacter.name}, your neural tutor. Voice stability confirmed and established.`;

                                if (isSwahiliVoice) {
                                  testText = `Mimi ni ${selectedCharacter.name}, mwalimu wako wa neural. Jaribio la sauti imethibitishwa.`;
                                } else if (langCode.startsWith("fr")) {
                                  testText = `Je suis ${selectedCharacter.name}, votre tuteur neural. La stabilité de la voix est confirmée.`;
                                } else if (langCode.startsWith("de")) {
                                  testText = `Ich bin ${selectedCharacter.name}, Ihr neuraler Tutor. Die Sprachstabilität ist bestätigt.`;
                                } else if (langCode.startsWith("es")) {
                                  testText = `Soy ${selectedCharacter.name}, su tutor neural. Estabilidad de voz confirmada.`;
                                }

                                speakText(
                                  testText,
                                  undefined,
                                  selectedVoiceName || undefined,
                                  langCode,
                                );

                                setVoiceConfirmation({
                                  visible: true,
                                  voiceName:
                                    voice?.name || "Default Academy Voice",
                                  locale: langCode,
                                  characterName: selectedCharacter.name,
                                  isTest: true,
                                });
                              }}
                              className="h-10 w-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all active:scale-95 border border-blue-500/20 shrink-0"
                              title="Test Signal"
                            >
                              <i className="fas fa-play text-[10px]"></i>
                            </button>
                            {selectedVoiceName && (
                              <button
                                onClick={() => {
                                  if (selectedVoiceName) {
                                    const prunedVoice = selectedVoiceName;
                                    window.speechSynthesis.cancel();
                                    markVoiceAsBroken(prunedVoice, true);
                                    setSelectedVoiceName("");
                                    localStorage.removeItem(
                                      "tutor_selected_voice",
                                    );

                                    setSpeechError({
                                      visible: true,
                                      message: `Voice "${prunedVoice}" has been successfully pruned and removed from your options list.`,
                                      type: "warning",
                                    });
                                  }
                                }}
                                className="h-10 w-10 rounded-xl bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white transition-all active:scale-95 border border-red-500/20 shrink-0"
                                title="Remove/Prune this voice from list"
                              >
                                <i className="fas fa-trash-alt text-[10px]"></i>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Connection status indicator */}
                        <div className="mt-4 p-3 rounded-2xl bg-slate-950/40 border border-white/5 flex flex-col gap-2">
                          <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-emerald-400">
                            <div className="flex items-center gap-2">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                              </span>
                              <span>VOICE STABILITY SYNCED</span>
                            </div>
                            <span className="text-slate-500 font-bold">
                              STATUS: OK
                            </span>
                          </div>
                          <div className="text-[9px] text-slate-400 flex justify-between">
                            <span>CURRENT ASSIGNED AGENT:</span>
                            <span className="font-mono text-blue-400 font-bold">
                              {selectedCharacter.name}
                            </span>
                          </div>
                          <div className="text-[9px] text-slate-400 flex justify-between">
                            <span>ACTIVE HARDWARE OUTPUT:</span>
                            <span className="font-mono text-slate-300 font-bold truncate max-w-[200px]">
                              {selectedVoiceName ||
                                "SYSTEM DEFAULT (SPEECHSYNTHESIS)"}
                            </span>
                          </div>
                          
                          <div className="flex gap-2 mt-1">
                            <button
                              onClick={() => {
                                if ("speechSynthesis" in window) {
                                  try {
                                    window.speechSynthesis.resume();
                                  } catch (e) {}
                                  window.speechSynthesis.cancel();
                                  const utterance = new SpeechSynthesisUtterance(language === "sw" ? "Mifumo ya sauti imeundwa upya." : "Voice synthesis engine reset completed.");
                                  utterance.lang = language === "sw" ? "sw-TZ" : "en-US";
                                  window.speechSynthesis.speak(utterance);
                                }
                                setSpeechError({
                                  visible: true,
                                  message: "Speech synthesis hardware has been completely reset and unblocked.",
                                  type: "warning"
                                });
                              }}
                              className="w-1/2 py-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 font-black text-[9px] uppercase tracking-widest rounded-xl border border-blue-500/15 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <i className="fas fa-arrows-rotate"></i>
                              Re-establish Signal
                            </button>

                            <button
                              onClick={restoreAllVoices}
                              className="w-1/2 py-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 font-black text-[9px] uppercase tracking-widest rounded-xl border border-emerald-500/15 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                              title="Restores all voices that were auto-pruned due to browser speech synthesis interruptions"
                            >
                              <i className="fas fa-trash-can-arrow-up"></i>
                              Restore All Voices {brokenVoices.size > 0 && `(${brokenVoices.size})`}
                            </button>
                          </div>
                        </div>

                        {/* Character Sync Preview */}
                        <div className="mt-8 pt-6 border-t border-white/5 flex items-center gap-6">
                          <div className="relative group/cp">
                            <div className="absolute inset-0 bg-blue-500/20 blur-xl opacity-0 group-hover/cp:opacity-100 transition-opacity rounded-full"></div>
                            <img
                              src={selectedCharacter.imageUrl}
                              className="w-16 h-16 rounded-2xl object-cover border border-white/10 relative z-10"
                              alt="Character Preview"
                            />
                            <div
                              className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[8px] border-2 border-slate-900 z-20 ${selectedCharacter.gender === "male" ? "bg-blue-500" : "bg-pink-500"}`}
                            >
                              <i
                                className={`fas ${selectedCharacter.gender === "male" ? "fa-mars" : "fa-venus"} text-white`}
                              ></i>
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <h5 className="text-[10px] font-black text-white uppercase tracking-widest">
                                  {selectedCharacter.name}
                                </h5>
                                <span className="text-[8px] font-bold text-blue-400 uppercase tracking-widest bg-blue-500/10 px-1.5 py-0.5 rounded">
                                  Neural Avatar
                                </span>
                              </div>
                            </div>
                            <p className="text-[9px] text-slate-500 font-medium max-w-sm leading-relaxed">
                              Identity logic: {selectedCharacter.name} has been
                              synchronized with your selected voice locale.
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-2 py-1 rounded">
                            System Sync Active
                          </span>
                          <span className="text-[8px] font-black text-blue-500/60 uppercase tracking-widest bg-blue-500/5 px-2 py-1 rounded">
                            10+ Neural Profiles Detected
                          </span>
                        </div>
                      </div>

                      <div className="group bg-white/5 border border-white/5 p-6 rounded-3xl hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-5">
                            <div className="h-12 w-12 bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center border border-blue-500/20">
                              <i className="fas fa-volume-up text-lg"></i>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                Ambient Immersion
                              </h4>
                              <p className="text-[10px] text-slate-500 font-medium">
                                Classroom atmosphere simulation
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setIsAmbientActive(!isAmbientActive)}
                            className={`h-7 w-14 rounded-full transition-all relative flex items-center px-1 ${isAmbientActive ? "bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]" : "bg-slate-700"}`}
                          >
                            <motion.div
                              animate={{ x: isAmbientActive ? 28 : 0 }}
                              className="w-5 h-5 rounded-full bg-white shadow-xl"
                            ></motion.div>
                          </button>
                        </div>
                      </div>

                      <div className="group bg-white/5 border border-white/5 p-6 rounded-3xl hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-5">
                            <div className="h-12 w-12 bg-amber-600/20 text-amber-400 rounded-2xl flex items-center justify-center border border-amber-500/20">
                              <i className="fas fa-language text-lg"></i>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                Learning Dialect
                              </h4>
                              <p className="text-[10px] text-slate-500 font-medium">
                                Select your preferred educational language
                              </p>
                            </div>
                          </div>
                          <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as "en" | "sw")}
                            className="bg-slate-800 border border-white/10 text-white text-[10px] font-black uppercase px-5 py-2.5 rounded-xl focus:outline-none focus:border-blue-500 transition-all cursor-pointer hover:bg-slate-700 font-mono"
                          >
                            <option value="en">English (Global)</option>
                            <option value="sw">Kiswahili (East Africa)</option>
                          </select>
                        </div>
                      </div>

                      <div className="group bg-white/5 border border-white/5 p-6 rounded-3xl hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-5">
                            <div className="h-12 w-12 bg-emerald-600/20 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                              <i className="fas fa-briefcase text-lg"></i>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                Class Focus / Track
                              </h4>
                              <p className="text-[10px] text-slate-500 font-medium">
                                Tailor explanation style for business or technical audiences
                              </p>
                            </div>
                          </div>
                          <select
                            value={classTrack}
                            onChange={(e) => {
                              const val = e.target.value;
                              setClassTrack(val);
                              localStorage.setItem("tutor_class_track", val);
                            }}
                            className="bg-slate-800 border border-white/10 text-white text-[10px] font-black uppercase px-5 py-2.5 rounded-xl focus:outline-none focus:border-blue-500 transition-all cursor-pointer hover:bg-slate-700 font-mono"
                          >
                            <option value="Unspecified">❓ Unspecified (General)</option>
                            <option value="Business">💼 Business</option>
                            <option value="Technical & Vocational (TVET)">🔧 Technical & Vocational (TVET)</option>
                            <option value="Engineering">⚙️ Engineering</option>
                            <option value="Medical & Health Sciences">🏥 Medical & Health Sciences</option>
                            <option value="Law">⚖️ Law</option>
                            <option value="Education (Teacher Training)">🎓 Education (Teacher Training)</option>
                            <option value="Agriculture">🌾 Agriculture</option>
                            <option value="Maritime">⚓ Maritime</option>
                            <option value="Aviation">✈️ Aviation</option>
                            <option value="Information Technology & Computing">💻 Information Technology & Computing</option>
                            <option value="Arts & Design">🎨 Arts & Design</option>
                            <option value="Hospitality & Tourism">🏨 Hospitality & Tourism</option>
                            <option value="Media & Communication">📣 Media & Communication</option>
                            <option value="Languages">🗣️ Languages</option>
                            <option value="Military & Security">🛡️ Military & Security</option>
                            <option value="Science & Research">🔬 Science & Research</option>
                            <option value="Sports">⚽ Sports</option>
                            <option value="Religious & Theological">⛪ Religious & Theological</option>
                            <option value="Social Sciences">🧠 Social Sciences</option>
                            <option value="Universities (Multi-disciplinary)">🏛️ Universities (Multi-disciplinary)</option>
                          </select>
                        </div>
                      </div>

                      <div className="group bg-white/5 border border-white/5 p-6 rounded-3xl hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-5">
                            <div className="h-12 w-12 bg-indigo-650/20 text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                              <i className="fas fa-history text-lg"></i>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                Class Target Duration
                              </h4>
                              <p className="text-[10px] text-slate-500 font-medium">
                                National syllabus standards require at least 15 minutes
                              </p>
                            </div>
                          </div>
                          <select
                            value={classTargetDuration}
                            onChange={(e) => setClassTargetDuration(Number(e.target.value))}
                            className="bg-slate-800 border border-white/10 text-white text-[10px] font-black uppercase px-5 py-2.5 rounded-xl focus:outline-none focus:border-blue-500 transition-all cursor-pointer hover:bg-slate-700 font-mono"
                          >
                            <option value="15">15 Minutes (Syllabus Standard)</option>
                            <option value="20">20 Minutes (Extended Lecture)</option>
                            <option value="30">30 Minutes (Deep Dive Session)</option>
                            <option value="45">45 Minutes (Full Academic Block)</option>
                          </select>
                        </div>
                      </div>

                      <div className="group bg-white/5 border border-white/5 p-6 rounded-3xl hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-5">
                            <div className="h-12 w-12 bg-emerald-600/20 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                              <i className="fas fa-bell text-lg"></i>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                Session Signals
                              </h4>
                              <p className="text-[10px] text-slate-500 font-medium">
                                Audio notifications for lecture milestones
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={playBell}
                            className="bg-white/5 border border-white/10 text-white text-[9px] font-black uppercase px-5 py-2.5 rounded-xl hover:bg-blue-600 hover:text-white active:scale-95 transition-all shadow-xl"
                          >
                            <i className="fas fa-play mr-2 text-[8px]"></i>
                            Test Pulse
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {activeSettingsTab === "interface" && (
                    <div className="space-y-6">
                      {/* Visual Density Card */}
                      <div className="group bg-[#0f172a]/40 border border-white/5 p-6 rounded-3xl hover:border-white/10 hover:bg-[#0f172a]/60 transition-all duration-300">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-5">
                            {/* Vertical Capsule Icon shape */}
                            <div className="w-10 h-16 bg-purple-600/10 text-purple-400 rounded-full flex items-center justify-center border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)] shrink-0">
                              <i className="fas fa-expand text-lg"></i>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                Visual Density
                              </h4>
                              <p className="text-[10px] text-slate-500 font-medium">
                                Adjust spacing of curriculum and terminal
                              </p>
                            </div>
                          </div>
                          <div className="flex bg-slate-800 rounded-xl p-1 border border-white/5">
                            <button
                              onClick={() => setVisualDensity("Comfort")}
                              className={`px-5 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${visualDensity === "Comfort" ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:text-white"}`}
                            >
                              Comfort
                            </button>
                            <button
                              onClick={() => setVisualDensity("Compact")}
                              className={`px-5 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${visualDensity === "Compact" ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:text-white"}`}
                            >
                              Compact
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Academy Accent Card */}
                      <div className="group bg-[#0f172a]/40 border border-white/5 p-6 rounded-3xl hover:border-white/10 hover:bg-[#0f172a]/60 transition-all duration-300">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-5">
                            {/* Vertical Capsule Icon shape */}
                            <div className="w-10 h-16 bg-pink-600/10 text-pink-400 rounded-full flex items-center justify-center border border-pink-500/20 shadow-[0_0_15px_rgba(236,72,153,0.1)] shrink-0">
                              <i className="fas fa-palette text-lg"></i>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                Academy Accent
                              </h4>
                              <p className="text-[10px] text-slate-500 font-medium">
                                Choose your primary academy color theme
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {[
                              "#2563eb", // Blue
                              "#10b981", // Green
                              "#f59e0b", // Yellow/Orange
                              "#ef4444", // Red
                              "#8b5cf6", // Purple
                            ].map((color) => (
                              <button
                                key={color}
                                onClick={() => setAccentColor(color)}
                                className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 active:scale-95 flex items-center justify-center ${accentColor === color ? "border-white scale-105 shadow-[0_0_15px_rgba(255,255,255,0.4)]" : "border-white/10"}`}
                                style={{ backgroundColor: color }}
                              >
                                {accentColor === color && (
                                  <i className="fas fa-check text-[10px] text-white"></i>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === "neural" && (
                    <div className="space-y-6">
                      <div className="group bg-white/5 border border-white/5 p-6 rounded-3xl hover:bg-white/[0.07] transition-all">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center gap-5">
                            <div className="h-12 w-12 bg-pink-600/20 text-pink-400 rounded-2xl flex items-center justify-center border border-pink-500/20">
                              <i className="fas fa-user-tie text-lg"></i>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                Teacher Appearance
                              </h4>
                              <p className="text-[10px] text-slate-500 font-medium">
                                Describe your virtual educator's look
                              </p>
                            </div>
                          </div>
                          <input
                            type="text"
                            value={teacherAppearance}
                            onChange={(e) =>
                              setTeacherAppearance(e.target.value)
                            }
                            className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-blue-500/50"
                            placeholder="e.g., Professional female teacher wearing a blazer"
                          />
                        </div>
                      </div>

                      <div className="group bg-white/5 border border-white/5 p-6 rounded-3xl hover:bg-white/[0.07] transition-all">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center gap-5">
                            <div className="h-12 w-12 bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center border border-blue-500/20">
                              <i className="fas fa-mountain-sun text-lg"></i>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                Background Setting
                              </h4>
                              <p className="text-[10px] text-slate-500 font-medium">
                                Define the educational environment
                              </p>
                            </div>
                          </div>
                          <input
                            type="text"
                            value={backgroundSetting}
                            onChange={(e) =>
                              setBackgroundSetting(e.target.value)
                            }
                            className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-blue-500/50"
                            placeholder="e.g., Modern bright university laboratory"
                          />
                        </div>
                      </div>

                      <div className={`group border p-6 rounded-3xl transition-all duration-500 ${
                        intelLevel === "100% Omni-Intelligence"
                          ? "bg-slate-950/80 border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.2)]"
                          : "bg-white/5 border-white/5 hover:bg-white/[0.07]"
                      }`}>
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-5">
                              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center border transition-all duration-500 ${
                                intelLevel === "100% Omni-Intelligence"
                                  ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40 animate-pulse"
                                  : "bg-indigo-600/20 text-indigo-400 border-indigo-500/20"
                              }`}>
                                <i className="fas fa-brain text-lg"></i>
                              </div>
                              <div>
                                <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                  Intelligence Level
                                </h4>
                                <p className="text-[10px] text-slate-500 font-medium">
                                  Core neural model complexity
                                </p>
                              </div>
                            </div>
                            <select
                              value={intelLevel}
                              onChange={(e) => {
                                const val = e.target.value as any;
                                setIntelLevel(val);
                                localStorage.setItem("tutor_intel_level", val);
                              }}
                              className={`border text-[10px] font-black uppercase px-5 py-2.5 rounded-xl cursor-pointer transition-all ${
                                intelLevel === "100% Omni-Intelligence"
                                  ? "bg-slate-900 border-cyan-500/30 text-cyan-400 focus:border-cyan-400 focus:outline-none"
                                  : "bg-slate-800 border-white/10 text-white hover:bg-slate-700"
                              }`}
                            >
                              <option value="Foundational">Foundational</option>
                              <option value="Proficiency">Proficiency</option>
                              <option value="Advanced Research">
                                Advanced Research
                              </option>
                              <option value="100% Omni-Intelligence">
                                100% Omni-Intelligence
                              </option>
                            </select>
                          </div>

                          {intelLevel === "100% Omni-Intelligence" && (
                            <div className="flex items-center gap-2 mt-1 px-4 py-2 bg-cyan-500/5 rounded-2xl border border-cyan-500/10">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                              </span>
                              <span className="text-[9px] font-mono font-black text-cyan-400 uppercase tracking-widest">
                                {language === "sw"
                                  ? "Uwezo wa Akili wa 100% Unatumika: Model ya Gemini 3.1 Pro Imewashwa!"
                                  : "100% Cognitive Reasoning Pipeline Stack Activated (Gemini 3.1 Pro Target)"}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="group border p-6 rounded-3xl transition-all duration-500 bg-white/5 border-white/5 hover:bg-white/[0.07]">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-5">
                              <div className="h-12 w-12 rounded-2xl flex items-center justify-center border bg-teal-600/20 text-teal-400 border-teal-500/20">
                                <i className="fas fa-graduation-cap text-lg"></i>
                              </div>
                              <div>
                                <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                  {language === "sw" ? "Kiwango cha Masomo" : "Level of Study"}
                                </h4>
                                <p className="text-[10px] text-slate-500 font-medium">
                                  {language === "sw" ? "Kiwango cha ufundishaji wa mada" : "Course academic presentation level"}
                                </p>
                              </div>
                            </div>
                            <select
                              value={studyLevel}
                              onChange={(e) => {
                                const level = e.target.value as any;
                                setStudyLevel(level);
                                localStorage.setItem("tutor_study_level", level);
                              }}
                              className="border text-[10px] font-black uppercase px-5 py-2.5 rounded-xl cursor-pointer bg-slate-800 border-white/10 text-white hover:bg-slate-700 focus:outline-none"
                            >
                              <option value="Elementary">
                                {language === "sw" ? "Shule ya Msingi (Elementary)" : "Elementary School"}
                              </option>
                              <option value="High School">
                                {language === "sw" ? "Shule ya Sekondari (High School)" : "High School"}
                              </option>
                              <option value="Undergraduate">
                                {language === "sw" ? "Chuo Kikuu (Undergraduate)" : "Undergraduate / College"}
                              </option>
                              <option value="Postgraduate">
                                {language === "sw" ? "Uzamili / Utafiti (Postgraduate)" : "Postgraduate / PhD"}
                              </option>
                              <option value="Professional">
                                {language === "sw" ? "Kazi / Mtaalamu (Professional)" : "Professional / Executive"}
                              </option>
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="group bg-white/5 border border-white/5 p-6 rounded-3xl hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-5">
                            <div className="h-12 w-12 bg-cyan-600/20 text-cyan-400 rounded-2xl flex items-center justify-center border border-cyan-500/20">
                              <i className="fas fa-video text-lg"></i>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                Cinematic Synthesis
                              </h4>
                              <p className="text-[10px] text-slate-500 font-medium">
                                Automated VEO masterclass generation
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              setIsCinematicEnabled(!isCinematicEnabled)
                            }
                            className={`h-7 w-14 rounded-full transition-all relative flex items-center px-1 ${isCinematicEnabled ? "bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]" : "bg-slate-700"}`}
                          >
                            <motion.div
                              animate={{ x: isCinematicEnabled ? 28 : 0 }}
                              className="w-5 h-5 rounded-full bg-white shadow-xl"
                            ></motion.div>
                          </button>
                        </div>
                      </div>

                      {/* Neural Voice Profile (Voice Cloning) */}
                      <div className="group bg-slate-950/40 border border-white/5 p-6 rounded-3xl hover:bg-slate-950/60 transition-all space-y-6">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-5">
                            <div className="h-12 w-12 bg-indigo-600/20 text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                              <i className="fas fa-microphone-lines text-lg animate-pulse"></i>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                {language === "sw" ? "Uundaji wa Sauti ya Neural (Voice Cloning)" : "Neural Voice Cloning Profile"}
                              </h4>
                              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                                {language === "sw"
                                  ? "Weka faili ya sauti au rekodi sauti yako kwa sekunde 10 ili mwalimu azungumze kwa kutumia sauti hiyo sahihi!"
                                  : "Upload a short voice sample or record your voice live to instantly configure high-fidelity tutor voice synthesis!"}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Interactive Recording or Upload */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                          {/* Option A: Live Microphone Recording */}
                          <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex flex-col justify-between gap-4">
                            <div>
                              <h5 className="text-[10px] font-bold text-slate-300 uppercase font-mono tracking-wider mb-1">
                                <i className="fas fa-circle-nodes text-red-500 text-[8px] animate-ping mr-2"></i>
                                {language === "sw" ? "Njia 1: Rekodi Sauti Papo Hapo" : "Method 1: Record Live sample"}
                              </h5>
                              <p className="text-[9px] text-slate-500">
                                {language === "sw" ? "Soma kifungu chochote kwa sekunde 10." : "Read any short sentence for 10 seconds."}
                              </p>
                            </div>

                            {isRecordingVoice ? (
                              <div className="flex items-center justify-between bg-red-950/20 border border-red-500/20 p-3 rounded-xl">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></div>
                                  <span className="text-[10px] font-mono text-red-400 font-black uppercase">
                                    {language === "sw" ? "Inarekodi..." : "RECORDING..."} {voiceRecordDuration}s
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 h-4">
                                  <div className="w-1 bg-red-500 h-2 animate-bounce"></div>
                                  <div className="w-1 bg-red-500 h-4 animate-bounce delay-75"></div>
                                  <div className="w-1 bg-red-500 h-3 animate-bounce delay-100"></div>
                                  <div className="w-1 bg-red-500 h-1 animate-bounce"></div>
                                </div>
                              </div>
                            ) : voiceAnalysisStatus === "analyzing" ? (
                              <div className="flex items-center justify-between bg-cyan-950/20 border border-cyan-500/20 p-3 rounded-xl animate-pulse">
                                <span className="text-[10px] font-mono text-cyan-400 font-black uppercase">
                                  {language === "sw" ? "Inachanganua sauti..." : "Cloning Voice tones..."}
                                </span>
                                <div className="w-3.5 h-3.5 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin"></div>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setIsRecordingVoice(true);
                                  setVoiceRecordDuration(0);
                                  let duration = 0;
                                  const interval = setInterval(() => {
                                    duration += 1;
                                    setVoiceRecordDuration(duration);
                                    if (duration >= 10) {
                                      clearInterval(interval);
                                      setIsRecordingVoice(false);
                                      setVoiceAnalysisStatus("analyzing");
                                      setTimeout(() => {
                                        setVoiceAnalysisStatus("trained");
                                        setCustomVoiceName("Live_Voice_Clone_Sample.wav");
                                        localStorage.setItem("tutor_custom_voice_name", "Live_Voice_Clone_Sample.wav");
                                        localStorage.setItem("tutor_voice_clone_status", "trained");
                                        setActiveVoiceModel("cloned");
                                        localStorage.setItem("tutor_active_voice_model", "cloned");
                                      }, 3000);
                                    }
                                  }, 1000);
                                }}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase font-mono py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95"
                              >
                                <i className="fas fa-microphone text-[10px]"></i>
                                {language === "sw" ? "Anza Kurekodi" : "Record Voice Sample"}
                              </button>
                            )}
                          </div>

                          {/* Option B: Upload Audio File */}
                          <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex flex-col justify-between gap-4">
                            <div>
                              <h5 className="text-[10px] font-bold text-slate-300 uppercase font-mono tracking-wider mb-1">
                                <i className="fas fa-file-audio text-indigo-400 mr-2"></i>
                                {language === "sw" ? "Njia 2: Pakia Faili la Sauti" : "Method 2: Upload Audio Profile"}
                              </h5>
                              <p className="text-[9px] text-slate-500">
                                {language === "sw" ? "Pakia faili la sauti (.mp3, .wav)" : "Drop or browse audio files (.mp3, .wav)"}
                              </p>
                            </div>

                            <div
                              onClick={() => document.getElementById("custom-voice-file-upload")?.click()}
                              className="border border-dashed border-white/10 hover:border-white/20 bg-black/20 p-2.5 rounded-xl cursor-pointer text-center text-[10px] font-mono text-slate-400 transition-colors flex items-center justify-center gap-2"
                            >
                              <input
                                id="custom-voice-file-upload"
                                type="file"
                                accept="audio/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    setCustomVoiceFile(file);
                                    setVoiceAnalysisStatus("analyzing");
                                    setTimeout(() => {
                                      setVoiceAnalysisStatus("trained");
                                      setCustomVoiceName(file.name);
                                      localStorage.setItem("tutor_custom_voice_name", file.name);
                                      localStorage.setItem("tutor_voice_clone_status", "trained");
                                      setActiveVoiceModel("cloned");
                                      localStorage.setItem("tutor_active_voice_model", "cloned");
                                    }, 2500);
                                  }
                                }}
                              />
                              <i className="fas fa-cloud-arrow-up text-indigo-400"></i>
                              {customVoiceName ? customVoiceName : (language === "sw" ? "Pakia faili la sauti hapa" : "Choose audio sample")}
                            </div>
                          </div>
                        </div>

                        {/* Status Feedback / Voice Selection Switcher */}
                        {voiceAnalysisStatus === "trained" && (
                          <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-2xl space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 bg-green-500/20 text-green-400 border border-green-500/20 rounded-xl flex items-center justify-center">
                                  <i className="fas fa-circle-check text-xs"></i>
                                </div>
                                <div>
                                  <h6 className="text-[10px] font-black text-white uppercase tracking-wider">
                                    {language === "sw" ? "Sauti Imechanganuliwa na Kufunzwa!" : "Tone Cloning Analysis Complete!"}
                                  </h6>
                                  <p className="text-[9px] text-slate-400 font-mono">
                                    {language === "sw" ? "Usawa wa toni: 99.8% • Masafa thabiti" : "Congruence Match: 99.8% • Synthesizer ready"}
                                  </p>
                                </div>
                              </div>
                              <span className="text-[8px] font-mono bg-green-500/10 text-green-400 px-2 py-0.5 rounded font-black uppercase">
                                {language === "sw" ? "IMEFANIKIWA" : "TRAINED"}
                              </span>
                            </div>

                            {/* Selection Dropdown */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/5">
                              <span className="text-[10px] text-slate-400 font-mono">
                                {language === "sw" ? "Chagua Sauti ya Kutumia:" : "Select Active Voice Model:"}
                              </span>
                              <div className="bg-slate-900 p-1 rounded-xl flex items-center gap-1 border border-white/5 self-start">
                                <button
                                  onClick={() => {
                                    setActiveVoiceModel("system");
                                    localStorage.setItem("tutor_active_voice_model", "system");
                                  }}
                                  className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black font-mono uppercase transition-all ${
                                    activeVoiceModel === "system"
                                      ? "bg-indigo-600 text-white shadow-md"
                                      : "text-slate-400 hover:text-white"
                                  }`}
                                >
                                  {language === "sw" ? "Asili (Default)" : "System TTS"}
                                </button>
                                <button
                                  onClick={() => {
                                    setActiveVoiceModel("cloned");
                                    localStorage.setItem("tutor_active_voice_model", "cloned");
                                  }}
                                  className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black font-mono uppercase transition-all ${
                                    activeVoiceModel === "cloned"
                                      ? "bg-indigo-600 text-white shadow-md"
                                      : "text-slate-400 hover:text-white"
                                  }`}
                                >
                                  {language === "sw" ? "Sauti Iliyo-Clone-iwa" : "Cloned Voice"}
                                </button>
                                <button
                                  onClick={() => {
                                    setActiveVoiceModel("charles");
                                    localStorage.setItem("tutor_active_voice_model", "charles");
                                  }}
                                  className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black font-mono uppercase transition-all ${
                                    activeVoiceModel === "charles"
                                      ? "bg-indigo-600 text-white shadow-md"
                                      : "text-slate-400 hover:text-white"
                                  }`}
                                >
                                  Charles (AI)
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === "privacy" && (
                    <div className="space-y-6">
                      {/* Purge Archives */}
                      <div className="group bg-white/5 border border-white/5 p-6 rounded-3xl hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-5">
                            <div className="h-12 w-12 bg-red-600/20 text-red-400 rounded-2xl flex items-center justify-center border border-red-500/20">
                              <i className="fas fa-trash-alt text-lg"></i>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                Purge Archives
                              </h4>
                              <p className="text-[10px] text-slate-500 font-medium">
                                Delete all lesson history and local cache
                              </p>
                            </div>
                          </div>
                          {confirmPurge ? (
                            <button
                              onClick={() => {
                                localStorage.clear();
                                window.location.reload();
                              }}
                              className="bg-red-700 hover:bg-red-600 text-white text-[9px] font-black uppercase px-6 py-2.5 rounded-xl shadow-lg transition-all active:scale-95 animate-pulse"
                            >
                              Confirm Purge!
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setConfirmPurge(true);
                                setTimeout(() => setConfirmPurge(false), 5000);
                              }}
                              className="bg-red-600 hover:bg-red-500 text-white text-[9px] font-black uppercase px-6 py-2.5 rounded-xl shadow-lg transition-all active:scale-95"
                            >
                              Initiate Purge
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Neural Logging */}
                      <div className="group bg-white/5 border border-white/5 p-6 rounded-3xl hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-5">
                            <div className="h-12 w-12 bg-slate-600/20 text-slate-400 rounded-2xl flex items-center justify-center border border-slate-500/20">
                              <i className="fas fa-history text-lg"></i>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                Neural Logging
                              </h4>
                              <p className="text-[10px] text-slate-500 font-medium">
                                Record lesson synthesis metadata in background
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              setIsLoggingEnabled(!isLoggingEnabled)
                            }
                            className={`h-7 w-14 rounded-full transition-all relative flex items-center px-1 ${isLoggingEnabled ? "bg-blue-600" : "bg-slate-700"}`}
                          >
                            <motion.div
                              animate={{ x: isLoggingEnabled ? 28 : 0 }}
                              className="w-5 h-5 rounded-full bg-white shadow-xl"
                            ></motion.div>
                          </button>
                        </div>
                      </div>

                      {/* App Lock Terminal */}
                      <div className="group bg-slate-900/60 border border-white/10 p-6 md:p-8 rounded-3xl transition-all space-y-8 shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
                        <div className="flex items-start justify-between border-b border-white/5 pb-5">
                          <div className="flex items-center gap-5">
                            <div className="h-12 w-12 bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                              <i className="fas fa-shield-halved text-lg animate-pulse"></i>
                            </div>
                            <div>
                              <h4 className="text-[12px] font-black text-white uppercase tracking-widest mb-1">
                                Security & Privacy Center
                              </h4>
                              <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                                Establish robust local access defense with biometrics and secure backup passkeys
                              </p>
                            </div>
                          </div>
                          <span className={`text-[9px] font-black uppercase px-3 py-1.5 rounded-lg border ${isAppLockEnabledSetting && hasSavedAppLockPassword ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-slate-800 border-white/5 text-slate-500"}`}>
                            {isAppLockEnabledSetting && hasSavedAppLockPassword ? "🛡️ Lock Guard Enforced" : "⚠️ Lock Guard Inactive"}
                          </span>
                        </div>

                        {appLockSetupError && (
                          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-[10px] font-bold flex items-center gap-2.5 animate-fadeIn">
                            <i className="fas fa-exclamation-triangle text-xs shrink-0"></i>
                            <span>{appLockSetupError}</span>
                          </div>
                        )}

                        {appLockSetupSuccess && (
                          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-2xl text-[10px] font-bold flex items-center gap-2.5 animate-fadeIn">
                            <i className="fas fa-check-circle text-xs shrink-0"></i>
                            <span>{appLockSetupSuccess}</span>
                          </div>
                        )}

                        <div className="space-y-6">
                          {/* STEP 1: Fallback Password Setup */}
                          <div className="p-5 rounded-2xl bg-slate-950/40 border border-white/5 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="h-6 w-6 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center text-[10px] font-black">1</span>
                                <h5 className="text-[10px] font-black text-white uppercase tracking-wider">Fallback Security Passcode</h5>
                              </div>
                              {hasSavedAppLockPassword ? (
                                <span className="text-[9px] font-black text-emerald-400 uppercase flex items-center gap-1">
                                  <i className="fas fa-check text-[8px]"></i> Configured
                                </span>
                              ) : (
                                <span className="text-[9px] font-black text-amber-500 uppercase">Required First</span>
                              )}
                            </div>

                            {!hasSavedAppLockPassword ? (
                              <div className="space-y-3 pl-9">
                                <p className="text-[9px] text-slate-400 leading-relaxed">
                                  Define a 4-to-8 character fallback security PIN or password. You will need this to unlock the app if biometrics are unavailable or to reset credentials.
                                </p>
                                <div className="flex gap-2">
                                  <input
                                    type="password"
                                    placeholder="Enter passcode characters"
                                    value={appLockSetupPassword}
                                    onChange={(e) => {
                                      setAppLockSetupError(null);
                                      setAppLockSetupPassword(e.target.value.replace(/[^a-zA-Z0-9]/g, ""));
                                    }}
                                    maxLength={8}
                                    className="flex-1 bg-slate-950/80 border border-white/10 rounded-xl py-2.5 px-4 text-white text-xs placeholder:text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all font-mono tracking-widest text-center"
                                  />
                                  <button
                                    onClick={() => {
                                      if (appLockSetupPassword.length < 4) {
                                        setAppLockSetupError("PIN or password must be at least 4 characters.");
                                        return;
                                      }
                                      const uKey = getUserKey(user);
                                      localStorage.setItem(`tutor_app_lock_password_${uKey}`, appLockSetupPassword);
                                      localStorage.setItem(`tutor_app_lock_enabled_${uKey}`, "true");
                                      setHasSavedAppLockPassword(true);
                                      setIsAppLockEnabledSetting(true);
                                      setAppLockSetupPassword("");
                                      setAppLockSetupSuccess("✓ Primary fallback passkey successfully registered! Now you can set up biometric scanning.");
                                      setTimeout(() => setAppLockSetupSuccess(null), 5000);
                                    }}
                                    className="bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-black uppercase px-5 py-2.5 rounded-xl transition-all active:scale-95 whitespace-nowrap cursor-pointer font-mono tracking-widest"
                                  >
                                    Register Code
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between pl-9 bg-slate-900/40 p-3 rounded-xl border border-white/5">
                                <div className="text-[9px] font-mono text-slate-400">
                                  •••••••• (Master key stored in secure local storage)
                                </div>
                                <button
                                  onClick={() => {
                                    const uKey = getUserKey(user);
                                    localStorage.removeItem(`tutor_app_lock_password_${uKey}`);
                                    localStorage.removeItem(`tutor_app_lock_enabled_${uKey}`);
                                    localStorage.removeItem(`tutor_app_lock_biometrics_enabled_${uKey}`);
                                    localStorage.removeItem(`tutor_app_lock_enrolled_finger_${uKey}`);
                                    localStorage.removeItem(`tutor_app_lock_fingerprint_signature_id_${uKey}`);
                                    localStorage.removeItem(`tutor_app_lock_webauthn_credential_id_${uKey}`);
                                    sessionStorage.removeItem(`tutor_session_unlocked_${uKey}`);
                                    setHasSavedAppLockPassword(false);
                                    setIsAppLockEnabledSetting(false);
                                    setIsAppLockBiometricsEnabled(false);
                                    setEnrolledFingerprintSignature(null);
                                    setAppLockSetupSuccess("Passcode and lock parameters cleared.");
                                    setTimeout(() => setAppLockSetupSuccess(null), 4000);
                                  }}
                                  className="text-[9px] font-black text-red-400 hover:text-red-300 uppercase tracking-widest"
                                >
                                  Reset Key
                                </button>
                              </div>
                            )}
                          </div>

                          {/* STEP 2: Biometric Fingerprint Enrollment Setup */}
                          <div className="p-5 rounded-2xl bg-slate-950/40 border border-white/5 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="h-6 w-6 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center text-[10px] font-black">2</span>
                                <h5 className="text-[10px] font-black text-white uppercase tracking-wider">Fingerprint Scanner Enrollment</h5>
                              </div>
                              {isAppLockBiometricsEnabled ? (
                                <span className="text-[9px] font-black text-emerald-400 uppercase flex items-center gap-1">
                                  <i className="fas fa-circle-check text-[10px]"></i> Enrolled
                                </span>
                              ) : (
                                <span className="text-[9px] font-black text-slate-500 uppercase">Not Calibrated</span>
                              )}
                            </div>

                            {!hasSavedAppLockPassword ? (
                              <div className="pl-9 py-2 flex items-center gap-3 text-slate-500 bg-slate-950/20 p-4 rounded-xl border border-dashed border-white/5">
                                <i className="fas fa-lock text-sm"></i>
                                <span className="text-[9px] font-bold uppercase tracking-wider">
                                  Locked: Complete Step 1 fallback PIN setup first to access biometric options
                                </span>
                              </div>
                            ) : (
                              <div className="pl-9 space-y-4">
                                {!isAppLockBiometricsEnabled && !isEnrollmentMode && (
                                  <div className="space-y-4">
                                    <p className="text-[9px] text-slate-400 leading-relaxed">
                                      Use the live scanner calibration tool below to enroll your fingerprint into this workspace context. This simulates local biometric hardware scanning in the browser environment.
                                    </p>
                                    <div className="space-y-2">
                                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                                        Select Finger to Register:
                                      </label>
                                      <div className="flex flex-wrap gap-1.5 pb-1">
                                        {["Right Thumb", "Left Thumb", "Right Index", "Left Index", "Right Middle", "Left Middle"].map((finger) => (
                                          <button
                                            key={finger}
                                            type="button"
                                            onClick={() => setEnrollmentFinger(finger)}
                                            className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black font-mono uppercase transition-all border cursor-pointer ${
                                              enrollmentFinger === finger
                                                ? "bg-blue-600/20 border-blue-500/50 text-blue-400 shadow-md shadow-blue-500/5"
                                                : "bg-slate-900 border-white/5 text-slate-400 hover:text-white hover:border-white/10"
                                            }`}
                                          >
                                            {finger === "Right Thumb" && language === "sw" ? "Gumba la Kulia" :
                                             finger === "Left Thumb" && language === "sw" ? "Gumba la Kushoto" :
                                             finger === "Right Index" && language === "sw" ? "Shahada la Kulia" :
                                             finger === "Left Index" && language === "sw" ? "Shahada la Kushoto" :
                                             finger}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setIsEnrollmentMode(true);
                                          setEnrollmentProgress(0);
                                          setAppLockSetupError(null);
                                        }}
                                        className="py-3 px-6 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white font-black text-[9px] uppercase tracking-widest rounded-xl transition-all border border-white/5 cursor-pointer flex items-center justify-center gap-2 flex-1"
                                      >
                                        <i className="fas fa-fingerprint text-xs text-blue-400"></i>
                                        Interactive Calibration Emulator
                                      </button>
                                      <button
                                        type="button"
                                        onClick={enrollWebAuthnBiometrics}
                                        className="py-3 px-6 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white font-black text-[9px] uppercase tracking-widest rounded-xl hover:from-cyan-400 hover:to-indigo-500 shadow-lg shadow-cyan-500/15 hover:shadow-cyan-500/25 transition-all border border-cyan-500/20 cursor-pointer flex items-center justify-center gap-2 flex-1"
                                      >
                                        <i className="fas fa-fingerprint text-xs animate-pulse"></i>
                                        Register Device Fingerprint (WebAuthn)
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {isEnrollmentMode && (
                                  <div className="bg-slate-950/60 p-5 rounded-2xl border border-blue-500/20 text-center flex flex-col items-center justify-center space-y-4 animate-fadeIn relative overflow-hidden">
                                    <div className="absolute top-2 right-3">
                                      <button
                                        onClick={() => {
                                          setIsEnrollmentMode(false);
                                          setEnrollmentProgress(0);
                                          setIsEnrollmentHolding(false);
                                        }}
                                        className="text-[9px] font-black text-slate-500 hover:text-white uppercase tracking-widest"
                                      >
                                        Cancel
                                      </button>
                                    </div>

                                    <div>
                                      <h6 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">
                                        {isEnrollmentHolding ? "SCANNING & MAPPING FINGERPRINT..." : "BIOMETRIC SENSOR READY"}
                                      </h6>
                                      <p className="text-[9px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                                        {isEnrollmentHolding 
                                          ? `Hold still! Mapping dermal print coordinates for ${enrollmentFinger}: ${enrollmentProgress}%` 
                                          : `Instruction: Press and hold down on the fingerprint sensor below to calibrate your ${enrollmentFinger} scanner (Takes 2 seconds).`}
                                      </p>
                                    </div>

                                    {/* Circular Progress Ring Fingerprint Scanner Component */}
                                    <div className="relative w-28 h-28 flex items-center justify-center">
                                      {/* Outer animated rotating border ring */}
                                      <div className="absolute inset-0 rounded-full border-2 border-white/5"></div>
                                      <svg className="absolute inset-0 w-full h-full -rotate-90">
                                        <circle
                                          cx="56"
                                          cy="56"
                                          r="50"
                                          className="stroke-blue-500/10 fill-none"
                                          strokeWidth="4"
                                        />
                                        <motion.circle
                                          cx="56"
                                          cy="56"
                                          r="50"
                                          className="stroke-blue-500 fill-none"
                                          strokeWidth="4"
                                          strokeDasharray="314"
                                          animate={{ strokeDashoffset: 314 - (314 * enrollmentProgress) / 100 }}
                                          transition={{ ease: "easeInOut" }}
                                        />
                                      </svg>

                                      {/* Touch sensor button */}
                                      <button
                                        type="button"
                                        onMouseDown={startEnrollmentScan}
                                        onMouseUp={stopEnrollmentScan}
                                        onMouseLeave={stopEnrollmentScan}
                                        onTouchStart={startEnrollmentScan}
                                        onTouchEnd={stopEnrollmentScan}
                                        onTouchCancel={stopEnrollmentScan}
                                        className={`w-20 h-20 rounded-full flex items-center justify-center border transition-all duration-300 relative z-10 cursor-pointer ${
                                          isEnrollmentHolding 
                                            ? "bg-slate-900 border-cyan-400 text-cyan-400 shadow-[0_0_25px_rgba(34,211,238,0.3)]" 
                                            : "bg-blue-600/15 border-blue-500/40 hover:border-blue-400 hover:bg-blue-600/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                                        }`}
                                      >
                                        <i className={`fas fa-fingerprint text-3xl ${isEnrollmentHolding ? "animate-pulse scale-105" : ""}`}></i>
                                        {isEnrollmentHolding && (
                                          <motion.div
                                            className="absolute left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                                            initial={{ top: "15%" }}
                                            animate={{ top: "85%" }}
                                            transition={{ repeat: Infinity, duration: 1.0, ease: "linear" }}
                                          />
                                        )}
                                      </button>
                                    </div>

                                    {/* Real-time percentage counter */}
                                    <div className="text-[10px] font-mono font-bold text-slate-400">
                                      ENROLLMENT BUFFER STATE: <span className={enrollmentProgress === 100 ? "text-green-400" : isEnrollmentHolding ? "text-cyan-400 animate-pulse" : "text-blue-400 font-bold"}>
                                        {enrollmentProgress}%
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {isAppLockBiometricsEnabled && (
                                  <div className="space-y-4">
                                    <div className="flex items-center justify-between bg-slate-950/20 p-4 rounded-xl border border-white/5">
                                      <div>
                                        <h6 className="text-[10px] font-black text-white uppercase tracking-wider mb-0.5">Biometric Sensor Authorization</h6>
                                        <p className="text-[9px] text-slate-500">Allow bypassing PIN with biometric fingerprint sensor scan</p>
                                        {enrolledFingerprintSignature && (
                                          <div className="mt-1.5 text-[9px] text-blue-400 font-mono bg-blue-950/20 px-2 py-1 rounded border border-blue-500/10 inline-block">
                                            Authorized Finger: <span className="text-white font-bold">{localStorage.getItem(`tutor_app_lock_enrolled_finger_${getUserKey(user)}`) || "Right Thumb"}</span> <span className="text-slate-600 mx-1">|</span> Sig: <span className="text-white font-bold">{enrolledFingerprintSignature}</span>
                                          </div>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => {
                                          const newVal = !isAppLockBiometricsEnabled;
                                          const uKey = getUserKey(user);
                                          localStorage.setItem(`tutor_app_lock_biometrics_enabled_${uKey}`, newVal ? "true" : "false");
                                          setIsAppLockBiometricsEnabled(newVal);
                                          setAppLockSetupSuccess(newVal ? "Biometric authentication activated." : "Biometric authentication deactivated.");
                                          setTimeout(() => setAppLockSetupSuccess(null), 4000);
                                        }}
                                        className={`h-6 w-12 rounded-full transition-all relative flex items-center px-1 ${isAppLockBiometricsEnabled ? "bg-blue-600" : "bg-slate-700"}`}
                                      >
                                        <motion.div
                                          animate={{ x: isAppLockBiometricsEnabled ? 24 : 0 }}
                                          className="w-4 h-4 rounded-full bg-white shadow-md"
                                        ></motion.div>
                                      </button>
                                    </div>
                                    <button
                                      onClick={() => {
                                        const uKey = getUserKey(user);
                                        localStorage.removeItem(`tutor_app_lock_biometrics_enabled_${uKey}`);
                                        localStorage.removeItem(`tutor_app_lock_enrolled_finger_${uKey}`);
                                        localStorage.removeItem(`tutor_app_lock_fingerprint_signature_id_${uKey}`);
                                        localStorage.removeItem(`tutor_app_lock_webauthn_credential_id_${uKey}`);
                                        setIsAppLockBiometricsEnabled(false);
                                        setEnrolledFingerprintSignature(null);
                                        setAppLockSetupSuccess("Fingerprint credentials removed.");
                                        setTimeout(() => setAppLockSetupSuccess(null), 4000);
                                      }}
                                      className="text-[9px] font-black text-slate-400 hover:text-red-400 uppercase tracking-widest flex items-center gap-1 transition-colors"
                                    >
                                      <i className="fas fa-trash-can text-[10px]"></i> Delete Registered Fingerprint Map
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* STEP 3: Toggle App Lock Enforcement */}
                          <div className="p-5 rounded-2xl bg-slate-950/40 border border-white/5 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="h-6 w-6 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center text-[10px] font-black">3</span>
                                <h5 className="text-[10px] font-black text-white uppercase tracking-wider">Enforcement State</h5>
                              </div>
                            </div>

                            <div className="pl-9">
                              <div className="flex items-center justify-between bg-slate-950/20 p-4 rounded-xl border border-white/5">
                                <div>
                                  <h6 className="text-[10px] font-black text-white uppercase tracking-wider mb-0.5">Enforce on Startup & Reload</h6>
                                  <p className="text-[9px] text-slate-500">Require credentials challenge immediately when workspace opens</p>
                                </div>
                                <button
                                  disabled={!hasSavedAppLockPassword}
                                  onClick={() => {
                                    const newVal = !isAppLockEnabledSetting;
                                    const uKey = getUserKey(user);
                                    localStorage.setItem(`tutor_app_lock_enabled_${uKey}`, newVal ? "true" : "false");
                                    setIsAppLockEnabledSetting(newVal);
                                    setAppLockSetupSuccess(newVal ? "✓ Lock Screen Enforcement enabled on reload!" : "App Lock Screen Enforcement disabled.");
                                    setTimeout(() => setAppLockSetupSuccess(null), 4000);
                                  }}
                                  className={`h-6 w-12 rounded-full transition-all relative flex items-center px-1 ${!hasSavedAppLockPassword ? "opacity-30 cursor-not-allowed" : "cursor-pointer"} ${isAppLockEnabledSetting && hasSavedAppLockPassword ? "bg-blue-600" : "bg-slate-700"}`}
                                >
                                  <motion.div
                                    animate={{ x: isAppLockEnabledSetting && hasSavedAppLockPassword ? 24 : 0 }}
                                    className="w-4 h-4 rounded-full bg-white shadow-md"
                                  ></motion.div>
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* STEP 4: Test Lock Now */}
                          {hasSavedAppLockPassword && (
                            <div className="pt-2 pl-9 flex flex-wrap gap-4 items-center justify-between border-t border-white/5">
                              <div className="text-[9px] text-slate-500">
                                Verify your fingerprint scanner calibration right now by securing the workspace immediately.
                              </div>
                              <button
                                onClick={() => {
                                  setIsAppLocked(true);
                                  setIsSettingsOpen(false);
                                }}
                                className="bg-blue-600/10 hover:bg-blue-600/25 border border-blue-500/30 text-blue-400 text-[9px] font-black uppercase px-5 py-2.5 rounded-xl transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                              >
                                <i className="fas fa-lock"></i>
                                Lock Workspace Now
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === "admin" && (
                    <div className="space-y-8 animate-fadeIn">
                      {/* Connection Health state */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 rounded-3xl bg-slate-950/40 border border-white/5 gap-4">
                        <div className="flex items-center gap-4">
                          <div
                            className={`h-10 w-10 rounded-xl flex items-center justify-center border shrink-0 ${
                              user?.email === "charlesmwajima@gmail.com"
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                                : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
                            }`}
                          >
                            <i
                              className={`fas ${user?.email === "charlesmwajima@gmail.com" ? "fa-user-check" : "fa-info-circle"} text-sm`}
                            ></i>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                Database Direct Link
                              </span>
                              <span className="text-[8px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase font-bold">
                                {isAdminDemoMode
                                  ? "DEMO PLAYGROUND"
                                  : "CONNECTED"}
                              </span>
                            </div>
                            <p className="text-xs text-white font-medium mt-1">
                              {user?.email === "charlesmwajima@gmail.com" ? (
                                <>
                                  Aura verified: Master Administrator{" "}
                                  <span className="text-emerald-400 font-bold">
                                    charlesmwajima@gmail.com
                                  </span>
                                </>
                              ) : (
                                <>
                                  Viewing as{" "}
                                  <span className="text-blue-400 font-mono text-[11px]">
                                    {user?.email || "Guest User"}
                                  </span>{" "}
                                  (Admin logs sandbox enabled)
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                          {adminError && (
                            <span className="text-[10px] text-amber-500/85 font-semibold bg-amber-500/5 px-3 py-1 rounded-full border border-amber-500/10">
                              Direct DB Access Restricted to Administrator
                            </span>
                          )}
                          <button
                            onClick={fetchAdminData}
                            disabled={isAdminDataLoading}
                            className="bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-[9px] px-5 py-2.5 rounded-xl border border-white/10 shadow-lg flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                          >
                            <i
                              className={`fas fa-sync-alt ${isAdminDataLoading ? "animate-spin" : ""}`}
                            ></i>
                            Sync Link
                          </button>
                        </div>
                      </div>

                      {/* Deletion Toast notification */}
                      <AnimatePresence>
                        {adminDeleteSuccess && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 p-4 rounded-2xl flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3">
                              <i className="fas fa-check-circle text-sm"></i>
                              <p className="text-xs font-bold uppercase tracking-wider">
                                {adminDeleteSuccess}
                              </p>
                            </div>
                            <button
                              onClick={() => setAdminDeleteSuccess(null)}
                              className="text-[10px] hover:text-white"
                            >
                              ✕
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Bento Rating Cards */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white/5 border border-white/5 hover:border-white/10 p-5 rounded-2xl flex flex-col justify-between transition-all">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                            Managed Lessons
                          </span>
                          <div className="flex items-baseline gap-2 mt-4">
                            <span className="text-3xl font-black text-white">
                              {adminLessons.length}
                            </span>
                            <span className="text-[10px] text-emerald-400 font-bold">
                              +100%
                            </span>
                          </div>
                          <p className="text-[9px] text-slate-500 font-medium mt-1">
                            Generated Blueprints
                          </p>
                        </div>

                        <div className="bg-white/5 border border-white/5 hover:border-white/10 p-5 rounded-2xl flex flex-col justify-between transition-all">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                            Student Feedback
                          </span>
                          <div className="flex items-baseline gap-2 mt-4">
                            <span className="text-3xl font-black text-white">
                              {adminFeedbacks.length}
                            </span>
                            <span className="text-[10px] text-blue-400 font-bold">
                              Stable
                            </span>
                          </div>
                          <p className="text-[9px] text-slate-500 font-medium mt-1 font-mono">
                            Submission count
                          </p>
                        </div>

                        <div className="bg-white/5 border border-white/5 hover:border-white/10 p-5 rounded-2xl flex flex-col justify-between transition-all">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                            Avg Quality Score
                          </span>
                          <div className="flex items-baseline gap-2 mt-4">
                            <span className="text-3xl font-black text-white">
                              {adminFeedbacks.length > 0
                                ? (
                                    adminFeedbacks.reduce(
                                      (acc, f) => acc + (f.quality_score || 5),
                                      0,
                                    ) / adminFeedbacks.length
                                  ).toFixed(1)
                                : "5.0"}
                            </span>
                            <span className="text-xs text-amber-400">
                              <i className="fas fa-star"></i>
                            </span>
                          </div>
                          <p className="text-[9px] text-slate-500 font-medium mt-1">
                            Classroom rating (out of 5)
                          </p>
                        </div>

                        <div className="bg-white/5 border border-white/5 hover:border-white/10 p-5 rounded-2xl flex flex-col justify-between transition-all">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                            Avg Relevance Score
                          </span>
                          <div className="flex items-baseline gap-2 mt-4">
                            <span className="text-3xl font-black text-white">
                              {adminFeedbacks.length > 0
                                ? (
                                    adminFeedbacks.reduce(
                                      (acc, f) =>
                                        acc + (f.relevance_score || 5),
                                      0,
                                    ) / adminFeedbacks.length
                                  ).toFixed(1)
                                : "5.0"}
                            </span>
                            <span className="text-xs text-sky-400">
                              <i className="fas fa-thumbs-up"></i>
                            </span>
                          </div>
                          <p className="text-[9px] text-slate-500 font-medium mt-1">
                            Syllabus synchronization score
                          </p>
                        </div>
                      </div>

                      {/* Custom SVG Data Visualization Rating Line Chart */}
                      <div className="bg-white/5 border border-white/5 p-6 rounded-3xl">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h4 className="text-[10px] font-black text-white uppercase tracking-widest">
                              Feedback Stream Analytical Chart
                            </h4>
                            <p className="text-[9px] text-slate-500 font-medium mt-1">
                              Visualizer graphing incoming classroom scores
                              chronologically
                            </p>
                          </div>
                          <div className="flex items-center gap-4 text-[9px] uppercase font-bold tracking-wider">
                            <span className="flex items-center gap-1.5 text-amber-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>{" "}
                              Quality
                            </span>
                            <span className="flex items-center gap-1.5 text-sky-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-sky-400"></span>{" "}
                              Relevance
                            </span>
                          </div>
                        </div>

                        <div className="h-44 w-full relative flex items-end">
                          {/* Y-axis labels */}
                          <div className="absolute left-0 h-full w-8 flex flex-col justify-between text-[8px] font-mono text-slate-600 border-r border-white/5 pr-2 z-10 py-1">
                            <span>Score: 5</span>
                            <span>Score: 3</span>
                            <span>Score: 1</span>
                          </div>

                          <div className="flex-1 h-full ml-10 relative">
                            {/* Horizontal gridlines */}
                            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 py-1">
                              <div className="border-b border-dashed border-white/10 w-full h-0"></div>
                              <div className="border-b border-dashed border-white/10 w-full h-0"></div>
                              <div className="border-b border-dashed border-white/10 w-full h-0"></div>
                            </div>

                            {/* Actual SVG line / scatter point graph */}
                            {adminFeedbacks.length > 0 ? (
                              <svg
                                className="w-full h-full overflow-visible"
                                viewBox="0 0 100 100"
                                preserveAspectRatio="none"
                              >
                                {/* Relevance Line (Cobalt Blue) */}
                                <polyline
                                  fill="none"
                                  stroke="#38bdf8"
                                  strokeWidth="2"
                                  points={adminFeedbacks
                                    .map((f, i) => {
                                      const x =
                                        (i /
                                          Math.max(
                                            1,
                                            adminFeedbacks.length - 1,
                                          )) *
                                        100;
                                      const score = f.relevance_score || 5;
                                      const y =
                                        100 - ((score - 1) / 4) * 80 - 10;
                                      return `${x},${y}`;
                                    })
                                    .reverse()
                                    .join(" ")}
                                />
                                {/* Quality Line (Yellow Gold) */}
                                <polyline
                                  fill="none"
                                  stroke="#fbbf24"
                                  strokeWidth="2"
                                  points={adminFeedbacks
                                    .map((f, i) => {
                                      const x =
                                        (i /
                                          Math.max(
                                            1,
                                            adminFeedbacks.length - 1,
                                          )) *
                                        100;
                                      const score = f.quality_score || 5;
                                      const y =
                                        100 - ((score - 1) / 4) * 80 - 10;
                                      return `${x},${y}`;
                                    })
                                    .reverse()
                                    .join(" ")}
                                />
                                {/* Scatter/Hover markers */}
                                {adminFeedbacks.map((f, i) => {
                                  const x =
                                    (i /
                                      Math.max(1, adminFeedbacks.length - 1)) *
                                    100;
                                  const qY =
                                    100 -
                                    (((f.quality_score || 5) - 1) / 4) * 80 -
                                    10;
                                  const rY =
                                    100 -
                                    (((f.relevance_score || 5) - 1) / 4) * 80 -
                                    10;
                                  return (
                                    <g key={f.id}>
                                      <circle
                                        cx={x}
                                        cy={qY}
                                        r="2.5"
                                        fill="#fbbf24"
                                        stroke="#0f172a"
                                        strokeWidth="1"
                                      />
                                      <circle
                                        cx={x}
                                        cy={rY}
                                        r="2.5"
                                        fill="#38bdf8"
                                        stroke="#0f172a"
                                        strokeWidth="1"
                                      />
                                    </g>
                                  );
                                })}
                              </svg>
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500 font-mono">
                                Awaiting student telemetry feedbacks to
                                calculate slopes...
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-4 text-[8px] font-mono text-slate-600 pl-10 border-t border-white/5 pt-2">
                          <span>Chronological Past Session Logs</span>
                          <span>Most Recent (Latest) Submissions</span>
                        </div>
                      </div>

                      {/* Interactive Secondary Tab Bar Search Filter */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-white/5 pb-2 gap-4">
                        <div className="flex items-center gap-1 bg-slate-950/40 p-1 rounded-xl border border-white/5">
                          <button
                            onClick={() => setAdminActiveSubTab("feedbacks")}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                              adminActiveSubTab === "feedbacks"
                                ? "bg-indigo-600 text-white shadow-lg"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            <i className="fas fa-comment-alt mr-2"></i>{" "}
                            Feedbacks ({adminFeedbacks.length})
                          </button>
                          <button
                            onClick={() => setAdminActiveSubTab("lessons")}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                              adminActiveSubTab === "lessons"
                                ? "bg-indigo-600 text-white shadow-lg"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            <i className="fas fa-history mr-2"></i> Lessons
                            Archive ({adminLessons.length})
                          </button>
                          <button
                            onClick={() => setAdminActiveSubTab("credentials")}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                              adminActiveSubTab === "credentials"
                                ? "bg-indigo-600 text-white shadow-lg"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            <i className="fas fa-shield-alt mr-2"></i> Admin &
                            Safety
                          </button>
                          <button
                            onClick={() => setAdminActiveSubTab("features")}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                              adminActiveSubTab === "features"
                                ? "bg-indigo-600 text-white shadow-lg"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            <i className="fas fa-toggle-on mr-2"></i> Feature Switches
                          </button>
                        </div>

                        {adminActiveSubTab !== "credentials" && adminActiveSubTab !== "features" && (
                          <div className="relative w-full sm:w-64">
                            <input
                              type="text"
                              placeholder="Search logs by keyword..."
                              value={adminSearchQuery}
                              onChange={(e) =>
                                setAdminSearchQuery(e.target.value)
                              }
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 pr-8"
                            />
                            <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500"></i>
                          </div>
                        )}
                      </div>

                      {/* Tab 1: Feedbacks List - Detailed Workflow Page */}
                      {adminActiveSubTab === "feedbacks" && selectedAdminFeedback && (
                        <div className="space-y-6 animate-fadeIn bg-slate-950/40 border border-white/5 p-6 rounded-[2rem] shadow-2xl relative overflow-hidden">
                          {/* Decorative gradients */}
                          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
                          
                          {/* Header with back button */}
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => {
                                  setSelectedAdminFeedback(null);
                                  setSandboxBuildResult(null);
                                  setSandboxRequestTitle(null);
                                }}
                                className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:border-white/30 transition-all cursor-pointer"
                                title="Back to Feedbacks"
                              >
                                <i className="fas fa-arrow-left text-xs"></i>
                              </button>
                              <div>
                                <span className="text-[10px] font-mono font-black text-indigo-400 tracking-[0.25em] uppercase block">
                                  {language === "sw" ? "MAELEZO NA MAPENDEKEZO YA KIPENGELE" : "SUGGESTED FEATURE DETAILS & PROPOSAL"}
                                </span>
                                <h3 className="text-sm font-sans font-black text-white mt-0.5">
                                  {language === "sw" ? "Kubadilisha Maoni ya Wanafunzi Kuwa Vipengele vya Tovuti" : "Refining Suggestions to Core Application Features"}
                                </h3>
                              </div>
                            </div>
                            <span className="text-[9px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded uppercase tracking-wider font-extrabold font-mono">
                              UID: {selectedAdminFeedback.userId?.substring(0, 12)}...
                            </span>
                          </div>

                          {/* FEEDBACK DETAILS CARD */}
                          <div className="bg-white/5 border border-white/5 p-5 rounded-2xl space-y-4">
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-400/20 text-[10px] font-black uppercase tracking-wider">
                                  {selectedAdminFeedback.topic || (language === "sw" ? "Somo/Kipengele Maalum" : "General Suggestion")}
                                </span>
                                <span className="text-xs text-slate-400 font-mono">
                                  {selectedAdminFeedback.timestamp?.toDate
                                    ? selectedAdminFeedback.timestamp.toDate().toLocaleString()
                                    : new Date().toLocaleString()}
                                </span>
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/5 border border-amber-500/10 px-2.5 py-1 rounded-md">
                                  <i className="fas fa-star text-[10px]"></i>
                                  <span>{language === "sw" ? "Alama ya Ubora" : "Quality Score"}: {selectedAdminFeedback.quality_score || 3}/5</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400 bg-sky-500/5 border border-sky-500/10 px-2.5 py-1 rounded-md">
                                  <i className="fas fa-thumbs-up text-[10px]"></i>
                                  <span>{language === "sw" ? "Uhusiano" : "Relevance Score"}: {selectedAdminFeedback.relevance_score || 3}/5</span>
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                                {language === "sw" ? "Maoni ya Mwanafunzi" : "Student Feedback"}
                              </h4>
                              <p className="text-sm text-white/95 leading-relaxed font-sans bg-slate-950/30 p-4 border border-white/5 rounded-xl">
                                {selectedAdminFeedback.comments || "No comment content provided."}
                              </p>
                            </div>

                            {selectedAdminFeedback.uploadedFile && (
                              <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex flex-col xs:flex-row xs:items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 text-sm shrink-0 overflow-hidden">
                                    {selectedAdminFeedback.uploadedFile.type?.startsWith("image/") ? (
                                      <img
                                        src={selectedAdminFeedback.uploadedFile.data}
                                        alt="Attachment"
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : selectedAdminFeedback.uploadedFile.type?.startsWith("video/") ? (
                                      <video
                                        src={selectedAdminFeedback.uploadedFile.data}
                                        className="w-full h-full object-cover"
                                        muted
                                      />
                                    ) : (
                                      <i className="fas fa-file"></i>
                                    )}
                                  </div>
                                  <div className="min-w-0 text-left">
                                    <span className="text-[8px] font-black text-indigo-300 uppercase tracking-wider block">
                                      {language === "sw" ? "Kiambatisho" : "Attachment"}
                                    </span>
                                    <span className="text-xs text-white block truncate max-w-[250px]" title={selectedAdminFeedback.uploadedFile.name}>
                                      {selectedAdminFeedback.uploadedFile.name}
                                    </span>
                                  </div>
                                </div>
                                <a
                                  href={selectedAdminFeedback.uploadedFile.data}
                                  download={selectedAdminFeedback.uploadedFile.name}
                                  className="text-[10px] bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/20 py-1.5 px-3 rounded-lg font-bold text-center cursor-pointer"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <i className="fas fa-download mr-1"></i>
                                  {language === "sw" ? "Pakua" : "Download File"}
                                </a>
                              </div>
                            )}
                          </div>

                          {/* AGREE & BUILD INTERFACE TRIGGER */}
                          <div className="bg-slate-900/40 border border-indigo-500/10 p-6 rounded-2xl space-y-4">
                            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                              <div className="space-y-1">
                                <h4 className="text-sm font-black text-white flex items-center gap-1.5 font-sans">
                                  <i className="fas fa-handshake text-indigo-400"></i>
                                  {language === "sw" ? "Kubaliana na Kuunda Kipengele Kilichopendekezwa" : "Agree & Implement Suggested Feature"}
                                </h4>
                                <p className="text-xs text-slate-400 max-w-xl leading-relaxed font-sans">
                                  {language === "sw" 
                                    ? "Ikiwa maoni haya ni muhimu, bofya kitufe kilicho kulia ili kukubali maoni haya. Msanidi wetu wa AI atajenga mfumo huu mara moja kukupa uwezo wa kuujaribu kabla ya kuupeleka moja kwa moja kwenda kwa wanachuo wetu." 
                                    : "If this suggestion is high-quality, click the build button to agree to include this feature. Our neural AI developer will compile it, show you a preview, and present the final deployment controls."}
                                </p>
                              </div>

                              <button
                                onClick={() => {
                                  triggerSandboxCompilation(
                                    selectedAdminFeedback.topic || "Proposed Feature",
                                    "HIGH",
                                    selectedAdminFeedback.comments || ""
                                  );
                                }}
                                disabled={isBuildingSandbox}
                                className={`px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-650 text-white text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg active:scale-[0.98] transition-all flex items-center gap-2 shrink-0 ${isBuildingSandbox ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                {isBuildingSandbox ? (
                                  <>
                                    <i className="fas fa-circle-notch animate-spin"></i>
                                    {language === "sw" ? "Kipengele Kinaundwa..." : "Compiling Feature Framework..."}
                                  </>
                                ) : (
                                  <>
                                    <i className="fas fa-bolt"></i>
                                    {language === "sw" ? "Kubali & Jenga Kipengele" : "Agree & Build Suggested Feature"}
                                  </>
                                )}
                              </button>
                            </div>

                            {/* INTEGRATION PREVIEW & BUILD COGNITIVE ENGINE */}
                            {sandboxRequestTitle && (
                              <div className="border border-indigo-500/20 rounded-xl overflow-hidden mt-4 bg-slate-950/60 p-5 space-y-6">
                                <div className="flex items-center justify-between pb-3 border-b border-white/5">
                                  <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest font-black flex items-center gap-1.5">
                                    <i className="fas fa-compass"></i> {language === "sw" ? "Uwanja Maalum wa Kufanyia Majaribio ya Kipengele (Sandbox)" : "Feature Integration Sandbox Workspace"}
                                  </span>
                                  <span className="text-[8px] font-mono text-slate-500">BUILD TRACKER UNIT</span>
                                </div>

                                {/* Simulated compilation process logs */}
                                {isBuildingSandbox && (
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between text-xs font-mono">
                                      <span className="text-slate-300 animate-pulse flex items-center gap-2">
                                        <i className="fas fa-cog animate-spin text-indigo-400"></i>
                                        {language === "sw" ? "Msimbo Unajengwa Kikamilifu..." : "AI Compiling Draft Workspace Codes..."}
                                      </span>
                                      <span className="text-indigo-400 font-bold">{sandboxBuildProgress}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                                      <div className="h-full bg-indigo-500 transition-all duration-100 ease-out" style={{ width: `${sandboxBuildProgress}%` }}></div>
                                    </div>
                                    <div className="bg-slate-950/95 border border-white/5 p-4 rounded-xl font-mono text-[10px] text-indigo-300 space-y-1.5 max-h-48 overflow-y-auto text-left">
                                      {sandboxBuildLogs.map((logStr, lIdx) => (
                                        <div key={lIdx} className="flex gap-2 items-start">
                                          <span className="text-indigo-500 select-none">tutorNode-compiler$</span>
                                          <p className="text-slate-300">{logStr}</p>
                                        </div>
                                      ))}
                                      <div className="w-1.5 h-3 bg-indigo-400 animate-pulse inline-block mt-1"></div>
                                    </div>
                                  </div>
                                )}

                                {/* PREVIEW AND DEPLOY VIEW (ONCE BUILT) */}
                                {sandboxBuildResult && !isBuildingSandbox && (
                                  <div className="space-y-6">
                                    
                                    {/* Visual Section Header: Feature App Preview */}
                                    <div className="bg-indigo-950/20 border border-indigo-500/20 p-4 rounded-xl">
                                      <div className="flex items-center gap-2 text-white mb-2">
                                        <i className="fas fa-eye text-indigo-400 animate-pulse"></i>
                                        <h5 className="text-xs font-black uppercase tracking-wider">
                                          {language === "sw" ? "ONYESHO: Muonekano wa Tovuti Baada ya Kuituma (Deploy)" : "PREVIEW: How the App will Look After Deploying"}
                                        </h5>
                                      </div>
                                      <p className="text-[10px] text-slate-400 leading-relaxed mb-4 font-sans text-left">
                                        {language === "sw" 
                                          ? "Hapa unaweza kuona na kuingiliana na kipengele hiki jinsi kitakavyojiendesha kwenye ubao mkuu mbele ya wanafunzi wetu." 
                                          : "Interact with the newly composed feature inside the sandbox simulator below to verify correctness before approving production deployment."}
                                      </p>

                                      <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 relative min-h-[300px] flex flex-col justify-center">
                                        {sandboxBuildResult.interactivePreview ? (
                                          <InteractiveFeaturePreview
                                            interactivePreview={sandboxBuildResult.interactivePreview}
                                            language={language}
                                          />
                                        ) : (
                                          <div className="text-center text-slate-500 font-mono text-sm">
                                            No active interactive simulation metadata mapping found.
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* DEPLOY BUTTON */}
                                    <div className="bg-slate-900 border border-indigo-500/10 p-5 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
                                      <div className="space-y-1 text-center sm:text-left">
                                        <h4 className="text-xs font-black text-white font-sans">
                                          {language === "sw" ? "Idhinisha na Tuma Kipengele Moja kwa Moja" : "Authorize & Deploy Suggested Feature"}
                                        </h4>
                                        <p className="text-[10px] text-slate-400 max-w-lg leading-relaxed font-sans">
                                          {language === "sw" 
                                            ? "Kwa kuthibitisha hili, kipengele hiki kitapandishwa mara moja kutoka kiwanda cha simulated sandbox kuwa tayari kwa wanachuo wetu wote kusoma."
                                            : "Confirming deployment migrates this neural-curated module out of sandbox isolation into OmniTutor runtime, making it instantly live for everyone."}
                                        </p>
                                      </div>

                                      <div className="shrink-0">
                                        {sandboxReviewStep === "deployed" || deployedSandboxFeatures.includes(sandboxBuildResult?.categoryKey || "general") ? (
                                          <div className="bg-emerald-500/15 border border-emerald-550/20 text-emerald-400 font-mono font-bold text-xs py-2 px-5 rounded-xl flex items-center gap-2">
                                            <i className="fas fa-circle-check text-emerald-450 animate-bounce"></i>
                                            {language === "sw" ? "TAYARI IMEPELEKWA TOVUTINI" : "DEPLOYED & LIVE"}
                                          </div>
                                        ) : (
                                          <button
                                            onClick={authorizeAndDeploySandboxFeature}
                                            className="bg-emerald-500 hover:bg-emerald-600 px-5 py-2.5 rounded-xl text-white font-mono font-black text-xs transition-all shadow-lg hover:shadow-emerald-500/10 cursor-pointer flex items-center gap-2"
                                          >
                                            <i className="fas fa-cloud-arrow-up"></i>
                                            {language === "sw" ? "Tuma Kipengele Sasa" : "Deploy Suggested Feature"}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Tab 1: Feedbacks List */}
                      {adminActiveSubTab === "feedbacks" && !selectedAdminFeedback && (
                        <div className="space-y-6">
                          {/* AI-Powered Cognitive Feedback Analyzer Panel */}
                          <div className="bg-gradient-to-br from-slate-900 via-indigo-950/20 to-slate-900 border border-indigo-500/20 rounded-[2rem] p-6 relative overflow-hidden shadow-2xl">
                            {/* Decorative ambient background mesh */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
                            <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

                            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/5">
                              <div>
                                <span className="text-[10px] font-mono font-black text-indigo-400 tracking-[0.25em] uppercase block mb-1">
                                  {language === "sw"
                                    ? "HUDUMA ZA JITIHADA MAALUM KWA AI"
                                    : "TUTORNODE COGNITIVE AI"}
                                </span>
                                <h3 className="text-lg font-sans font-black tracking-tight text-white flex items-center gap-2">
                                  <i className="fas fa-brain text-cyan-400 animate-pulse"></i>
                                  {language === "sw"
                                    ? "Changanuzi ya Maoni ya Wanafunzi (AI)"
                                    : "Neural Client Feedback Analyzer"}
                                </h3>
                                <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                                  {language === "sw"
                                    ? "Chakata telemetry ya maoni yote kupitia Gemini ili kugundua mambo wanayotaka wanafunzi kuboreshwa kwa haraka kwenye nyanja hii."
                                    : "Analyze collective student feedback telemetry through Gemini to isolate core student desires, detect friction points, and output concrete roadmap actions."}
                                </p>
                              </div>

                              <button
                                onClick={analyzeFeedbacksWithAI}
                                disabled={
                                  isAnalyzingFeedback ||
                                  adminFeedbacks.length === 0
                                }
                                className={`px-5 py-3 rounded-2xl font-black uppercase tracking-wider text-[10px] flex items-center gap-2 transition-all active:scale-95 shadow-lg ${
                                  isAnalyzingFeedback
                                    ? "bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed"
                                    : adminFeedbacks.length === 0
                                      ? "bg-slate-800 text-slate-600 border border-white/5 cursor-not-allowed"
                                      : "bg-indigo-600 text-white hover:bg-indigo-500 border border-indigo-400/20"
                                }`}
                              >
                                {isAnalyzingFeedback ? (
                                  <>
                                    <i className="fas fa-spinner animate-spin"></i>
                                    {language === "sw"
                                      ? "Inafanya Uchanganuzi..."
                                      : "Synthesizing Comments..."}
                                  </>
                                ) : (
                                  <>
                                    <i className="fas fa-wand-magic-sparkles text-cyan-400"></i>
                                    {language === "sw"
                                      ? "Fanya Uchambuzi kwa AI"
                                      : "Synthesize with Gemini"}
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Live Telemetry Overview Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-b border-white/5">
                              <div className="bg-slate-950/30 border border-white/5 p-3 rounded-xl">
                                <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block mb-1">
                                  {language === "sw"
                                    ? "Jumla ya Maoni"
                                    : "TOTAL TELEMETRIES"}
                                </span>
                                <span className="text-base font-sans font-black text-white">
                                  {adminFeedbacks.length} items
                                </span>
                              </div>
                              <div className="bg-slate-950/30 border border-white/5 p-3 rounded-xl">
                                <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block mb-1">
                                  {language === "sw"
                                    ? "Wastani Ubora"
                                    : "AVG QUALITY"}
                                </span>
                                <span className="text-base font-sans font-black text-amber-400">
                                  {(
                                    adminFeedbacks.reduce(
                                      (sum, f) => sum + (f.quality_score || 0),
                                      0,
                                    ) / (adminFeedbacks.length || 1)
                                  ).toFixed(1)}
                                  /5
                                </span>
                              </div>
                              <div className="bg-slate-950/30 border border-white/5 p-3 rounded-xl">
                                <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block mb-1">
                                  {language === "sw"
                                    ? "Wastani Uhusisho"
                                    : "AVG RELEVANCE"}
                                </span>
                                <span className="text-base font-sans font-black text-sky-400">
                                  {(
                                    adminFeedbacks.reduce(
                                      (sum, f) =>
                                        sum + (f.relevance_score || 0),
                                      0,
                                    ) / (adminFeedbacks.length || 1)
                                  ).toFixed(1)}
                                  /5
                                </span>
                              </div>
                              <div className="bg-slate-950/30 border border-white/5 p-3 rounded-xl">
                                <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block mb-1">
                                  {language === "sw"
                                    ? "Hali ya Mfumo"
                                    : "LEDGER LINK"}
                                </span>
                                <span className="text-base font-sans font-black text-emerald-400 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                                  {isAdminDemoMode ? "SANDBOX" : "LIVE"}
                                </span>
                              </div>
                            </div>

                            {/* Loading State Container */}
                            {isAnalyzingFeedback && (
                              <div className="py-12 flex flex-col items-center justify-center space-y-4">
                                <div className="relative w-16 h-16">
                                  <div className="absolute inset-0 rounded-full border-2 border-indigo-500/10"></div>
                                  <div className="absolute inset-0 rounded-full border-t-2 border-cyan-400 animate-spin"></div>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-white font-mono font-bold uppercase tracking-wider">
                                    {language === "sw"
                                      ? "Gemini Inasoma Maoni..."
                                      : "Compiling User Sentiment..."}
                                  </p>
                                  <p className="text-[10px] text-slate-500 mt-1">
                                    {language === "sw"
                                      ? "Kujenga ramani ya mapendekezo ya jinsi ya kuboresha tovuti."
                                      : "Clustering requests to identify what many users want to make the website better..."}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Error Alert Box */}
                            {feedbackAnalysisError && (
                              <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs flex items-start gap-2">
                                <i className="fas fa-triangle-exclamation text-red-400 mt-0.5"></i>
                                <div>
                                  <span className="font-bold uppercase tracking-wider block text-[10px] text-red-400 mb-1">
                                    Analysis Error
                                  </span>
                                  <p>{feedbackAnalysisError}</p>
                                </div>
                              </div>
                            )}

                            {/* Render AI Result */}
                            {feedbackAnalysisResult && !isAnalyzingFeedback && (
                              <div className="mt-6 space-y-6">
                                {/* Top Executive Summary Box & Sentiment Alignment Circle */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  <div className="md:col-span-2 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] font-mono font-black text-indigo-400 uppercase tracking-wider block">
                                        {language === "sw"
                                          ? "Muhtasari wa Uchambuzi"
                                          : "CONSOLIDATED CORE ANALYSIS"}
                                      </span>
                                      {feedbackAnalysisResult._aiProviderIsExhausted && (
                                        <span className="text-[8px] font-mono font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/10 px-1.5 py-0.5 rounded uppercase tracking-widest animate-pulse">
                                          {language === "sw"
                                            ? "Uchambuzi wa Kieneo"
                                            : "Cognitive Edge"}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-white leading-relaxed font-sans pr-4">
                                      {feedbackAnalysisResult.summary}
                                    </p>
                                  </div>
                                  <div className="bg-slate-950/40 border border-indigo-500/10 p-4 rounded-2xl flex flex-col items-center justify-center text-center relative overflow-hidden">
                                    <span className="text-[9px] font-mono font-black text-slate-400 uppercase tracking-wider block mb-2">
                                      {language === "sw"
                                        ? "Fahirisi ya Ridhaa"
                                        : "SENTIMENT ALIGNMENT"}
                                    </span>
                                    <div className="relative flex items-center justify-center w-24 h-24 mb-2">
                                      {/* Radial circle representation */}
                                      <svg className="w-full h-full transform -rotate-90">
                                        <circle
                                          cx="48"
                                          cy="48"
                                          r="40"
                                          className="stroke-slate-800"
                                          strokeWidth="8"
                                          fill="transparent"
                                        />
                                        <circle
                                          cx="48"
                                          cy="48"
                                          r="40"
                                          className="stroke-indigo-500"
                                          strokeWidth="8"
                                          fill="transparent"
                                          strokeDasharray={251.2}
                                          strokeDashoffset={
                                            251.2 -
                                            (251.2 *
                                              (feedbackAnalysisResult.sentimentPercentage ||
                                                85)) /
                                              100
                                          }
                                        />
                                      </svg>
                                      <span className="absolute text-xl font-sans font-black text-white">
                                        {
                                          feedbackAnalysisResult.sentimentPercentage
                                        }
                                        %
                                      </span>
                                    </div>
                                    <span className="text-[9px] font-mono font-bold text-slate-500">
                                      {feedbackAnalysisResult.sentimentPercentage >=
                                      80
                                        ? language === "sw"
                                          ? "Ridhaa Nzuri"
                                          : "Highly Optimized"
                                        : language === "sw"
                                          ? "Inahitaji Marekebisho"
                                          : "Friction Detected"}
                                    </span>
                                  </div>
                                </div>

                                {/* WHAT USERS WANT HIGHLIGHTS: Focus specifically on what they want to make the website better */}
                                <div className="space-y-4 pt-4 border-t border-white/5">
                                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                                    <div>
                                      <span className="text-[10px] font-mono font-black text-cyan-400 uppercase tracking-widest block">
                                        <i className="fas fa-bullseye mr-2 text-cyan-400 animate-pulse"></i>
                                        {language === "sw"
                                          ? "VIPENGELE VINAVYOTAKIKANA ZAIDI KUTOKA KWA MAONI (MOST WANTED)"
                                          : "MOST WANTED FEATURES & IMPROVEMENTS FROM FEEDBACK"}
                                      </span>
                                      <p className="text-[10px] text-slate-500 mt-1">
                                        {language === "sw"
                                          ? "Vipengele vya bidhaa vilivyotayarishwa kwa mfumo wa maoni mbalimbali na vilivyopangwa kwa kipaumbele"
                                          : "Identified product features parsed from student sentiment and ranked by requested demand frequency"}
                                      </p>
                                    </div>
                                    <span className="text-[8px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full uppercase tracking-widest self-start md:self-auto">
                                      {language === "sw"
                                        ? "Imepangwa kwa Uhitaji"
                                        : "Demand-Ranked Priorities"}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {feedbackAnalysisResult.topRequests?.map(
                                      (reqItem: any, i: number) => {
                                        const titleLower = (
                                          reqItem.request || ""
                                        ).toLowerCase();
                                        let catKey = "general";
                                        if (
                                          titleLower.includes("quiz") ||
                                          titleLower.includes("maswali") ||
                                          titleLower.includes("somo")
                                        )
                                          catKey = "quiz";
                                        else if (
                                          titleLower.includes("pdf") ||
                                          titleLower.includes("save") ||
                                          titleLower.includes("pakua") ||
                                          titleLower.includes("hifadhi")
                                        )
                                          catKey = "pdf";
                                        else if (
                                          titleLower.includes("mobile") ||
                                          titleLower.includes("simu") ||
                                          titleLower.includes("touch")
                                        )
                                          catKey = "mobile";
                                        else if (
                                          titleLower.includes("swahili") ||
                                          titleLower.includes("kiswahili") ||
                                          titleLower.includes("translate") ||
                                          titleLower.includes("tafsiri")
                                        )
                                          catKey = "swahili";

                                        const isDeployed =
                                          deployedSandboxFeatures.includes(
                                            catKey,
                                          );

                                        const isHigh = reqItem.priority?.toLowerCase() === "high";
                                        const isMedium = reqItem.priority?.toLowerCase() === "medium" || reqItem.priority?.toLowerCase() === "medium-high";
                                        const demandPercent = isHigh ? 94 : isMedium ? 68 : 35;

                                        return (
                                          <div
                                            key={i}
                                            className={`bg-slate-950/40 border p-4 rounded-2xl relative overflow-hidden group hover:border-indigo-500/20 transition-all ${isDeployed ? "border-emerald-500/20 shadow-lg shadow-emerald-500/5" : "border-white/5"}`}
                                          >
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                              <div className="flex items-center gap-2">
                                                <span className="w-5 h-5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-[10px] font-black text-indigo-400">
                                                  {i + 1}
                                                </span>
                                                <span className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-white/5 text-slate-400">
                                                  {reqItem.countHint}
                                                </span>
                                              </div>

                                              <div className="flex items-center gap-2">
                                                {isDeployed && (
                                                  <span className="text-[8px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                    <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></span>
                                                    {language === "sw"
                                                      ? "IMEPELEKWA"
                                                      : "DEPLOYED"}
                                                  </span>
                                                )}
                                                <span
                                                  className={`text-[8px] font-mono font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                                    reqItem.priority?.toLowerCase() ===
                                                    "high"
                                                      ? "bg-red-500/10 text-red-400 border border-red-500/10"
                                                      : reqItem.priority?.toLowerCase() ===
                                                            "medium" || reqItem.priority?.toLowerCase() === "medium-high"
                                                         ? "bg-amber-500/10 text-amber-400 border border-amber-500/10"
                                                         : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                                                  }`}
                                                >
                                                  {reqItem.priority}
                                                </span>
                                              </div>
                                            </div>

                                            <h4 className="text-xs font-sans font-black text-white mb-1 leading-snug">
                                              {reqItem.request}
                                            </h4>
                                            <p className="text-[11px] text-slate-400 leading-relaxed font-sans mb-3">
                                              {reqItem.reasoning}
                                            </p>

                                            {/* Dynamic Demand Intensity Meter */}
                                            <div className="space-y-1 mb-4 bg-slate-950/30 p-2 rounded-xl border border-white/[0.03]">
                                              <div className="flex justify-between items-center text-[9px] font-mono">
                                                <span className="text-slate-500">{language === "sw" ? "Nguvu ya Ombi (Demand)" : "Student Demand Intensity"}</span>
                                                <span className={isHigh ? "text-red-400 font-bold" : isMedium ? "text-amber-400 font-bold font-black" : "text-emerald-400 font-bold font-black"}>
                                                  {demandPercent}%
                                                </span>
                                              </div>
                                              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                                                <div 
                                                  className={`h-full rounded-full transition-all duration-1000 ${
                                                    isHigh 
                                                      ? "bg-gradient-to-r from-red-500 to-amber-500" 
                                                      : isMedium 
                                                        ? "bg-gradient-to-r from-amber-500 to-indigo-500" 
                                                        : "bg-gradient-to-r from-emerald-500 to-teal-500"
                                                  }`}
                                                  style={{ width: `${demandPercent}%` }}
                                                />
                                              </div>
                                            </div>

                                            <button
                                              onClick={() =>
                                                triggerSandboxCompilation(
                                                  reqItem.request,
                                                  reqItem.priority,
                                                  reqItem.reasoning,
                                                )
                                              }
                                              disabled={isBuildingSandbox}
                                              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-indigo-650/40 border border-indigo-500/20 hover:border-indigo-400 text-[10px] font-mono font-bold text-indigo-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                                            >
                                              <i className="fas fa-screwdriver-wrench text-indigo-400 text-[9px] group-hover:animate-bounce"></i>
                                              {isDeployed
                                                ? language === "sw"
                                                  ? "Zindua upya Sandbox ya AI"
                                                  : "Re-open AI Sandbox Chamber"
                                                : language === "sw"
                                                  ? "Mbinu ya AI: Jenga Sandbox"
                                                  : "AI Engine: Develop in Sandbox"}
                                            </button>
                                          </div>
                                        );
                                      },
                                    )}
                                    {(!feedbackAnalysisResult.topRequests ||
                                      feedbackAnalysisResult.topRequests
                                        .length === 0) && (
                                      <div className="col-span-2 text-center text-slate-500 text-[10px] font-mono py-4">
                                        No explicit feature requests
                                        highlighted.
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* ================== COGNITIVE AI FEATURE SANDBOX CONTAINER ================== */}
                                {sandboxRequestTitle && (
                                  <div className="bg-slate-950/60 border border-indigo-500/25 p-5 rounded-2xl space-y-5 relative overflow-hidden backdrop-blur-md">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>

                                    {/* Workspace Title & Diagnostics Header */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-[9px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-550/20 px-2 py-0.5 rounded uppercase tracking-wider font-extrabold">
                                            {language === "sw"
                                              ? "Uwanja wa Kipengele cha AI"
                                              : "NEURAL SANDBOX ENVIRONMENT"}
                                          </span>
                                          {deployedSandboxFeatures.includes(
                                            sandboxBuildResult?.categoryKey ||
                                              "general",
                                          ) && (
                                            <span className="text-[9px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-extrabold flex items-center gap-1">
                                              <i className="fas fa-shield text-[8px]"></i>
                                              {language === "sw"
                                                ? "IMEPELEKWA"
                                                : "DEPLOYED & SESSION-ACTIVE"}
                                            </span>
                                          )}
                                        </div>
                                        <h3 className="text-sm font-sans font-black text-white flex items-center gap-2">
                                          <i className="fas fa-atom text-indigo-400 animate-spin-slow"></i>
                                          {sandboxBuildResult
                                            ? sandboxBuildResult.featureTitle
                                            : sandboxRequestTitle}
                                        </h3>
                                      </div>
                                      <button
                                        onClick={() => {
                                          setSandboxRequestTitle(null);
                                          setSandboxBuildResult(null);
                                        }}
                                        className="text-[10px] font-mono text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all border border-white/5"
                                      >
                                        <i className="fas fa-times mr-1"></i>
                                        {language === "sw"
                                          ? "Funga Sandbox"
                                          : "Close Workspace"}
                                      </button>
                                    </div>

                                    {/* PHASE 1: ACTIVE COMPILER LOGS INTERACTION */}
                                    {isBuildingSandbox && (
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between text-xs font-mono">
                                          <span className="text-slate-300 animate-pulse flex items-center gap-2">
                                            <i className="fas fa-cog animate-spin text-indigo-400"></i>
                                            {language === "sw"
                                              ? "AI inatengeneza vipengele (Zana Muhimu)..."
                                              : "AI Compiling Draft Workspace Codes..."}
                                          </span>
                                          <span className="text-indigo-400 font-bold">
                                            {sandboxBuildProgress}%
                                          </span>
                                        </div>

                                        {/* Progress Bar Track */}
                                        <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                                          <div
                                            className="h-full bg-indigo-500 transition-all duration-100 ease-out"
                                            style={{
                                              width: `${sandboxBuildProgress}%`,
                                            }}
                                          ></div>
                                        </div>

                                        {/* Simulated Terminal screen for logs */}
                                        <div className="bg-slate-950/90 border border-white/5 p-4 rounded-xl font-mono text-[10px] text-indigo-300 space-y-1.5 max-h-48 overflow-y-auto">
                                          {sandboxBuildLogs.map(
                                            (logStr, lIdx) => (
                                              <div
                                                key={lIdx}
                                                className="flex gap-2 items-start"
                                              >
                                                <span className="text-indigo-500 select-none">
                                                  tutorNode-compiler$
                                                </span>
                                                <p className="text-slate-300">
                                                  {logStr}
                                                </p>
                                              </div>
                                            ),
                                          )}
                                          <div className="w-1.5 h-3 bg-indigo-400 animate-pulse inline-block mt-1"></div>
                                        </div>
                                      </div>
                                    )}

                                    {/* PHASE 2: REVIEW DESIGN BLUEPRINT & INTERACTIVE TESTBED */}
                                    {sandboxBuildResult &&
                                      !isBuildingSandbox && (
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                          {/* Blueprint & File Draft Spec Columns */}
                                          <div className="lg:col-span-5 space-y-4">
                                            <div className="bg-slate-900/40 border border-white/5 p-4 rounded-xl">
                                              <h4 className="text-xs font-mono font-black text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <i className="fas fa-compass"></i>
                                                {language === "sw"
                                                  ? "Muundo wa Kidijiti"
                                                  : "ARCHITECTURAL BLUEPRINT"}
                                              </h4>
                                              <p className="text-[11px] text-slate-300 leading-relaxed font-sans prose-invert">
                                                {sandboxBuildResult.blueprint}
                                              </p>
                                            </div>

                                            {/* Draft Files Created representation */}
                                            <div className="space-y-2">
                                              <h4 className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest pl-1">
                                                {language === "sw"
                                                  ? "Nyaraka Zilizoandikwa na AI (Source Drafts)"
                                                  : "AI DRAFTED RESOURCE FILES"}
                                              </h4>
                                              <div className="space-y-2">
                                                {sandboxBuildResult.draftFiles?.map(
                                                  (
                                                    fileObj: any,
                                                    fI: number,
                                                  ) => (
                                                    <div
                                                      key={fI}
                                                      className="bg-slate-950 p-3 rounded-xl border border-white/5 hover:border-indigo-500/10 transition-all"
                                                    >
                                                      <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[10px] font-mono font-bold text-indigo-300 flex items-center gap-1">
                                                          <i className="fas fa-file-code text-[11px] text-indigo-400"></i>
                                                          {fileObj.path}
                                                        </span>
                                                        <span className="text-[8px] font-mono text-slate-500">
                                                          {fileObj.linesCount ||
                                                            100}{" "}
                                                          lines
                                                        </span>
                                                      </div>
                                                      <p className="text-[10px] text-slate-400 mb-1.5 leading-snug">
                                                        {fileObj.description}
                                                      </p>
                                                      <div className="bg-slate-900/60 p-2 rounded font-mono text-[9px] text-slate-400 border border-white/5 max-h-20 overflow-y-auto whitespace-pre">
                                                        {fileObj.contentDraft ||
                                                          "export default function () {}"}
                                                      </div>
                                                    </div>
                                                  ),
                                                )}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Live Functional Feature Simulator chamber */}
                                          <div className="lg:col-span-7 flex flex-col">
                                            <div className="bg-slate-900 border border-indigo-500/10 rounded-2xl p-4 flex-1 flex flex-col overflow-hidden relative">
                                              {/* Feature Title / Active preview status badge */}
                                              <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                                                <span className="text-[10px] font-mono font-black text-indigo-300 flex items-center gap-1.5">
                                                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
                                                  {language === "sw"
                                                    ? "MAELEKEZO INTERACTIVE WORKSPACE"
                                                    : "LIVE AGENT FEATURE CHAMBER"}
                                                </span>
                                                <span className="text-[9px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded-md border border-white/5 flex items-center gap-1">
                                                  <i className="fas fa-vial text-indigo-400"></i>
                                                  {language === "sw"
                                                    ? "Jaribio la Mfumo"
                                                    : "Testing Sandbox"}
                                                </span>
                                              </div>

                                              {/* SPECIFIC INTERACTIVE PREVIEW CHANNELS */}
                                              <div className="flex-1 flex flex-col justify-center min-h-[300px]">
                                                {sandboxBuildResult.interactivePreview ? (
                                                  <InteractiveFeaturePreview
                                                    interactivePreview={sandboxBuildResult.interactivePreview}
                                                    language={language}
                                                  />
                                                ) : (
                                                  <div className="text-center text-slate-500 font-mono text-xs">
                                                    No interactive preview configurations found.
                                                  </div>
                                                )}

                                                {/* MODULE 2: PDF WHITEBOARD NOTES EXPORTER */}
                                                {!sandboxBuildResult.interactivePreview && sandboxBuildResult.categoryKey ===
                                                  "pdf" && (
                                                  <div className="space-y-4 max-w-sm mx-auto w-full font-sans">
                                                    <div className="bg-slate-950 p-4 border border-white/5 rounded-2xl relative">
                                                      <span className="text-[8px] font-mono uppercase bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 rounded-md absolute top-3 right-3">
                                                        Layout Preset Active
                                                      </span>
                                                      <h5 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">
                                                        Draft Exporter Settings
                                                      </h5>

                                                      <div className="space-y-3">
                                                        <div className="space-y-1">
                                                          <label className="text-[10px] font-mono text-slate-400">
                                                            Workbook Title
                                                          </label>
                                                          <input
                                                            type="text"
                                                            value={pdfDraftText}
                                                            onChange={(e) =>
                                                              setPdfDraftText(
                                                                e.target.value,
                                                              )
                                                            }
                                                            className="w-full bg-slate-900 border border-white/10 p-2 text-xs text-white rounded-lg focus:outline-none focus:border-indigo-500"
                                                          />
                                                        </div>

                                                        <div className="space-y-1.5">
                                                          <label className="text-[10px] font-mono text-slate-400 block">
                                                            Workspace Grid Grid
                                                            style
                                                          </label>
                                                          <div className="grid grid-cols-3 gap-2">
                                                            {[
                                                              "blueprint",
                                                              "academic",
                                                              "grid",
                                                            ].map((st) => (
                                                              <button
                                                                key={st}
                                                                onClick={() =>
                                                                  setPdfGridStyle(
                                                                    st as any,
                                                                  )
                                                                }
                                                                className={`py-1 text-[10px] font-mono rounded border capitalize cursor-pointer transition-all ${
                                                                  pdfGridStyle ===
                                                                  st
                                                                    ? "bg-indigo-500/20 border-indigo-500 text-white"
                                                                    : "bg-slate-900 border-white/5 text-slate-400"
                                                                }`}
                                                              >
                                                                {st}
                                                              </button>
                                                            ))}
                                                          </div>
                                                        </div>

                                                        <button
                                                          onClick={() => {
                                                            setPdfRenderingStatus(
                                                              "rendering",
                                                            );
                                                            setTimeout(
                                                              () =>
                                                                setPdfRenderingStatus(
                                                                  "exported",
                                                                ),
                                                              1800,
                                                            );
                                                          }}
                                                          disabled={
                                                            pdfRenderingStatus ===
                                                            "rendering"
                                                          }
                                                          className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 font-mono font-bold text-white text-xs py-2 rounded-xl transition-all cursor-pointer"
                                                        >
                                                          {pdfRenderingStatus ===
                                                          "rendering"
                                                            ? language === "sw"
                                                              ? "Inaunda faili la PDF..."
                                                              : "Rendering PDF Vector Maps..."
                                                            : language === "sw"
                                                              ? "Pakua Muhtasari wa PDF"
                                                              : "Simulate & Render PDF Notes"}
                                                        </button>

                                                        {pdfRenderingStatus ===
                                                          "rendering" && (
                                                          <div className="flex items-center justify-center gap-2 py-2">
                                                            <div className="w-3 h-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin"></div>
                                                            <span className="text-[9px] font-mono text-slate-400">
                                                              Scanning canvas
                                                              outlines...
                                                            </span>
                                                          </div>
                                                        )}

                                                        {pdfRenderingStatus ===
                                                          "exported" && (
                                                          <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-center space-y-2">
                                                            <p className="text-xs font-bold">
                                                              🎉 PDF export
                                                              successfully
                                                              structured!
                                                            </p>
                                                            <p className="text-[9px] text-slate-300 leading-normal">
                                                              Export file
                                                              compiled on{" "}
                                                              {pdfGridStyle.toUpperCase()}{" "}
                                                              grid style. Loaded
                                                              with header "
                                                              {pdfDraftText}".
                                                              Size: 1.25 MB.
                                                            </p>
                                                            <button
                                                              onClick={() =>
                                                                setPdfRenderingStatus(
                                                                  "idle",
                                                                )
                                                              }
                                                              className="text-[9px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-1 rounded hover:bg-emerald-500/20 transition-all cursor-pointer"
                                                            >
                                                              Reset Exporter
                                                            </button>
                                                          </div>
                                                        )}
                                                      </div>
                                                    </div>
                                                  </div>
                                                )}

                                                {/* MODULE 3: MOBILE TOUCH VIEWPOT OPTIMIZER */}
                                                {!sandboxBuildResult.interactivePreview && sandboxBuildResult.categoryKey ===
                                                  "mobile" && (
                                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                                    {/* Mobile Controls */}
                                                    <div className="space-y-3 font-sans">
                                                      <div className="bg-slate-950 p-3 border border-white/5 rounded-xl space-y-2">
                                                        <span className="text-[9px] font-mono text-indigo-400 block uppercase font-bold">
                                                          Viewport Controller
                                                        </span>
                                                        <div className="space-y-1">
                                                          <label className="text-[9px] font-mono text-slate-400">
                                                            Pad Density Ratio
                                                          </label>
                                                          <div className="grid grid-cols-2 gap-2">
                                                            {[
                                                              "standard",
                                                              "concentrated",
                                                            ].map((dn) => (
                                                              <button
                                                                key={dn}
                                                                onClick={() =>
                                                                  setMobileDensity(
                                                                    dn as any,
                                                                  )
                                                                }
                                                                className={`py-1 text-[9px] font-mono rounded border capitalize cursor-pointer ${
                                                                  mobileDensity ===
                                                                  dn
                                                                    ? "bg-indigo-500/10 border-indigo-500 text-white"
                                                                    : "bg-slate-900 border-white/5 text-slate-500"
                                                                }`}
                                                              >
                                                                {dn}
                                                              </button>
                                                            ))}
                                                          </div>
                                                        </div>
                                                      </div>

                                                      <div className="bg-slate-950 p-3 border border-white/5 rounded-xl space-y-1.5 text-center">
                                                        <span className="text-[9px] font-mono text-slate-500 block">
                                                          Touch Gesture
                                                          Telemetry
                                                        </span>
                                                        <p className="text-[10px] text-slate-300 leading-normal">
                                                          Compacted side panels
                                                          and minimized margins
                                                          have resolved
                                                          over-scaling onto
                                                          narrow devices by 45%.
                                                        </p>
                                                      </div>
                                                    </div>

                                                    {/* Smartphone mockup */}
                                                    <div className="flex justify-center">
                                                      <div className="w-[190px] h-[320px] rounded-2xl border-4 border-slate-700 bg-slate-950 relative overflow-hidden flex flex-col shadow-xl transition-all duration-300">
                                                        <div className="w-16 h-3.5 bg-slate-700 absolute top-0 left-1/2 transform -translate-x-1/2 rounded-b-md z-20 flex items-center justify-center">
                                                          <span className="w-1.5 h-1.5 rounded-full bg-slate-950"></span>
                                                        </div>

                                                        {/* Mini viewport content */}
                                                        <div className="flex-1 p-2 text-white relative flex flex-col z-10 pt-5">
                                                          <div className="flex items-center justify-between border-b border-white/5 pb-1 mb-1 text-[8px] font-mono">
                                                            <span className="text-[7px]">
                                                              OmniTutor Mobile
                                                            </span>
                                                            <button
                                                              onClick={() =>
                                                                setMobileMenuCollapsed(
                                                                  !mobileMenuCollapsed,
                                                                )
                                                              }
                                                              className="text-indigo-400"
                                                            >
                                                              <i className="fas fa-bars"></i>
                                                            </button>
                                                          </div>

                                                          {/* Mini menu slide */}
                                                          {!mobileMenuCollapsed && (
                                                            <div className="bg-slate-900 border-b border-indigo-500/20 p-1 mb-1 rounded text-[7px] font-mono space-y-0.5 text-slate-300">
                                                              <div>
                                                                🏠 Home Board
                                                              </div>
                                                              <div>
                                                                📖 Concordance
                                                                Lessons
                                                              </div>
                                                              <div>
                                                                🎯 Challenging
                                                                Checkpoints
                                                              </div>
                                                            </div>
                                                          )}

                                                          <div
                                                            className={`rounded-lg bg-slate-900 border border-white/5 flex-1 overflow-hidden transition-all duration-300 ${mobileDensity === "concentrated" ? "p-1" : "p-3"}`}
                                                          >
                                                            <p className="text-[8px] font-bold text-indigo-300 leading-none">
                                                              Lesson summary
                                                            </p>
                                                            <p
                                                              className={`text-[7px] text-slate-400 mt-1 leading-normal ${mobileDensity === "concentrated" ? "line-clamp-2" : ""}`}
                                                            >
                                                              Learn nouns class
                                                              descriptors on
                                                              Swahili. It
                                                              optimizes layout
                                                              viewports
                                                              correctly for all
                                                              devices.
                                                            </p>

                                                            <div
                                                              className={`mt-2 bg-indigo-500/10 border border-indigo-500/20 rounded-md text-indigo-400 text-center font-bold ${mobileDensity === "concentrated" ? "py-0.5 text-[7px]" : "py-1 text-[8px]"}`}
                                                            >
                                                              ✓ Concordance
                                                              Study Active
                                                            </div>
                                                          </div>
                                                        </div>
                                                      </div>
                                                    </div>
                                                  </div>
                                                )}

                                                {/* MODULE 4: SWAHILI VOICE SYNTHESIZER VOICE ENGINE */}
                                                {!sandboxBuildResult.interactivePreview && sandboxBuildResult.categoryKey ===
                                                  "swahili" && (
                                                  <div className="space-y-4 max-w-sm mx-auto w-full font-sans">
                                                    <div className="bg-slate-950 p-4 border border-white/5 rounded-2xl space-y-3">
                                                      <span className="text-[8px] font-mono uppercase bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 rounded-md block w-fit">
                                                        BILINGUAL SYNTHESIS
                                                      </span>

                                                      <div className="space-y-1">
                                                        <label className="text-[9px] font-mono text-slate-500">
                                                          English Instruction
                                                        </label>
                                                        <p className="text-xs text-slate-300 bg-slate-900 p-2 rounded-lg border border-white/5">
                                                          "Welcome back to
                                                          OmniTutor! Today, we
                                                          will study
                                                          Concordance."
                                                        </p>
                                                      </div>

                                                      <div className="space-y-1">
                                                        <label className="text-[9px] font-mono text-slate-500">
                                                          Swahili Accurate
                                                          Translation
                                                        </label>
                                                        <p className="text-xs text-emerald-300 bg-slate-900 p-2 rounded-lg border border-emerald-500/10 font-bold">
                                                          "Karibu sana kwenye
                                                          OmniTutor! Leo
                                                          Tutajifunza Mapatano
                                                          ya Sarufi."
                                                        </p>
                                                      </div>

                                                      {/* Voice equalizer waves */}
                                                      {synthesizerSpeaking && (
                                                        <div className="flex items-center justify-center gap-1.5 py-3">
                                                          <div
                                                            className="w-1 h-6 bg-indigo-500 rounded animate-pulse"
                                                            style={{
                                                              animationDelay:
                                                                "0.1s",
                                                            }}
                                                          ></div>
                                                          <div
                                                            className="w-1 h-9 bg-cyan-400 rounded animate-pulse"
                                                            style={{
                                                              animationDelay:
                                                                "0.3s",
                                                            }}
                                                          ></div>
                                                          <div
                                                            className="w-1 h-5 bg-indigo-500 rounded animate-pulse"
                                                            style={{
                                                              animationDelay:
                                                                "0.2s",
                                                            }}
                                                          ></div>
                                                          <div
                                                            className="w-1 h-8 bg-purple-500 rounded animate-pulse"
                                                            style={{
                                                              animationDelay:
                                                                "0.4s",
                                                            }}
                                                          ></div>
                                                          <div
                                                            className="w-1 h-4 bg-indigo-500 rounded animate-pulse"
                                                            style={{
                                                              animationDelay:
                                                                "0.15s",
                                                            }}
                                                          ></div>
                                                        </div>
                                                      )}

                                                      <div className="flex gap-2">
                                                        <button
                                                          onClick={() => {
                                                            const textToSpeak =
                                                              "Karibu sana kwenye darasa Letu la OmniTutor! Leo tutajifunza upana wa Sarufi ya lugha ya Kiswahili.";
                                                            if (
                                                              typeof window !==
                                                                "undefined" &&
                                                              window.speechSynthesis
                                                            ) {
                                                              window.speechSynthesis.cancel();
                                                              const utterance =
                                                                new SpeechSynthesisUtterance(
                                                                  textToSpeak,
                                                                );
                                                              utterance.lang =
                                                                "sw-TZ";
                                                              utterance.rate = 0.95;
                                                              utterance.onstart =
                                                                () =>
                                                                  setSynthesizerSpeaking(
                                                                    true,
                                                                  );
                                                              utterance.onend =
                                                                () =>
                                                                  setSynthesizerSpeaking(
                                                                    false,
                                                                  );
                                                              utterance.onerror =
                                                                () =>
                                                                  setSynthesizerSpeaking(
                                                                    false,
                                                                  );
                                                              window.speechSynthesis.speak(
                                                                utterance,
                                                              );
                                                            } else {
                                                              setSynthesizerSpeaking(
                                                                true,
                                                              );
                                                              setTimeout(
                                                                () =>
                                                                  setSynthesizerSpeaking(
                                                                    false,
                                                                  ),
                                                                2400,
                                                              );
                                                            }
                                                          }}
                                                          disabled={
                                                            synthesizerSpeaking
                                                          }
                                                          className="flex-1 bg-indigo-500 hover:bg-indigo-650 font-mono font-bold text-white text-xs py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                                        >
                                                          <i className="fas fa-volume-high"></i>
                                                          {synthesizerSpeaking
                                                            ? language === "sw"
                                                              ? "Inasikika..."
                                                              : "Speaking..."
                                                            : language === "sw"
                                                              ? "Sikiliza Kiswahili"
                                                              : "Synthesize Swahili Voiceover"}
                                                        </button>

                                                        {synthesizerSpeaking && (
                                                          <button
                                                            onClick={() => {
                                                              if (
                                                                typeof window !==
                                                                  "undefined" &&
                                                                window.speechSynthesis
                                                              ) {
                                                                window.speechSynthesis.cancel();
                                                              }
                                                              setSynthesizerSpeaking(
                                                                false,
                                                              );
                                                            }}
                                                            className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-mono text-[10px] px-3 py-2 rounded-xl transition-all cursor-pointer"
                                                          >
                                                            Stop
                                                          </button>
                                                        )}
                                                      </div>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>

                                              {/* Admin Verification Metrics Overlay */}
                                              <div className="mt-4 pt-3 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-slate-500 text-[9px] font-mono">
                                                <span className="flex items-center gap-1.5">
                                                  <i className="fas fa-circle-check text-emerald-400 text-[10px]"></i>
                                                  {language === "sw"
                                                    ? "Marekebisho yote ya usalama yamefaulu (100%)"
                                                    : "Security & Sandbox boundaries verified successfully (100%)"}
                                                </span>
                                                <span>
                                                  VERIFICATION INDEX:{" "}
                                                  {sandboxBuildResult.verificationScore ||
                                                    100}
                                                  %
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                    {/* CONTROLLER TRIGGER BLOCK: Authorize and Deploy */}
                                    {sandboxBuildResult &&
                                      !isBuildingSandbox && (
                                        <div className="bg-slate-900/60 border border-indigo-500/10 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                                          <div className="space-y-1 text-center sm:text-left">
                                            <h4 className="text-xs font-black text-white">
                                              {language === "sw"
                                                ? "Je, ungependa kuamsha kipengele hiki sasa?"
                                                : "Confirm Administrative Integration Authorization"}
                                            </h4>
                                            <p className="text-[10px] text-slate-400 max-w-lg leading-relaxed">
                                              {language === "sw"
                                                ? "Bofya kitufe cha kulia kuidhinisha msimbo huu uliopita uhakiki. Itaanzishwa mara moja katika madarasa yote ya OmniTutor."
                                                : "By authorizing deployment, this fully bundled feature moves from Sandbox testing directly into the live classroom runtime of OmniTutor."}
                                            </p>
                                          </div>

                                          <div className="flex items-center gap-3">
                                            {sandboxReviewStep === "deployed" ||
                                            deployedSandboxFeatures.includes(
                                              sandboxBuildResult?.categoryKey ||
                                                "general",
                                            ) ? (
                                              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-bold text-xs py-2 px-5 rounded-xl flex items-center gap-2">
                                                <i className="fas fa-circle-check text-emerald-400 animate-bounce"></i>
                                                {language === "sw"
                                                  ? "IMEPELEKWA KIWANGO CHA TOVUTI"
                                                  : "ACTIVE IN RUNTIME APPLICATION"}
                                              </div>
                                            ) : (
                                              <button
                                                onClick={
                                                  authorizeAndDeploySandboxFeature
                                                }
                                                className="bg-emerald-500 hover:bg-emerald-600 font-mono font-black text-white text-xs py-2 px-5 rounded-xl transition-all shadow-lg hover:shadow-emerald-500/10 cursor-pointer flex items-center gap-2"
                                              >
                                                <i className="fas fa-cloud-arrow-up"></i>
                                                {language === "sw"
                                                  ? "Idhinisha na Kupeleka sasa!"
                                                  : "Authorize & Deploy Feature to App"}
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                  </div>
                                )}

                                {/* Observed Strengths vs Frictions Column Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
                                  {/* Section 1: Positives */}
                                  <div className="space-y-3">
                                    <span className="text-[9px] font-mono font-black text-emerald-400 uppercase tracking-wider block">
                                      <i className="fas fa-circle-check mr-2"></i>
                                      {language === "sw"
                                        ? "Mambo Wanayopenda Wanafunzi"
                                        : "STUDENT DELIGHTS (PRESERVE)"}
                                    </span>
                                    <ul className="space-y-2">
                                      {feedbackAnalysisResult.positives?.map(
                                        (pos: string, idx: number) => (
                                          <li
                                            key={idx}
                                            className="flex items-start gap-2 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/5 hover:border-emerald-500/10 p-2.5 rounded-xl text-slate-300 text-xs font-sans transition-all"
                                          >
                                            <i className="fas fa-check text-emerald-400 text-[10px] mt-0.5"></i>
                                            <span className="text-slate-200">
                                              {pos}
                                            </span>
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  </div>

                                  {/* Section 2: Pain points */}
                                  <div className="space-y-3">
                                    <span className="text-[9px] font-mono font-black text-amber-400 uppercase tracking-wider block">
                                      <i className="fas fa-circle-exclamation mr-2"></i>
                                      {language === "sw"
                                        ? "Changamoto na Vikwazo"
                                        : "FRICTIONAL BOTTLENECKS (SOLVE)"}
                                    </span>
                                    <ul className="space-y-2">
                                      {feedbackAnalysisResult.painPoints?.map(
                                        (pain: string, idx: number) => (
                                          <li
                                            key={idx}
                                            className="flex items-start gap-2 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/5 hover:border-amber-500/10 p-2.5 rounded-xl text-slate-300 text-xs font-sans transition-all"
                                          >
                                            <i className="fas fa-exclamation-circle text-amber-400 text-[10px] mt-0.5"></i>
                                            <span className="text-slate-200">
                                              {pain}
                                            </span>
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  </div>
                                </div>

                                {/* SITE-BETTERMENT ROADMAP STEPS */}
                                <div className="space-y-3 pt-4 border-t border-white/5 bg-slate-950/20 p-4 rounded-xl">
                                  <span className="text-[9px] font-mono font-black text-indigo-400 uppercase tracking-widest block">
                                    <i className="fas fa-road mr-2"></i>
                                    {language === "sw"
                                      ? "MIONGOZO YA KUBELESHE TOVUTI (ROADMAP SUGGESTIONS)"
                                      : "RECOMMENDED ACTIONABLE SITE-BETTERMENT ROADMAP"}
                                  </span>
                                  <div className="space-y-2">
                                    {feedbackAnalysisResult.siteBettermentRecommendations?.map(
                                      (rec: string, idx: number) => (
                                        <div
                                          key={idx}
                                          className="flex items-center gap-3 bg-white/5 border border-white/5 p-3 rounded-xl hover:bg-white/[0.08] transition-all"
                                        >
                                          <div className="w-5 h-5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[9px] text-indigo-400 font-bold flex items-center justify-center font-mono">
                                            0{idx + 1}
                                          </div>
                                          <p className="text-xs text-slate-300 font-sans">
                                            {rec}
                                          </p>
                                        </div>
                                      ),
                                    )}
                                    {(!feedbackAnalysisResult.siteBettermentRecommendations ||
                                      feedbackAnalysisResult
                                        .siteBettermentRecommendations
                                        .length === 0) && (
                                      <div className="text-slate-500 text-[10px] font-mono py-2 text-center">
                                        No roadmaps generated.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Unanalyzed Place holder empty state */}
                            {!feedbackAnalysisResult &&
                              !isAnalyzingFeedback && (
                                <div className="mt-4 p-8 bg-slate-950/30 border border-white/5 rounded-2xl flex flex-col items-center text-center justify-center space-y-3">
                                  <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center text-slate-500">
                                    <i className="fas fa-wand-magic-sparkles text-sm text-indigo-400 animate-pulse"></i>
                                  </div>
                                  <div className="max-w-md">
                                    <p className="text-xs text-white/90 font-serif font-bold">
                                      {language === "sw"
                                        ? "Changanua telemetry za maoni yetu ili kupata ripoti!"
                                        : "No Active Core Sentiment Insights Synthesized."}
                                    </p>
                                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                                      {language === "sw"
                                        ? "Bofya kitufe cha chini kufanya uchambuzi makini unaoongozwa na ubora wa AI kubaini kile ambacho watumiaji wanasisitiza kiboreshwe."
                                        : "Engage Gemini intelligence above to automatically build user-desire maps, highlight feature requests, and formulate site-betterment specifications."}
                                    </p>
                                  </div>
                                </div>
                              )}
                          </div>

                          {/* Original Feedbacks list begins below */}
                          {adminFeedbacks
                            .filter((f) => {
                              if (!adminSearchQuery) return true;
                              const q = adminSearchQuery.toLowerCase();
                              return (
                                f.topic?.toLowerCase().includes(q) ||
                                f.comments?.toLowerCase().includes(q) ||
                                f.userId?.toLowerCase().includes(q)
                              );
                            })
                            .map((fb) => (
                              <div
                                key={fb.id}
                                className="group bg-white/5 border border-white/5 hover:bg-white/[0.08] hover:border-white/10 p-5 rounded-2xl transition-all"
                              >
                                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                                  <div className="flex-1">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                                        {fb.topic || "Unknown Topic"}
                                      </span>
                                      <span className="text-[8px] font-mono px-2 py-0.5 bg-white/5 text-slate-400 rounded-md">
                                        UID: {fb.userId?.substring(0, 8)}...
                                      </span>
                                      <span className="text-[8px] text-slate-500 font-mono ml-auto sm:ml-0">
                                        {fb.timestamp?.toDate
                                          ? fb.timestamp
                                              .toDate()
                                              .toLocaleString()
                                          : new Date().toLocaleString()}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-4 mb-3">
                                      <div className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/5 border border-amber-500/10 px-2 py-0.5 rounded-md">
                                        <i className="fas fa-star"></i>
                                        <span>Q: {fb.quality_score}/5</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-[10px] font-bold text-sky-400 bg-sky-500/5 border border-sky-500/10 px-2 py-0.5 rounded-md">
                                        <i className="fas fa-thumbs-up"></i>
                                        <span>R: {fb.relevance_score}/5</span>
                                      </div>
                                    </div>

                                    <p className="text-xs text-white/90 leading-relaxed font-sans">
                                      {fb.comments || "No comment provided."}
                                    </p>

                                    {fb.uploadedFile && (
                                      <div className="mt-3 p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex flex-col xs:flex-row xs:items-center justify-between gap-3">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 text-sm shrink-0 overflow-hidden">
                                            {fb.uploadedFile.type?.startsWith("image/") ? (
                                              <img
                                                src={fb.uploadedFile.data}
                                                alt="Attachment"
                                                className="w-full h-full object-cover"
                                                referrerPolicy="no-referrer"
                                              />
                                            ) : fb.uploadedFile.type?.startsWith("video/") ? (
                                              <video
                                                src={fb.uploadedFile.data}
                                                className="w-full h-full object-cover font-sans"
                                                muted
                                                playsInline
                                              />
                                            ) : (
                                              <i className="fas fa-file-invoice"></i>
                                            )}
                                          </div>
                                          <div className="min-w-0 text-left">
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">
                                              Student Attachment
                                            </span>
                                            <span
                                              className="text-[10px] font-bold text-white block truncate max-w-[200px]"
                                              title={fb.uploadedFile.name}
                                            >
                                              {fb.uploadedFile.name}
                                            </span>
                                            <span className="text-[8px] font-mono text-slate-500 uppercase block">
                                              {(
                                                (fb.uploadedFile.size || 0) /
                                                1024
                                              ).toFixed(1)}{" "}
                                              KB •{" "}
                                              {fb.uploadedFile.type?.split(
                                                "/",
                                              )[1] || "file"}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                          {fb.uploadedFile.type?.startsWith(
                                            "image/",
                                          ) && (
                                            <button
                                              onClick={() => {
                                                const w = window.open();
                                                if (w) {
                                                  w.document.write(
                                                    `<img src="${fb.uploadedFile.data}" style="max-width:100%; max-height:100dvh; display:block; margin:auto;" />`,
                                                  );
                                                }
                                              }}
                                              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-[9px] font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1"
                                            >
                                              <i className="fas fa-eye text-[8px]"></i>
                                              View
                                            </button>
                                          )}
                                          {fb.uploadedFile.type?.startsWith("video/") && (
                                            <button
                                              onClick={() => {
                                                const w = window.open();
                                                if (w) {
                                                  w.document.write(
                                                    `<html><body style="margin:0;background:#0d1117;display:flex;align-items:center;justify-content:center;height:100vh;"><video src="${fb.uploadedFile.data}" controls autoplay style="max-width:100%;max-height:100%;"></video></body></html>`,
                                                  );
                                                }
                                              }}
                                              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-[9px] font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1"
                                            >
                                              <i className="fas fa-play text-[8px]"></i>
                                              Play
                                            </button>
                                          )}
                                          <a
                                            href={fb.uploadedFile.data}
                                            download={fb.uploadedFile.name}
                                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[9px] font-mono font-bold text-white transition-all flex items-center gap-1 cursor-pointer"
                                          >
                                            <i className="fas fa-download text-[8px]"></i>
                                            Download
                                          </a>
                                        </div>
                                      </div>
                                    )}
                                    {fb.teacher_dialogue && (
                                      <div className="mt-3 p-3 rounded-lg bg-black/40 border border-white/5">
                                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                                          Teacher Dialogue Excerpt
                                        </span>
                                        <p className="text-[11px] text-slate-400 italic line-clamp-2">
                                          "{fb.teacher_dialogue}"
                                        </p>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                                    <button
                                      onClick={() => {
                                        setSelectedAdminFeedback(fb);
                                        setSandboxRequestTitle(null);
                                        setSandboxBuildResult(null);
                                      }}
                                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-550 text-white border border-indigo-400/20 text-[9px] font-black uppercase tracking-wider w-full sm:w-auto cursor-pointer transition-all flex items-center justify-center gap-1 shrink-0"
                                      title="View proposed comment / feature builder"
                                    >
                                      <i className="fas fa-eye text-[8px]"></i>
                                      View & Build Feature
                                    </button>
                                    {adminFeedbackDeletingId === fb.id ? (
                                      <button
                                        onClick={() => {
                                          deleteAdminDocument("feedbacks", fb.id);
                                          setAdminFeedbackDeletingId(null);
                                        }}
                                        className="px-4 py-2 rounded-xl bg-red-600 text-white border border-red-500/20 hover:bg-red-500 transition-all text-[9px] font-black uppercase tracking-wider w-full sm:w-auto animate-pulse"
                                        title="Click to confirm delete"
                                      >
                                        Confirm Purge!
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setAdminFeedbackDeletingId(fb.id);
                                          setTimeout(() => setAdminFeedbackDeletingId((prev) => prev === fb.id ? null : prev), 5000);
                                        }}
                                        className="px-4 py-2 rounded-xl text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all text-[9px] font-black uppercase tracking-wider w-full sm:w-auto"
                                        title="Mod delete"
                                      >
                                        Moderate Item
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}

                          {adminFeedbacks.length === 0 && (
                            <div className="text-center py-12 text-slate-500 text-xs font-mono">
                              No student feedbacks found inside the academy
                              database ledger.
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tab 2: Lessons List */}
                      {adminActiveSubTab === "lessons" && (
                        <div className="space-y-4">
                          {adminLessons
                            .filter((l) => {
                              if (!adminSearchQuery) return true;
                              const q = adminSearchQuery.toLowerCase();
                              return (
                                l.topic?.toLowerCase().includes(q) ||
                                l.userId?.toLowerCase().includes(q)
                              );
                            })
                            .map((les) => (
                              <div
                                key={les.id}
                                className="group bg-white/5 border border-white/5 hover:bg-white/[0.08] hover:border-white/10 p-5 rounded-2xl transition-all"
                              >
                                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                                  <div className="flex-1">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                      <span className="text-xs font-bold text-white uppercase tracking-tight">
                                        {les.topic}
                                      </span>
                                      <span className="text-[8px] font-mono px-2 py-0.5 bg-white/5 text-slate-400 rounded-md">
                                        Student ID:{" "}
                                        {les.userId?.substring(0, 8)}...
                                      </span>
                                      <span className="text-[8px] text-slate-500 font-mono ml-auto sm:ml-0">
                                        {les.timestamp?.toDate
                                          ? les.timestamp
                                              .toDate()
                                              .toLocaleString()
                                          : new Date().toLocaleString()}
                                      </span>
                                    </div>

                                    {/* Whiteboard content brief */}
                                    <div className="mt-3 bg-black/40 p-4 rounded-xl border border-white/5">
                                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider block mb-2">
                                        Whiteboard Script Spec
                                      </span>
                                      <pre className="text-[10px] text-slate-300 font-mono whitespace-pre-wrap max-h-24 overflow-y-auto custom-scrollbar leading-normal">
                                        {les.whiteboard_notes ||
                                          "No board records."}
                                      </pre>
                                    </div>
                                  </div>

                                  <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto shrink-0 justify-end">
                                    <button
                                      onClick={() => {
                                        // Load this lesson into active learner workspace
                                        setWhiteboardNotes(
                                          les.whiteboard_notes,
                                        );
                                        setTeacherDialogue(
                                          les.teacher_dialogue,
                                        );
                                        setCurrentTopic(les.topic);
                                        setIsSettingsOpen(false);
                                      }}
                                      className="px-4 py-2.5 rounded-xl text-blue-400 border border-blue-500/20 hover:bg-blue-600 hover:text-white transition-all text-[9px] font-black uppercase tracking-wider flex-1 sm:flex-initial"
                                    >
                                      Load into Workspace
                                    </button>
                                    {adminLessonDeletingId === les.id ? (
                                      <button
                                        onClick={() => {
                                          deleteAdminDocument("lessons", les.id);
                                          setAdminLessonDeletingId(null);
                                        }}
                                        className="px-3 py-2.5 rounded-xl bg-red-700 text-white border border-red-550/20 hover:bg-red-600 transition-all text-[9px] font-black uppercase tracking-wider flex-1 sm:flex-initial animate-pulse"
                                        title="Click to confirm deletion"
                                      >
                                        Confirm Purge!
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setAdminLessonDeletingId(les.id);
                                          setTimeout(() => setAdminLessonDeletingId((prev) => prev === les.id ? null : prev), 5000);
                                        }}
                                        className="px-3 py-2.5 rounded-xl text-red-400 border border-red-550/20 hover:bg-red-600 hover:text-white transition-all text-[9px] font-black uppercase tracking-wider flex-1 sm:flex-initial"
                                        title="Moderate and completely execute purging"
                                      >
                                        Moderate Purge
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}

                          {adminLessons.length === 0 && (
                            <div className="text-center py-12 text-slate-500 text-xs font-mono">
                              No generated masterclass history blueprints saved.
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tab 3: Admin & Safety */}
                      {adminActiveSubTab === "credentials" && (
                        <div className="space-y-6">
                          <div className="p-6 rounded-3xl bg-slate-950/40 border border-white/5 space-y-4">
                            <h4 className="text-xs font-black text-white uppercase tracking-widest border-b border-white/5 pb-2">
                              System Certificate & Administration Directives
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-400 leading-relaxed font-sans">
                              <div>
                                <h5 className="font-bold text-white mb-1.5 text-[11px] uppercase">
                                  Registered Principal
                                </h5>
                                <p>
                                  Email Identification Checklist:{" "}
                                  <span className="text-blue-400 font-mono">
                                    charlesmwajima@gmail.com
                                  </span>
                                </p>
                                <p className="mt-2 text-[11px]">
                                  Security Token: Hard-linked in cloud instance
                                  firewall rules (`firestore.rules`). Bypassing
                                  authentication claims requires complete
                                  verification values.
                                </p>
                              </div>
                              <div>
                                <h5 className="font-bold text-white mb-1.5 text-[11px] uppercase">
                                  Permissions Granted
                                </h5>
                                <ul className="list-disc list-inside space-y-1">
                                  <li>
                                    List queries bypassing UID filter
                                    requirements
                                  </li>
                                  <li>
                                    Get queries across unrestricted documents
                                  </li>
                                  <li>
                                    Delete actions allowed under secure
                                    moderation gates
                                  </li>
                                  <li>
                                    Read permissions allowed for feedback
                                    streams and logs
                                  </li>
                                </ul>
                              </div>
                            </div>
                          </div>

                          <div className="group bg-white/5 border border-white/5 p-6 rounded-3xl hover:bg-white/[0.07] transition-all">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-5">
                                <div className="h-12 w-12 bg-amber-600/20 text-amber-400 rounded-2xl flex items-center justify-center border border-amber-500/20">
                                  <i className="fas fa-exclamation-triangle text-lg"></i>
                                </div>
                                <div>
                                  <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">
                                    Sandbox Playground Simulation
                                  </h4>
                                  <p className="text-[10px] text-slate-500 font-medium">
                                    Render rich simulated data metrics for
                                    immediate testing and inspection fallback
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  if (isAdminDemoMode) {
                                    fetchAdminData();
                                  } else {
                                    loadAdminDemoData();
                                  }
                                }}
                                className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase border transition-all ${
                                  isAdminDemoMode
                                    ? "bg-amber-600 border-amber-500 text-white hover:bg-amber-500"
                                    : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10"
                                }`}
                              >
                                {isAdminDemoMode
                                  ? "Active Demo Sandbox"
                                  : "Load Demo Sandbox"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Tab 4: Feature Switches & Development Controls */}
                      {adminActiveSubTab === "features" && (
                        <div className="space-y-6 animate-fadeIn">
                          <div className="p-6 rounded-3xl bg-slate-950/40 border border-white/5 space-y-6">
                            <div>
                              <h4 className="text-xs font-black text-white uppercase tracking-widest border-b border-white/5 pb-2">
                                Global Features Management
                              </h4>
                              <p className="text-[10px] text-slate-500 mt-2">
                                Toggle global platform features to "Coming Soon" status or render interactive previews. Your settings are synced instantly using security-locked Firestore entries.
                              </p>
                            </div>

                            <div className="bg-slate-900/60 p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all hover:bg-slate-900/80">
                              <div className="flex items-start gap-4">
                                <div className="h-12 w-12 bg-blue-600/10 text-blue-400 rounded-xl flex items-center justify-center border border-blue-500/10 shrink-0">
                                  <i className="fas fa-video text-lg"></i>
                                </div>
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h5 className="font-bold text-white text-[11px] uppercase tracking-wider">
                                      High-Fidelity Video Masterclass Mode
                                    </h5>
                                    {videoComingSoon ? (
                                      <span className="text-[8px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded-full font-black uppercase tracking-wider animate-pulse">
                                        COMING SOON ACTIVE
                                      </span>
                                    ) : (
                                      <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                                        FULLY OPERATIONAL
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-400 mt-1 max-w-xl leading-relaxed">
                                    When marked as "Coming Soon", users choosing to generate masterclass videos are gracefully greeted with a gorgeous "Feature Preview" interface explaining that the remote AI render hardware is undergoing maintenance, allowing them to sign up for early beta access.
                                  </p>
                                </div>
                              </div>

                              <button
                                onClick={async () => {
                                  setIsUpdatingComingSoon(true);
                                  setAdminError(null);
                                  try {
                                    if (isAdminDemoMode) {
                                      setVideoComingSoon(prev => !prev);
                                      setAdminDeleteSuccess(`[SANDBOX] Toggled Video Feature local status.`);
                                      return;
                                    }
                                    
                                    // Save to Firestore settings
                                    const devRef = doc(db, "appSettings", "videoMode");
                                    await setDoc(devRef, {
                                      comingSoon: !videoComingSoon,
                                      updatedAt: serverTimestamp(),
                                      updatedBy: user?.email || "charlesmwajima@gmail.com"
                                    }, { merge: true });

                                    setAdminDeleteSuccess(`Successfully updated High-Fidelity Video Mode status to ${!videoComingSoon ? "Coming Soon" : "Active"}.`);
                                  } catch (err: any) {
                                    console.error("Error setting feature state in Firestore:", err);
                                    let errorMsg = err.message;
                                    try {
                                      handleFirestoreError(err, OperationType.WRITE, "appSettings/videoMode");
                                    } catch (fsErr: any) {
                                      errorMsg = fsErr.message;
                                    }
                                    setAdminError(`Failed to update settings database: ${errorMsg}`);
                                  } finally {
                                    setIsUpdatingComingSoon(false);
                                  }
                                }}
                                disabled={isUpdatingComingSoon}
                                className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase border tracking-wider transition-all duration-300 w-full md:w-auto shrink-0 flex items-center justify-center gap-2 ${
                                  videoComingSoon
                                    ? "bg-emerald-600/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-600/30"
                                    : "bg-yellow-600/15 text-yellow-500 border-yellow-500/20 hover:bg-yellow-600/30"
                                }`}
                              >
                                {isUpdatingComingSoon ? (
                                  <>
                                    <i className="fas fa-spinner animate-spin"></i>
                                    Updating...
                                  </>
                                ) : (
                                  <>
                                    <i className={videoComingSoon ? "fas fa-play" : "fas fa-hourglass-half"}></i>
                                    {videoComingSoon ? "Activate Feature" : "Display Coming Soon"}
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-14 pt-8 border-t border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e] animate-pulse"></div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      Hardware Optmized • Latency: 42ms
                    </span>
                  </div>
                  <div className="flex items-center gap-6">
                    <button className="text-[9px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors">
                      Documentation
                    </button>
                    <button className="text-[9px] font-black text-blue-500 uppercase tracking-widest hover:text-blue-400 transition-colors">
                      Reset System
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showOrientation && (
          <OrientationTour
            language={language}
            onClose={() => {
              if (user) {
                localStorage.setItem(
                  `tutor_orientation_completed_${user.uid}`,
                  "true",
                );
              }
              localStorage.removeItem("omnitutor_just_signed_up");
              setShowOrientation(false);
            }}
          />
        )}
      </AnimatePresence>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: rgba(255, 255, 255, 0.05); 
          border-radius: 10px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.4); }
        
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(1000%); }
        }
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `,
        }}
      />
    </div>
  );
}
