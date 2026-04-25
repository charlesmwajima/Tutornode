import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './lib/firebase';
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini on frontend as per gemini-api skill
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Lesson {
  id: string;
  topic: string;
  whiteboard_notes: string;
  teacher_dialogue: string;
  timestamp: any;
}

export default function App() {
  const [studentInput, setStudentInput] = useState('');
  const [whiteboardNotes, setWhiteboardNotes] = useState('# Welcome to TutorNode\nReady to begin our journey? I am Mwalimu Bora, and I am here to guide you through any topic you wish to master. Enter a subject below, and let\'s explore the Neural Academy\'s archives together.');
  const [teacherDialogue, setTeacherDialogue] = useState('Greetings, student! I am Mwalimu Bora. What shall we learn about today?');
  const [videoScene, setVideoScene] = useState('Teacher standing by the board');
  const [videoKeyword, setVideoKeyword] = useState('education');
  const [visualDiagramPrompt, setVisualDiagramPrompt] = useState<string | null>(null);
  const [lessonSegments, setLessonSegments] = useState<{ content: string; speech: string }[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [currentTopic, setCurrentTopic] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackData, setFeedbackData] = useState({ quality: 5, relevance: 5, comments: '' });
  const [lessonHistory, setLessonHistory] = useState<Lesson[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [language, setLanguage] = useState<'en' | 'sw'>('en');
  const [fileData, setFileData] = useState<{ mimeType: string; data: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (language === 'sw') {
      setWhiteboardNotes('# Karibu TutorNode Universal Academy\nUpo tayari kuanza safari yetu? Mimi ni Mwalimu Bora, na nipo hapa kukuongoza katika mada yoyote unayotaka kufahamu. Ingiza mada hapa chini, na tuchunguze kumbukumbu za TutorNode Universal Academy pamoja.');
      setTeacherDialogue('Karibu kwenye TutorNode Universal Academy! Mimi ni Mwalimu Bora. Leo tutajifunza kuhusu nini?');
    } else {
      setWhiteboardNotes('# Welcome to TutorNode Universal Academy\nReady to begin our journey? I am Mwalimu Bora, and I am here to guide you through any topic you wish to master. Enter a subject below, and let\'s explore the TutorNode Universal Academy\'s archives together.');
      setTeacherDialogue('Welcome to TutorNode Universal Academy! I am Mwalimu Bora. What shall we learn about today?');
    }
  }, [language]);
  const recognitionRef = useRef<any>(null);

  // Voice synthesis helper
  const speakText = (text: string, onEnd?: () => void) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === 'sw' ? 'sw-TZ' : 'en-US';
      const voices = window.speechSynthesis.getVoices();
      const matchedVoice = voices.find(voice => voice.lang.startsWith(language === 'sw' ? 'sw' : 'en'));
      if (matchedVoice) utterance.voice = matchedVoice;
      utterance.rate = 1.1;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => {
        if (onEnd) onEnd();
        else setTimeout(() => setIsPlaying(false), 5000);
      };
      utterance.onerror = () => setIsPlaying(false);
      setIsPlaying(true);
      window.speechSynthesis.speak(utterance);
    } else {
      setIsPlaying(true);
      setTimeout(() => {
        if (onEnd) onEnd();
        else setIsPlaying(false);
      }, Math.min(text.length * 50, 10000));
    }
  };

  const playLesson = (segments: { content: string; speech: string }[], index = 0) => {
    if (index >= segments.length) {
      setIsPlaying(false);
      return;
    }
    setCurrentSlideIndex(index);
    setTeacherDialogue(segments[index].speech);
    speakText(segments[index].speech, () => {
      // Small pause between slides
      setTimeout(() => {
        playLesson(segments, index + 1);
      }, 1000);
    });
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setIsPlaying(false);
    }
  };

  const resumeSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
      setIsPlaying(true);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Supported types for Gemini 1.5 Flash include PDF and text
    const supportedTypes = ['application/pdf', 'text/plain', 'text/markdown', 'text/csv'];
    if (!supportedTypes.includes(file.type)) {
      setTeacherDialogue("I can only read PDFs or text files at the moment. Please upload a compatible textbook.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setTeacherDialogue("This textbook is too massive (over 20MB). Please provide a smaller section.");
      return;
    }

    setIsProcessingFile(true);
    setFileName(file.name);
    setTeacherDialogue(`Digitizing ${file.name}... Injecting textbook into my neural archives...`);

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setFileData({
        mimeType: file.type,
        data: base64
      });
      setIsProcessingFile(false);
      setTeacherDialogue(`${file.name} successfully integrated. I am ready to teach from its contents. What topic shall we master?`);
      speakText(`${file.name} integrated. Ready to teach.`);
    };
    reader.onerror = () => {
      setIsProcessingFile(false);
      setTeacherDialogue("Neural scan failed. The file might be corrupted.");
    };
    reader.readAsDataURL(file);
  };

  const clearFile = () => {
    setFileData(null);
    setFileName(null);
    setTeacherDialogue("Textbook detached. I will now teach from my general neural knowledge.");
  };

  const handleLearn = async (e: React.FormEvent) => {
    e.preventDefault();
    executeLearn(studentInput);
  };

  const handleVoiceIntent = (transcript: string) => {
    // 1. Playback Controls
    if (language === 'sw') {
      if (transcript.includes('tuliza') || transcript.includes('kimya') || transcript.includes('acha kuongea')) {
        stopSpeaking();
        return;
      }
      if (transcript.includes('endelea')) {
        resumeSpeaking();
        return;
      }
      if (transcript.includes('rudia') || transcript.includes('tena')) {
        speakText(teacherDialogue);
        return;
      }
    } else {
      if (transcript.includes('pause') || transcript.includes('stop talking') || transcript.includes('hush')) {
        stopSpeaking();
        return;
      }
      if (transcript.includes('resume') || transcript.includes('continue') || transcript.includes('play')) {
        resumeSpeaking();
        return;
      }
      if (transcript.includes('rewind') || transcript.includes('repeat') || transcript.includes('again')) {
        speakText(teacherDialogue);
        return;
      }
    }

    // 2. Navigation
    if (language === 'sw') {
      if (transcript.includes('kumbukumbu') || transcript.includes('historia')) {
        setShowHistory(true);
        setTeacherDialogue("Nikikagua kumbukumbu. Unaweza kusema 'ijayo' au 'iliyopita' ili kuvinjari.");
        speakText("Nikikagua kumbukumbu.");
        return;
      }
      if (transcript.includes('sasa') || transcript.includes('funga')) {
        setShowHistory(false);
        return;
      }
    } else {
      if (transcript.includes('history') || transcript.includes('archives')) {
        setShowHistory(true);
        setTeacherDialogue("Reviewing the archives. You can say 'next' or 'previous' to browse.");
        speakText("Reviewing the archives.");
        return;
      }
      if (transcript.includes('current') || transcript.includes('lesson') || transcript.includes('close history')) {
        setShowHistory(false);
        return;
      }
    }
    if (transcript.includes('next') || (language === 'sw' && transcript.includes('ijayo'))) {
       if (showHistory && lessonHistory.length > 0) {
          const nextIdx = Math.min(lessonHistory.length - 1, historyIndex + 1);
          if (nextIdx !== historyIndex) {
            loadLessonFromHistory(nextIdx);
          }
       }
       return;
    }
    if (transcript.includes('previous') || transcript.includes('back') || (language === 'sw' && (transcript.includes('iliyopita') || transcript.includes('nyuma')))) {
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
      'pause', 'stop', 'play', 'resume', 'rewind', 'repeat', 'history', 'archives', 'next', 'previous',
      'tuliza', 'kimya', 'endelea', 'rudia', 'kumbukumbu', 'historia', 'ijayo', 'iliyopita'
    ];
    const isOnlyCommand = commands.some(c => transcript === c);
    
    if (!isOnlyCommand) {
      // If none of the specific intents, treat as a learning topic
      startLearningFromVoice(transcript);
    }
  };

  const startLearningFromVoice = (topic: string) => {
    setStudentInput(topic);
    // Use a small delay to ensure state is updated before form submission simulation
    setTimeout(() => {
      const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
      // We need to bypass the state check because state might not have updated yet in the closure
      // So we'll call a version of handleLearn that accepts input
      executeLearn(topic);
    }, 100);
  };

  const executeLearn = async (input: string) => {
    if (!input.trim() || isLoading) return;

    setStudentInput('');
    setIsLoading(true);
    setVideoKeyword('processing');
    setTeacherDialogue(
      language === 'sw' 
        ? (fileData ? `Nikisaka kitabu chako kwa ajili ya "${input}"...` : 'Uunganisho wa neva upo tayari. Nikichanganua kumbukumbu...')
        : (fileData ? `Searching your textbook for "${input}"...` : 'Uplink active. Scanning neural archives...')
    );

    try {
      const parts: any[] = [];
      if (fileData) {
        parts.push({
          inlineData: fileData
        });
      }

      const textbookPrompt = `You are "Mwalimu Bora", a legendary master teacher at the TutorNode Universal Academy.
        
        CONTEXT: A source document/textbook has been provided.
        TOPIC TO MASTER: "${input}"
        OUTPUT LANGUAGE: ${language === 'sw' ? 'SWAHILI' : 'ENGLISH'}

        YOUR MISSION: Break the lesson into 8-12 SYNCHRONIZED segments. Each segment is a slide.
        Schema: { "segments": [{ "content": "Markdown", "speech": "Spoken explanation" }], "visual_diagram_prompt": "string", "video_scene": "string", "video_keyword": "string", "status": "success" }
 
         Respond ONLY in JSON:
         {
           "whiteboard_notes": "A MASSIVE, EXHAUSTIVE MULTI-SECTION MASTERCLASS in Markdown. Include data tables, bolding, emojis, complex ASCII diagrams, and step-by-step animated logic frames.",
           "teacher_dialogue": "An extremely detailed, sophisticated long-form lecture (60-80 sentences) that covers the topic in full depth. This is a 15-minute verbal masterclass content. Explain the slides and animations on the board.",
           "visual_diagram_prompt": "A highly descriptive prompt for a technical diagram or illustration about ${input} (in English).",
          "video_scene": "Teacher pointing to complex architectural diagrams.",
          "video_keyword": "masterclass-lecture",
          "status": "success"
        }`;

      const generalPrompt = `You are "Mwalimu Bora", a legendary master teacher at the TutorNode Universal Academy.
        TOPIC TO MASTER: "${input}"
        OUTPUT LANGUAGE: ${language === 'sw' ? 'SWAHILI' : 'ENGLISH'}

        YOUR MISSION: Provide 8-12 SYNCHRONIZED masterclass segments.
        Schema: { "segments": [{ "content": "Markdown", "speech": "Spoken masterclass" }], "visual_diagram_prompt": "string", "video_scene": "string", "video_keyword": "string", "status": "success" }
 
         Respond ONLY in JSON:
         {
           "whiteboard_notes": "A MASSIVE, FULL CURRICULUM in Markdown. Use extensive tables, emojis, ASCII diagrams, animated logic steps, and deep nested structure.",
           "teacher_dialogue": "A warm, deeply intellectual extremely long-form verbal lecture (60-80 sentences). Treat this as a full 15-minute spoken masterclass. Use native phrasing and explain the slides and animations on the board.",
           "visual_diagram_prompt": "A highly descriptive prompt for an educational illustration about ${input} (in English).",
          "video_scene": "Teacher demonstrating high-level concepts on a digital board.",
          "video_keyword": "advanced-study",
          "status": "success"
        }`;

      const prompt = fileData ? textbookPrompt : generalPrompt;

      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              segments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    content: { type: Type.STRING },
                    speech: { type: Type.STRING }
                  },
                  required: ["content", "speech"]
                }
              },
              visual_diagram_prompt: { type: Type.STRING },
              video_scene: { type: Type.STRING },
              video_keyword: { type: Type.STRING },
              status: { type: Type.STRING }
            },
            required: ["segments", "visual_diagram_prompt", "video_scene", "video_keyword", "status"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      const segments = result.segments || [];
      
      setLessonSegments(segments);
      
      // Backward compatibility for general display
      const fullNotes = segments.map((s: any) => s.content).join("\n\n---\n\n");
      const fullDialogue = segments.map((s: any) => s.speech).join(" ");
      
      setWhiteboardNotes(fullNotes || 'No notes available.');
      setTeacherDialogue(fullDialogue || 'Lesson data prepared.');
      setVisualDiagramPrompt(result.visual_diagram_prompt || null);
      setVideoScene(result.video_scene || 'Teaching');
      setVideoKeyword(result.video_keyword || 'education');
      setCurrentTopic(input);
      setShowFeedback(true);
      setFeedbackSubmitted(false);
      
      // Start synchronized playback
      if (segments.length > 0) {
        playLesson(segments);
      } else {
        speakText(fullDialogue);
      }

      // Save lesson to history (using flattened version for now)
      saveLesson(input, { ...result, whiteboard_notes: fullNotes, teacher_dialogue: fullDialogue });
    } catch (error) {
      console.error('Learning error:', error);
      setTeacherDialogue('Neural Link Interrupted. Please re-establish connection manually.');
      setVideoKeyword('error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initialize speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = language === 'sw' ? 'sw-TZ' : 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        console.log('Voice transcript:', transcript);
        handleVoiceIntent(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'no-speech') return; // Ignore silent sessions
        setTeacherDialogue(`Voice system error: ${event.error}. Please try typing.`);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        setIsListening(true);
        recognitionRef.current.start();
        setTeacherDialogue("I'm listening... Tell me what you want to learn about today.");
      } else {
        setTeacherDialogue("I'm sorry, your browser doesn't support the voice command interface.");
      }
    }
  };

  const fetchLessonHistory = async () => {
    const path = 'lessons';
    try {
      const q = query(collection(db, path), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      const history = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Lesson[];
      setLessonHistory(history);
    } catch (error) {
      console.error('History fetch error:', error);
    }
  };

  const saveLesson = async (topic: string, result: any) => {
    const path = 'lessons';
    try {
      await addDoc(collection(db, path), {
        topic,
        whiteboard_notes: result.whiteboard_notes,
        teacher_dialogue: result.teacher_dialogue,
        timestamp: serverTimestamp()
      });
      fetchLessonHistory(); // Refresh history
      setHistoryIndex(0); // New lesson is at top
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const loadLessonFromHistory = (index: number) => {
    const lesson = lessonHistory[index];
    if (!lesson) return;
    
    setWhiteboardNotes(lesson.whiteboard_notes);
    setTeacherDialogue(lesson.teacher_dialogue);
    setCurrentTopic(lesson.topic);
    setShowHistory(false);
    setShowFeedback(false);
    speakText(lesson.teacher_dialogue);
    setHistoryIndex(index);
  };

  useEffect(() => {
    fetchLessonHistory();
  }, []);

  useEffect(() => {
    setCurrentSlideIndex(0);
  }, [whiteboardNotes]);

  const getSlides = (content: string) => {
    // Split by Markdown headers (H1 or H2)
    const sections = content.split(/(?=^#+ )/m).filter(s => s.trim().length > 0);
    return sections.length > 0 ? sections : [content];
  };

  const slides = lessonSegments.length > 0 
    ? lessonSegments.map(s => s.content) 
    : getSlides(whiteboardNotes);
    
  const currentSlideContent = slides[currentSlideIndex] || slides[0] || '';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPlaying) {
        if (e.key === 'ArrowRight') {
          setCurrentSlideIndex(prev => Math.min(slides.length - 1, prev + 1));
        } else if (e.key === 'ArrowLeft') {
          setCurrentSlideIndex(prev => Math.max(0, prev - 1));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, slides.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0; // Reset scroll to top for new notes
    }
  }, [whiteboardNotes]);

  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (feedbackSubmitted) return;

    const path = 'feedbacks';
    try {
      await addDoc(collection(db, path), {
        topic: currentTopic,
        teacher_dialogue: teacherDialogue,
        quality_score: feedbackData.quality,
        relevance_score: feedbackData.relevance,
        comments: feedbackData.comments,
        timestamp: serverTimestamp()
      });
      setFeedbackSubmitted(true);
      setTimeout(() => setShowFeedback(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };
  const getTeacherImage = () => {
    if (isLoading) return `https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1000`; // Tech/Abstract
    if (videoKeyword === 'error') return "https://images.unsplash.com/photo-1549317336-206569e8475c?auto=format&fit=crop&q=80&w=1000"; // Glitch/Error
    return `https://source.unsplash.com/featured/1600x900/?teacher,${videoKeyword},classroom`;
  };

  return (
    <div className="min-h-screen bg-[#0a0c10] font-sans text-slate-100 overflow-hidden selection:bg-blue-500/30">
      {/* Top Bar */}
      <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6 z-20 sticky top-0">
        <div className="flex items-center gap-4">
          <motion.div 
            animate={{ rotate: isPlaying ? [0, 5, -5, 0] : 0 }}
            transition={{ repeat: isPlaying ? Infinity : 0, duration: 2 }}
            className="bg-blue-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/40 relative overflow-hidden group"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <i className="fas fa-brain text-xl text-white relative z-10"></i>
          </motion.div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white leading-none">TutorNode</h1>
            <p className="text-[9px] text-blue-400 font-black uppercase tracking-[0.3em] mt-1">Universal AI Academy</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/10 group cursor-default">
            <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-green-500 shadow-[0_0_8px_#22c55e]'}`}></div>
            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 transition-colors group-hover:text-white">
              {isLoading ? 'Neural Uplink Processing' : 'AI Presence Stable'}
            </span>
          </div>
          <div className="h-10 w-10 rounded-full border border-white/10 p-0.5 overflow-hidden">
            <div className="w-full h-full bg-slate-800 flex items-center justify-center">
              <i className="fas fa-user-circle text-2xl text-slate-500"></i>
            </div>
          </div>
        </div>
      </header>

      {/* Floating Background Particles */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              x: Math.random() * 100 + "%", 
              y: Math.random() * 100 + "%",
              opacity: 0,
              scale: Math.random() * 0.5 + 0.5
            }}
            animate={{ 
              y: [null, "-10%", "110%"],
              opacity: [0, 0.1, 0],
              rotate: [0, 180, 360]
            }}
            transition={{ 
              duration: Math.random() * 20 + 20, 
              repeat: Infinity, 
              ease: "linear",
              delay: Math.random() * 20
            }}
            className="absolute text-blue-500/20 text-4xl"
          >
            <i className={`fas ${['fa-atom', 'fa-dna', 'fa-microscope', 'fa-bolt', 'fa-code'][i % 5]}`}></i>
          </motion.div>
        ))}
        {/* Animated Grid Lines */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      </div>

      {/* Main Grid */}
      <main className="grid grid-cols-1 lg:grid-cols-12 h-[calc(100vh-64px)]">
        
        {/* Left column: AI Teacher Video Feed */}
        <div className="lg:col-span-5 border-r border-white/5 flex flex-col h-full bg-slate-900/20">
          
          <div className="p-6 flex-1 flex flex-col gap-6 min-h-0 bg-gradient-to-b from-blue-900/5 to-transparent">
            {/* The "Video" Player Container */}
            <div className="relative aspect-video bg-black rounded-[2rem] overflow-hidden shadow-2xl border border-white/10">
              
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
                       y: [0, -5, 0]
                     }}
                     transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                     src={getTeacherImage()}
                     alt="AI Teacher" 
                     className={`w-full h-full object-cover grayscale-[10%] brightness-[0.9] contrast-[1.1] ${isLoading ? 'blur-sm grayscale' : ''}`}
                     referrerPolicy="no-referrer"
                   />
                </motion.div>
              </AnimatePresence>

              {/* HUD Elements */}
              <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                   <div className="flex flex-col gap-2">
                     <div className="bg-red-600 px-2 py-1 rounded text-[10px] font-black flex items-center gap-1.5 shadow-lg w-fit">
                        <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                        LIVE AI FEED
                     </div>
                     <div className="bg-black/40 backdrop-blur-md px-2 py-1 rounded text-[9px] font-mono text-white/70 w-fit">
                        SCENE: {videoScene.toUpperCase()}
                     </div>
                   </div>
                   <div className="bg-black/40 backdrop-blur-md p-3 rounded-2xl flex flex-col items-center border border-white/10">
                      <i className="fas fa-shield-halved text-blue-500 mb-1"></i>
                      <span className="text-[8px] font-black opacity-50">ENCRYPTED</span>
                      <span className="text-[10px] font-mono text-blue-400">#SD-812</span>
                   </div>
                </div>

                <div className="flex items-end justify-between">
                   {/* Dialogue Subtitles overlay */}
                    <div className="max-w-[80%] pointer-events-auto">
                      <AnimatePresence mode="wait">
                        {(isPlaying || showSubtitles) && teacherDialogue && (
                          <motion.div 
                            key={teacherDialogue}
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="bg-black/90 backdrop-blur-3xl border border-white/20 p-6 rounded-3xl text-lg font-medium leading-relaxed shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-white border-l-4 border-l-blue-500"
                          >
                             <div className="flex items-center gap-2 mb-2">
                               <span className="text-blue-400 font-black text-[10px] uppercase tracking-widest">Neural Voice Output</span>
                               <div className="flex gap-1">
                                 <motion.div animate={{ height: [4, 8, 4] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-0.5 bg-blue-500"></motion.div>
                                 <motion.div animate={{ height: [2, 6, 2] }} transition={{ repeat: Infinity, duration: 0.7 }} className="w-0.5 bg-blue-500"></motion.div>
                                 <motion.div animate={{ height: [6, 2, 6] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-0.5 bg-blue-500"></motion.div>
                               </div>
                             </div>
                             <span className="text-red-500 font-black mr-2">MWALIMU:</span>
                             "{teacherDialogue}"
                             <motion.span animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.8 }} className="inline-block w-1.5 h-5 bg-blue-500 ml-1"></motion.span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                   <div className="flex flex-col gap-1 items-end mb-2 h-12">
                      {[1, 2, 3, 4, 5].map(i => (
                        <motion.div 
                          key={i}
                          animate={{ width: isPlaying ? [`${i*2}px`, `${(i+4)*2}px`, `${i*2}px`] : [`${i*2}px`, `${i*2}px`] }}
                          transition={{ repeat: Infinity, duration: 0.5 + i*0.1 }}
                          className={`h-1.5 rounded-full ${isPlaying ? 'bg-blue-500' : 'bg-slate-700'}`}
                        />
                      ))}
                   </div>
                </div>
              </div>

              {/* Scanning effect */}
              <div className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-screen bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
            </div>

            {/* Neural Uplink Interaction Terminal */}
            <div className="bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden space-y-6">
                <div className="absolute left-0 top-0 bottom-0 w-2 bg-blue-500 shadow-[0_0_15px_#3b82f6]"></div>
                
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">Neural Link Station</p>
                    <div className="flex gap-2 items-center">
                      <button 
                        type="button"
                        onClick={() => setShowSubtitles(!showSubtitles)}
                        className={`p-2 rounded-full transition-all border ${showSubtitles ? 'bg-blue-600 border-blue-400 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60'}`}
                        title="Toggle Subtitles"
                      >
                        <i className={`fas ${showSubtitles ? 'fa-comment-dots' : 'fa-comment-slash'} text-[10px]`}></i>
                      </button>
                      <div className="w-[1px] h-4 bg-white/10 mx-1"></div>
                      <button 
                        type="button"
                        onClick={() => setLanguage('en')}
                        className={`px-3 py-1 rounded-full text-[9px] font-black transition-all border ${language === 'en' ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60'}`}
                      >
                        ENGLISH
                      </button>
                    <button 
                      type="button"
                      onClick={() => setLanguage('sw')}
                      className={`px-3 py-1 rounded-full text-[9px] font-black transition-all border ${language === 'sw' ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60'}`}
                    >
                      SWAHILI
                    </button>
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse delay-75"></div>
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse delay-150"></div>
                  </div>
                </div>

                <form onSubmit={handleLearn} className="relative group">
                  <input 
                    type="text"
                    value={studentInput}
                    onChange={(e) => setStudentInput(e.target.value)}
                    placeholder={
                      fileName 
                        ? (language === 'sw' ? `Uliza kuhusu "${fileName}"...` : `Ask about "${fileName}"...`) 
                        : (language === 'sw' ? "Ingiza mada ya kujifunza..." : "Enter subject or brainwave topic...")
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 focus:outline-none focus:border-blue-500/50 transition-all text-white placeholder:text-slate-600 font-mono text-sm"
                    disabled={isLoading}
                    autoFocus
                  />
                  <div className="absolute right-3 top-3 bottom-3 flex gap-2">
                    <input 
                      type="file" 
                      id="textbook-upload" 
                      className="hidden" 
                      accept=".pdf, .txt, .md"
                      onChange={handleFileUpload}
                    />
                    <button 
                       type="button"
                       onClick={() => document.getElementById('textbook-upload')?.click()}
                       disabled={isLoading || isProcessingFile}
                       className={`h-full aspect-square flex items-center justify-center rounded-xl transition-all shadow-lg active:scale-95 disabled:scale-100 cursor-pointer ${fileName ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'} border border-white/10`}
                       title={fileName ? `Using ${fileName}` : "Upload Textbook (PDF/Text)"}
                    >
                      <i className={`fas ${isProcessingFile ? 'fa-spinner fa-spin' : fileName ? 'fa-file-pdf' : 'fa-file-upload'} text-sm text-white`}></i>
                    </button>
                    {fileName && (
                      <button 
                         type="button"
                         onClick={clearFile}
                         className="h-full aspect-square flex items-center justify-center rounded-xl bg-red-900/50 hover:bg-red-800 text-white transition-all border border-red-500/30"
                         title="Clear textbook"
                      >
                        <i className="fas fa-times text-xs"></i>
                      </button>
                    )}
                    <button 
                       type="button"
                       onClick={toggleListening}
                       disabled={isLoading}
                       className={`h-full aspect-square flex items-center justify-center rounded-xl transition-all shadow-lg active:scale-95 disabled:scale-100 cursor-pointer ${isListening ? 'bg-red-500 animate-pulse' : 'bg-slate-800 hover:bg-slate-700'} border border-white/10`}
                    >
                      <i className={`fas ${isListening ? 'fa-microphone' : 'fa-microphone-slash'} text-sm text-white`}></i>
                    </button>
                    <button 
                       type="submit"
                       disabled={isLoading || !studentInput.trim()}
                       className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white px-6 rounded-xl transition-all shadow-lg active:scale-95 disabled:scale-100 flex items-center gap-3 cursor-pointer group/btn"
                    >
                      {isLoading ? (
                        <i className="fas fa-circle-notch fa-spin text-sm"></i>
                      ) : (
                        <>
                          <span className="text-xs font-black uppercase tracking-widest leading-none">Uplink</span>
                          <i className="fas fa-satellite-dish text-sm group-hover/btn:scale-110 transition-transform"></i>
                        </>
                      )}
                    </button>
                  </div>
                </form>

                <div className="flex gap-2 flex-wrap pb-2">
                  {['Ancient Rome', 'Quantum Theory', 'Jazz History', 'Neural Networks'].map(t => (
                    <button 
                      key={t}
                      type="button"
                      onClick={() => setStudentInput(t)}
                      className="text-[9px] font-bold text-slate-500 hover:text-blue-400 transition-colors uppercase tracking-[0.2em] bg-white/5 px-3 py-1.5 rounded-lg border border-white/5"
                    >
                      {t}
                    </button>
                  ))}
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-3 gap-4 px-2">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 group hover:bg-blue-500/10 transition-colors">
                <i className="fas fa-bolt text-yellow-400 group-hover:scale-110 transition-transform"></i>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Efficiency</span>
                <span className="text-sm font-mono text-white">99.8%</span>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 group hover:bg-blue-500/10 transition-colors">
                <i className="fas fa-microchip text-blue-400 group-hover:scale-110 transition-transform"></i>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Neural Load</span>
                <span className="text-sm font-mono text-white">12%</span>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 group hover:bg-blue-500/10 transition-colors">
                <i className="fas fa-wifi text-green-400 group-hover:scale-110 transition-transform"></i>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Uplink</span>
                <span className="text-sm font-mono text-white">5G-AI</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: The Infinite Smartboard */}
        <div className="lg:col-span-7 flex flex-col h-full bg-[#0d1117] p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
               <div className="h-12 w-12 bg-slate-800 rounded-2xl flex items-center justify-center border border-white/5 shadow-xl">
                 <i className="fas fa-chalkboard-user text-blue-400"></i>
               </div>
               <div>
                 <h2 className="text-xl font-bold tracking-tight">Lesson Smartboard</h2>
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Real-time Data Generation</p>
               </div>
            </div>
            
            <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5">
                  <button 
                    onClick={() => setShowHistory(false)}
                    className={`h-8 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!showHistory ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Current lesson
                  </button>
                  <button 
                    onClick={() => setShowHistory(true)}
                    className={`h-8 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${showHistory ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Archives
                  </button>
            </div>
          </div>

          <div className="flex-1 bg-slate-900/80 rounded-[3rem] border-[20px] border-[#161b22] relative overflow-hidden shadow-3xl">
             <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none"></div>
             
             {showHistory ? (
                <div className="h-full w-full p-8 overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                    {lessonHistory.length === 0 ? (
                      <div className="col-span-full py-20 text-center text-slate-500">
                        <i className="fas fa-history text-3xl mb-4 block opacity-20"></i>
                        <p className="text-xs uppercase tracking-widest font-black">No neural archives found</p>
                      </div>
                    ) : (
                      lessonHistory.map((lesson, idx) => (
                        <motion.button
                          key={lesson.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.05 }}
                          onClick={() => loadLessonFromHistory(idx)}
                          className="text-left bg-white/5 border border-white/10 p-6 rounded-3xl hover:bg-blue-500/10 hover:border-blue-500/30 transition-all group"
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div className="bg-blue-600/20 text-blue-400 w-8 h-8 rounded-xl flex items-center justify-center">
                              <i className="fas fa-book-open text-xs"></i>
                            </div>
                            <span className="text-[8px] font-mono text-slate-500">
                              {lesson.timestamp?.toDate ? lesson.timestamp.toDate().toLocaleDateString() : 'Recent'}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-white mb-2 group-hover:text-blue-400 transition-colors uppercase truncate">{lesson.topic}</h4>
                          <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed italic">
                            "{lesson.teacher_dialogue}"
                          </p>
                        </motion.button>
                      ))
                    )}
                  </div>
                </div>
             ) : (
                <div 
                  ref={scrollRef}
                  className="h-full w-full p-12 overflow-y-auto custom-scrollbar relative"
                >
                   <AnimatePresence mode="wait">
                     <motion.div
                       key={whiteboardNotes}
                       initial={{ opacity: 0, y: 30 }}
                       animate={{ opacity: 1, y: 0 }}
                       transition={{ duration: 0.8, damping: 20, stiffness: 100 }}
                       className="prose prose-invert max-w-none 
                         prose-h1:text-4xl prose-h1:font-black prose-h1:text-white prose-h1:tracking-tight prose-h1:border-b prose-h1:border-white/10 prose-h1:pb-6
                         prose-h2:text-blue-400 prose-h2:font-bold prose-h2:mt-12
                         prose-p:text-slate-300 prose-p:text-lg prose-p:leading-relaxed
                         prose-li:text-slate-300 prose-li:text-lg
                         prose-strong:text-blue-200"
                     >
                        {visualDiagramPrompt && (
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mb-12 rounded-[2.5rem] overflow-hidden border border-white/10 shadow-4xl bg-black/50 backdrop-blur-3xl group relative min-h-[450px]"
                          >
                            {/* HUD Background Decoration */}
                            <div className="absolute inset-0 z-0 overflow-hidden opacity-20 pointer-events-none">
                               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-scan" />
                               <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.1),transparent_70%)]" />
                               <div className="grid grid-cols-20 h-full w-full gap-1 opacity-10">
                                  {[...Array(100)].map((_, i) => (
                                    <motion.div 
                                      key={i} 
                                      animate={{ opacity: [0.1, 0.3, 0.1] }} 
                                      transition={{ duration: Math.random() * 5 + 2, repeat: Infinity }}
                                      className="border-[0.5px] border-white/10 h-full w-full" 
                                    />
                                  ))}
                               </div>
                            </div>

                            <div className="bg-white/5 px-8 py-4 border-b border-white/10 flex justify-between items-center relative z-10">
                               <div className="flex items-center gap-3">
                                 <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>
                                 <span className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-400">TutorNode Presentation — Slide {currentSlideIndex + 1}/{slides.length}</span>
                               </div>
                               <div className="flex items-center gap-4">
                                 <div className="flex gap-2 mr-4 pointer-events-auto">
                                   <button 
                                     onClick={() => setCurrentSlideIndex(prev => Math.max(0, prev - 1))}
                                     disabled={currentSlideIndex === 0}
                                     className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white disabled:opacity-20 transition-all cursor-pointer"
                                   >
                                     <i className="fas fa-chevron-left text-[10px]"></i>
                                   </button>
                                   <button 
                                     onClick={() => setCurrentSlideIndex(prev => Math.min(slides.length - 1, prev + 1))}
                                     disabled={currentSlideIndex === slides.length - 1}
                                     className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white disabled:opacity-20 transition-all cursor-pointer"
                                   >
                                     <i className="fas fa-chevron-right text-[10px]"></i>
                                   </button>
                                 </div>
                                 {isPlaying && (
                                   <div className="flex items-center gap-1 h-4">
                                      {[...Array(12)].map((_, i) => (
                                        <motion.div 
                                          key={i}
                                          animate={{ 
                                            height: [4, 16, 8, 12, 4],
                                            backgroundColor: ["#3b82f6", "#60a5fa", "#3b82f6"]
                                          }}
                                          transition={{ 
                                            repeat: Infinity, 
                                            duration: 0.4 + (i * 0.05),
                                            ease: "easeInOut"
                                          }}
                                          className="w-0.5 rounded-full"
                                        />
                                      ))}
                                   </div>
                                 )}
                                 <i className="fas fa-microchip text-blue-500 animate-pulse text-sm"></i>
                               </div>
                            </div>

                            <div className="relative aspect-video flex flex-col min-h-[400px]">
                               {/* Image Layer */}
                               <div className="absolute inset-0 z-0">
                                 <img 
                                   src={`https://pollinations.ai/p/${encodeURIComponent(visualDiagramPrompt || 'educational diagram abstract technology')}?width=1280&height=720&nologo=true&seed=${whiteboardNotes.length}`}
                                   alt="Neural Diagram"
                                   className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-105 opacity-40 grayscale-[30%] contrast-[1.2]"
                                   referrerPolicy="no-referrer"
                                   onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).src = `https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1280`;
                                   }}
                                 />
                                 <div className="absolute inset-0 bg-gradient-to-t from-[#0d1117] via-[#0d1117]/20 to-transparent"></div>
                                 <div className="absolute inset-0 bg-blue-500/5 mix-blend-color"></div>
                               </div>

                               {/* Dialogue Display Layer (The "What he is teaching" part) */}
                               <div className="relative z-10 flex-1 flex flex-col p-8 pb-56 overflow-y-auto custom-scrollbar">
                                  <AnimatePresence mode="wait">
                                    {isPlaying ? (
                                      <motion.div
                                        key={`slide-${currentSlideIndex}`}
                                        initial={{ opacity: 0, x: 50 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -50 }}
                                        className="w-full min-h-full flex flex-col items-center justify-center pt-4"
                                      >
                                        <div className="w-full max-w-4xl px-4 py-8 bg-black/20 rounded-3xl backdrop-blur-sm border border-white/5 relative overflow-hidden group/slide">
                                          {/* Slide Corner Accents */}
                                          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-blue-500/30 rounded-tl-2xl"></div>
                                          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-blue-500/30 rounded-tr-2xl"></div>
                                          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-blue-500/30 rounded-bl-2xl"></div>
                                          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-blue-500/30 rounded-br-2xl"></div>

                                          <div className="prose prose-invert max-w-none 
                                            prose-h1:text-center prose-h1:text-3xl lg:prose-h1:text-4xl prose-h1:font-black prose-h1:mb-8 prose-h1:text-blue-400
                                            prose-h2:text-center prose-h2:text-2xl lg:prose-h2:text-3xl prose-h2:text-white/90 prose-h2:mb-6
                                            prose-p:text-center prose-p:text-lg lg:prose-p:text-xl prose-p:text-white/70 prose-p:leading-relaxed
                                            prose-ul:flex prose-ul:flex-col prose-ul:items-center prose-ul:list-none prose-ul:p-0
                                            prose-li:text-lg lg:prose-li:text-xl prose-li:text-white/80 prose-li:mb-4 prose-li:before:content-['•'] prose-li:before:text-blue-500 prose-li:before:mr-3
                                          ">
                                            <Markdown 
                                              components={{
                                                img: ({ ...props }) => {
                                                   return <img {...props} className="mx-auto rounded-xl max-h-48 object-contain" />;
                                                },
                                                table: ({ children }) => (
                                                  <div className="my-6 overflow-x-auto rounded-xl border border-white/10 bg-black/60 p-2 mx-auto max-w-2xl">
                                                    <table className="w-full text-left text-xs lg:text-sm">
                                                      {children}
                                                    </table>
                                                  </div>
                                                )
                                              }}
                                            >
                                              {currentSlideContent}
                                            </Markdown>
                                          </div>
                                        </div>
                                      </motion.div>
                                    ) : (
                                      <motion.div
                                        key="idle-text"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="text-center space-y-6"
                                      >
                                        <div className="relative">
                                          <div className="w-20 h-20 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4 relative z-10">
                                            <i className="fas fa-brain text-blue-500 text-3xl animate-pulse"></i>
                                          </div>
                                          <motion.div 
                                            animate={{ scale: [1, 1.5, 1], opacity: [0.1, 0, 0.1] }}
                                            transition={{ duration: 3, repeat: Infinity }}
                                            className="absolute inset-0 rounded-full bg-blue-500/20 z-0"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <p className="text-white/80 font-bold text-xl">System Operational</p>
                                          <p className="text-slate-500 font-mono text-sm tracking-widest uppercase">Neural Link Standby... Waiting for Input</p>
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>

                                  {/* Subtitles Overlay */}
                                  {isPlaying && showSubtitles && (
                                    <motion.div 
                                      initial={{ opacity: 0, y: 20 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col items-center justify-end min-h-[160px]"
                                    >
                                      <div className="max-w-4xl w-full">
                                        <div className="flex items-center gap-4 mb-3 justify-center">
                                          <div className="h-[1px] w-8 bg-blue-500/30"></div>
                                          <p className="text-[10px] font-mono text-blue-400 uppercase tracking-[0.4em] animate-pulse">Synchronized Neural Stream</p>
                                          <div className="h-[1px] w-8 bg-blue-500/30"></div>
                                        </div>
                                        <p className="text-white text-lg md:text-xl font-medium leading-relaxed drop-shadow-lg [text-shadow:_0_2px_4px_rgb(0_0_0_/_40%)]">
                                          {teacherDialogue}
                                        </p>
                                      </div>
                                    </motion.div>
                                  )}
                               </div>

                               <div className="absolute bottom-6 left-8 right-8 z-10 flex justify-between items-end">
                                  <div className="space-y-2 max-w-[60%]">
                                    <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest flex items-center gap-2">
                                      <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
                                      Visual Reconstruction Prompt
                                    </p>
                                    <p className="text-[10px] font-mono text-blue-400/80 lowercase italic line-clamp-2 bg-black/40 backdrop-blur-md p-2 rounded-lg border border-white/10">
                                      {visualDiagramPrompt || 'abstract neural architecture network for educational deep dive'}
                                    </p>
                                  </div>
                                  <div className="flex flex-col gap-2 items-end">
                                    <div className="flex gap-2">
                                      <div className="px-2 py-1 bg-blue-600/20 rounded text-[8px] font-mono text-blue-400 border border-blue-500/30 uppercase tracking-widest">
                                        Frame: {isLoading ? 'PROCESSING' : 'STABLE'}
                                      </div>
                                      <div className="px-2 py-1 bg-white/5 rounded text-[8px] font-mono text-white/40 border border-white/10 uppercase tracking-widest">
                                        Render: 1280x720
                                      </div>
                                    </div>
                                    <div className="flex gap-1 h-1">
                                      {[...Array(8)].map((_, i) => (
                                        <div key={i} className={`w-1 h-full rounded-full ${i < 6 ? 'bg-blue-500' : 'bg-white/10'}`} />
                                      ))}
                                    </div>
                                  </div>
                               </div>
                            </div>
                          </motion.div>
                        )}
                        <Markdown 
                          components={{
                            h1: ({ children }) => (
                              <motion.h1 
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="text-4xl font-black mb-10 bg-gradient-to-r from-white via-blue-200 to-white/40 bg-clip-text text-transparent border-b border-white/5 pb-6"
                              >
                                {children}
                              </motion.h1>
                            ),
                            h2: ({ children }) => (
                              <motion.h2 
                                initial={{ opacity: 0, scale: 0.95 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                className="text-2xl font-bold mt-16 mb-6 text-blue-400 flex items-center gap-3"
                              >
                                <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
                                {children}
                              </motion.h2>
                            ),
                            p: ({ children }) => (
                              <motion.p 
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                className="mb-6 last:mb-0"
                              >
                                {children}
                              </motion.p>
                            ),
                            li: ({ children }) => (
                              <motion.li 
                                initial={{ opacity: 0, x: -10 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                className="mb-3 hover:text-white transition-colors"
                              >
                                {children}
                              </motion.li>
                            ),
                            img: ({ ...props }) => {
                              const prompt = props.src || "";
                              const isPollination = prompt.startsWith("https://pollinations.ai") || !prompt.includes("://");
                              const finalSrc = isPollination 
                                ? `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=1024&height=576&nologo=true&seed=${Math.floor(Math.random() * 1000)}` 
                                : prompt;
                              
                              return (
                                <div className="my-8 rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-black/40">
                                  <div className="bg-white/5 px-6 py-2 border-b border-white/10 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">AI Schematic</span>
                                  </div>
                                  <img 
                                    {...props} 
                                    src={finalSrc} 
                                    className="w-full aspect-video object-cover" 
                                    referrerPolicy="no-referrer"
                                    alt={props.alt || "Educational Diagram"}
                                  />
                                  {props.alt && (
                                    <div className="p-4 bg-black/60 backdrop-blur-md">
                                      <p className="text-xs text-white/60 italic text-center font-mono">{props.alt}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            },
                            table: ({ children }) => (
                              <div className="my-6 overflow-x-auto rounded-2xl border border-white/10">
                                <table className="w-full text-left border-collapse bg-white/5">
                                  {children}
                                </table>
                              </div>
                            ),
                            th: ({ children }) => (
                              <th className="p-4 border-b border-white/20 bg-white/10 text-blue-300 font-bold uppercase text-xs tracking-widest">
                                {children}
                              </th>
                            ),
                            td: ({ children }) => (
                              <td className="p-4 border-b border-white/10 text-slate-300 text-sm">
                                {children}
                              </td>
                            )
                          }}
                        >
                          {whiteboardNotes}
                        </Markdown>
                     </motion.div>
                   </AnimatePresence>
                </div>
             )}

             {/* Feedback Overlay */}
             <AnimatePresence>
               {showFeedback && (
                 <motion.div 
                   initial={{ opacity: 0, y: 50 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: 50 }}
                   className="absolute bottom-8 right-8 w-80 bg-slate-900/90 backdrop-blur-2xl border border-white/10 p-6 rounded-[2rem] shadow-3xl z-40"
                 >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xs font-black uppercase tracking-widest text-blue-400">Class Feedback</h3>
                      {!feedbackSubmitted && (
                        <button onClick={() => setShowFeedback(false)} className="text-slate-500 hover:text-white transition-colors">
                          <i className="fas fa-times"></i>
                        </button>
                      )}
                    </div>

                    {feedbackSubmitted ? (
                      <div className="text-center py-4">
                        <i className="fas fa-check-circle text-green-500 text-3xl mb-3"></i>
                        <p className="text-sm font-bold">Feedback Received!</p>
                        <p className="text-[10px] text-slate-500 uppercase mt-1">Improving Neural Models...</p>
                      </div>
                    ) : (
                      <form onSubmit={submitFeedback} className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Quality</label>
                          <div className="flex justify-between">
                            {[1, 2, 3, 4, 5].map(v => (
                              <button 
                                key={v}
                                type="button"
                                onClick={() => setFeedbackData(prev => ({ ...prev, quality: v }))}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold border transition-all ${feedbackData.quality === v ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-slate-500 hover:bg-white/10'}`}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Relevance</label>
                          <div className="flex justify-between">
                            {[1, 2, 3, 4, 5].map(v => (
                              <button 
                                key={v}
                                type="button"
                                onClick={() => setFeedbackData(prev => ({ ...prev, relevance: v }))}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold border transition-all ${feedbackData.relevance === v ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-slate-500 hover:bg-white/10'}`}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Comments (Optional)</label>
                          <textarea 
                            value={feedbackData.comments}
                            onChange={(e) => setFeedbackData(prev => ({ ...prev, comments: e.target.value }))}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500/50 min-h-[60px]"
                            placeholder="Help us improve..."
                          />
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
          </div>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="fixed bottom-0 left-0 right-0 h-8 bg-slate-900 border-t border-white/5 px-6 flex items-center justify-between z-30">
        <div className="flex items-center gap-6 text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">
           <span>Engine: Gemini 1.5 Flash</span>
           <span>Mode: Virtual Educator 2.4</span>
           <span>Status: Secure Link Established</span>
        </div>
        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">
          TutorNode Neural Academy &copy; 2026
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
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
      `}} />
    </div>
  );
}

