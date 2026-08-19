import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import DOMPurify from 'dompurify';
import { TEACHER_CHARACTERS, TeacherCharacter } from '../lib/characters';
import { InteractiveDiagram } from './InteractiveDiagram';

interface VideoSmartboardProps {
  videoUrl: string;
  isPlaying: boolean;
  currentSlideIndex: number;
  slidesCount: number;
  currentSlideContent: string;
  whiteboardNotes: string;
  lessonSegments: any[];
  teacherDialogue: string;
  showSubtitles?: boolean;
  onTogglePlay: (play: boolean) => void;
  diagramUrl?: string | null;
  diagramSvg?: string | null;
  isGenerating?: boolean;
  generationProgress?: number;
  isCinematicMode?: boolean;
  onExitCinematic?: () => void;
  onHighlightAsk?: (text: string) => void;
  onQuizStart?: () => void;
  language?: "en" | "sw";
  teachingMode?: "text" | "video";
  onTeachingModeChange?: (mode: "text" | "video") => void;
  onGenerateVideo?: () => Promise<void>;
  selectedTeacher?: any;
  onSelectTeacher?: (character: any) => void;
  classTargetDuration?: number;
  videoComingSoon?: boolean;
  teachingTechnique?: {
    id: string;
    name: string;
    subtitle: string;
    icon: string;
    color: string;
    badgeBg: string;
    description: string;
  } | null;
}

export const VideoSmartboard: React.FC<VideoSmartboardProps> = ({
  videoUrl,
  isPlaying,
  currentSlideIndex,
  slidesCount,
  currentSlideContent,
  whiteboardNotes,
  lessonSegments,
  teacherDialogue,
  showSubtitles,
  onTogglePlay,
  diagramUrl,
  diagramSvg,
  isGenerating,
  generationProgress,
  isCinematicMode,
  onExitCinematic,
  onHighlightAsk,
  onQuizStart,
  language = 'en',
  teachingMode = 'text',
  onTeachingModeChange,
  onGenerateVideo,
  selectedTeacher,
  onSelectTeacher,
  classTargetDuration = 15,
  videoComingSoon = false,
  teachingTechnique
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [sessionTime, setSessionTime] = useState(0);
  const [segmentTime, setSegmentTime] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const [selectionInfo, setSelectionInfo] = useState<{ text: string; x: number; y: number } | null>(null);

  // Constants
  const isMasterclassVideo = useMemo(() => videoUrl?.includes('/videos/') && !videoUrl?.includes('placeholder.mp4'), [videoUrl]);
  const showVideoTrack = useMemo(() => teachingMode === 'video' && isMasterclassVideo, [teachingMode, isMasterclassVideo]);
  // Memoize the heavy Markdown render
  const renderedMarkdown = useMemo(() => {
    const content = lessonSegments.length > 0 
      ? lessonSegments[currentSlideIndex]?.content 
      : (currentSlideContent || whiteboardNotes);
    return <Markdown>{content}</Markdown>;
  }, [currentSlideIndex, lessonSegments, currentSlideContent, whiteboardNotes]);

  // Robust Timer Synchronization using requestAnimationFrame
  const lastTickTimestampRef = useRef<number>(0);

  useEffect(() => {
    let rafId: number;

    const runTimers = (timestamp: number) => {
      if (!lastTickTimestampRef.current) {
        lastTickTimestampRef.current = timestamp;
      }

      const elapsed = timestamp - lastTickTimestampRef.current;

      if (elapsed >= 1000) {
        setSessionTime(prev => prev + 1);
        setSegmentTime(prev => prev + 1);
        lastTickTimestampRef.current = timestamp;
      }

      rafId = requestAnimationFrame(runTimers);
    };

    if (isPlaying) {
      rafId = requestAnimationFrame(runTimers);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      lastTickTimestampRef.current = 0;
    };
  }, [isPlaying]);

  useEffect(() => {
    setSegmentTime(0);
  }, [currentSlideIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => setDuration(video.duration);
    const handleLoadStart = () => setIsVideoLoading(true);
    const handleWaiting = () => setIsVideoLoading(true);
    const handleCanPlay = () => setIsVideoLoading(false);
    const handlePlaying = () => setIsVideoLoading(false);
    
    // Reset error when URL changes
    setVideoError(false);

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateDuration);
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('playing', handlePlaying);

    const handleError = () => {
      setIsVideoLoading(false);
      setVideoError(true);
      console.error("Neural stream connection failed.");
    };

    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateDuration);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleError);
    };
  }, [videoUrl]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setIsMuted(newVolume === 0);
    }
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (videoRef.current) {
      videoRef.current.muted = newMuted;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(e => console.warn("Video play interrupted:", e));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, videoUrl]);

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionInfo(null);
      return;
    }

    const text = selection.toString().trim();
    if (text.length > 3) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();

      if (containerRect) {
        setSelectionInfo({
          text,
          x: rect.left - containerRect.left + (rect.width / 2),
          y: rect.top - containerRect.top - 10
        });
      }
    } else {
      setSelectionInfo(null);
    }
  };

  const handleAskMwalimu = () => {
    if (selectionInfo && onHighlightAsk) {
      onHighlightAsk(selectionInfo.text);
      setSelectionInfo(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectionInfo && !(e.target as HTMLElement).closest('.highlight-ask-tooltip')) {
        // Delay clearing to allow the button click to register
        setTimeout(() => {
          setSelectionInfo(null);
          window.getSelection()?.removeAllRanges();
        }, 100);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectionInfo]);

  return (
    <div 
      ref={containerRef}
      onMouseUp={handleMouseUp}
      className={`relative group overflow-hidden transition-all duration-700 flex flex-col ${isCinematicMode ? 'fixed inset-0 z-[60] bg-[#020617]' : 'h-full w-full'}`}
    >
      {/* Classroom Wall Texture (Standard Mode) */}
      {!isCinematicMode && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute inset-0 bg-[#e0d4c3]/10"></div>
          <div className="absolute inset-0 opacity-5 bg-[url('https://www.transparenttextures.com/patterns/pinstriped-suit.png')]"></div>
        </div>
      )}

      {/* The Blackboard Container */}
      <div className={`relative flex flex-1 flex-col transition-all duration-1000 overflow-hidden ${isCinematicMode ? 'w-full h-full' : 'w-full h-full bg-[#1a2f23] border-[16px] border-[#4a3728] shadow-inner'}`}>
        
        {/* Chalkboard Texture (Standard Mode) */}
        {!isCinematicMode && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30 z-0">
            <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/chalkboard.png')]"></div>
            <div className="absolute inset-0" style={{ 
              backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.05) 0%, transparent 70%)',
              filter: 'blur(40px)'
            }}></div>
          </div>
        )}
      {/* Neural stream error state */}
      {videoError && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90 p-8 text-center">
          <i className="fas fa-exclamation-triangle text-red-500 text-4xl mb-6"></i>
          <h3 className="text-xl font-bold text-white uppercase tracking-widest mb-2 font-mono">Neural_Connection_Severed</h3>
          <p className="text-slate-400 text-xs max-w-xs font-mono uppercase tracking-wider mb-8">
            The uplink to the video masterclass cluster has encountered a fatal synchronization error.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all"
          >
            Re-establish Uplink
          </button>
        </div>
      )}

      {/* Background Video or Cinematic Backdrop */}
      {isVideoLoading && showVideoTrack && (
        <div className={`absolute inset-0 z-[70] flex items-center justify-center bg-black/60`}>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4"
          >
            <div className={`w-12 h-12 border-4 ${isCinematicMode ? 'border-blue-500/20 border-t-blue-500' : 'border-blue-500/20 border-t-blue-500'} rounded-full animate-spin`}></div>
            <span className={`text-[10px] font-black uppercase tracking-[0.3em] font-mono ${isCinematicMode ? 'text-blue-400' : 'text-blue-400'}`}>
              Buffering_Neural_Stream
            </span>
          </motion.div>
        </div>
      )}
      {showVideoTrack ? (
        <div 
          onClick={() => onTogglePlay(!isPlaying)}
          className="absolute inset-0 z-[5] bg-[#112217] cursor-pointer group/video"
        >
          <video 
            ref={videoRef}
            key={videoUrl}
            src={videoUrl}
            autoPlay 
            playsInline
            className={`absolute inset-0 w-full h-full object-contain bg-[#112217] transition-opacity duration-1000 opacity-100`}
            onEnded={() => {
              if (isMasterclassVideo) {
                onTogglePlay(false);
              }
            }}
          />
          
          {/* Giant beautiful centered play button overlay if paused */}
          <AnimatePresence>
            {!isPlaying && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[2px] transition-colors group-hover/video:bg-black/50"
              >
                <div className="w-20 h-20 rounded-full bg-blue-600 border-4 border-blue-400 text-white flex items-center justify-center shadow-[0_0_50px_rgba(37,99,235,0.6)] group-hover/video:scale-110 transition-transform">
                  <i className="fas fa-play text-2xl ml-1"></i>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Subtle Overlay to match board feel if not cinematic */}
          {!isCinematicMode && (
            <div className="absolute inset-0 pointer-events-none border-[16px] border-[#4a3728] shadow-[inset_0_0_100px_rgba(0,0,0,0.5)] z-10"></div>
          )}
        </div>
      ) : teachingMode === "video" && !isMasterclassVideo ? (
        <div className="absolute inset-0 flex items-center justify-center p-4 md:p-8 z-20 pointer-events-auto bg-[#0a0f1d]/95 overflow-y-auto">
          <div className="w-full max-w-4xl bg-[#111827]/90 rounded-3xl border border-white/10 p-6 md:p-8 backdrop-blur-xl shadow-[0_30px_100px_rgba(0,0,0,0.8)] flex flex-col md:flex-row gap-6 md:gap-10">
            {/* Left side: Avatar selection & details */}
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20 text-blue-400">
                    <i className="fas fa-video text-xl"></i>
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-wider">
                      {language === 'sw' ? 'TENGENEZA VIDEO YA AI AVATAR' : 'SYNTHESIZE AI AVATAR VIDEO'}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {language === 'sw' 
                        ? 'Geuza masomo na muhtasari kuwa darasa kamili ya video papo hapo.' 
                        : 'Instantly transform written lesson modules into a cinematic interactive video class.'}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed mb-6 font-mono border-l-2 border-blue-500/40 pl-3">
                  {language === 'sw'
                    ? 'Mfumo wetu wa neva unatumia teknolojia ya hali ya juu ya Text-to-Video na miondoko ya sura (AI Avatars) ili kutengeneza darasa linalofundishwa na mwalimu uliyemchagua.'
                    : 'Our text-to-video pipeline converts whiteboard slides and animated interactive diagrams into a professional teaching masterclass led by your chosen neural instructor.'}
                </p>

                {/* Teacher selected preview card */}
                {selectedTeacher && (
                  <div className="bg-slate-900/90 border border-white/5 p-4 rounded-2xl flex items-center gap-4 mb-6">
                    <img 
                      src={selectedTeacher.imageUrl} 
                      alt={selectedTeacher.name} 
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-blue-500 shadow-lg"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-white uppercase">{selectedTeacher.name}</span>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold text-white uppercase ${selectedTeacher.gender === 'male' ? 'bg-blue-600' : 'bg-pink-600'}`}>
                          {selectedTeacher.gender === 'male' ? (language === 'sw' ? 'MUME' : 'MALE') : (language === 'sw' ? 'MKE' : 'FEMALE')}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                        {selectedTeacher.appearance}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Video Generation Trigger button */}
              <div className="mt-4 pt-4 border-t border-white/5">
                {videoComingSoon ? (
                  <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-center space-y-3">
                    <div className="flex items-center justify-center gap-2 text-amber-400">
                      <i className="fas fa-tools text-sm animate-bounce"></i>
                      <span className="text-xs font-black uppercase tracking-widest leading-none">
                        {language === 'sw' ? 'MABORESHO YA MFUMO - INAKUJA HIVI KARIBUNI' : 'SYSTEM MAINTENANCE - COMING SOON'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                      {language === 'sw' 
                        ? 'Tunaongeza uwezo wa remote GPU clusters kuwezesha high-fidelity AI video synthesis haraka na thabiti zaidi. Toleo hili litakuwa tayari hivi karibuni kabisa!' 
                        : 'Our engineering team is currently upgrading remote high-fidelity video render nodes on our remote cluster for faster generation stability. This premium feature will launch soon!'}
                    </p>
                    <div className="pt-1">
                      <span className="inline-block text-[10px] font-black uppercase tracking-widest px-3.5 py-1.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/15">
                        {language === 'sw' ? 'Sajiliwa kwa Jaribio la Mapema' : 'Early Beta Access Enrolled'}
                      </span>
                    </div>
                  </div>
                ) : isGenerating ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-mono text-blue-400 uppercase">
                      <span>{language === 'sw' ? 'UCHANGANUAN_NEVA_ACTIVE' : 'SYNTHESIS_IN_PROGRESS'}</span>
                      <span>{generationProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-white/5">
                      <div 
                        className="bg-blue-500 h-full rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(37,99,235,0.8)]"
                        style={{ width: `${generationProgress}%` }}
                      ></div>
                    </div>
                    <p className="text-[10px] font-mono text-center text-slate-400 animate-pulse">
                      {language === 'sw' ? 'Tafadhali subiri kurekodi na kupakua...' : 'Orchestrating GPU clusters to render teacher video segments...'}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={onGenerateVideo}
                    disabled={lessonSegments.length === 0}
                    className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-2xl ${
                      lessonSegments.length === 0 
                        ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-500 border border-blue-400/20 hover:shadow-[0_0_30px_rgba(37,99,235,0.4)]'
                    }`}
                  >
                    <i className="fas fa-magic"></i>
                    <span>
                      {language === 'sw' 
                        ? 'TENGENEZA DARASA LA VIDEO SASA' 
                        : 'GENERATE INTERACTIVE VIDEO CLASS'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Right side: Character avatar grid selection */}
            <div className="w-full md:w-[380px] flex flex-col border-t md:border-t-0 md:border-l border-white/10 pt-6 md:pt-0 md:pl-8">
              <h3 className="text-xs font-black text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <i className="fas fa-users-cog text-blue-400"></i>
                <span>{language === 'sw' ? 'CHAGUA MWALIMU WA AI' : 'SELECT AI AVATAR TEACHER'}</span>
              </h3>
              
              <div className="grid grid-cols-3 gap-3 overflow-y-auto max-h-[280px] pr-2 custom-scrollbar">
                {TEACHER_CHARACTERS.map((char) => {
                  const isSelected = selectedTeacher?.id === char.id;
                  return (
                    <button
                      key={char.id}
                      onClick={() => onSelectTeacher?.(char)}
                      className={`relative flex flex-col items-center p-2 rounded-xl transition-all border group ${
                        isSelected 
                          ? 'bg-blue-500/10 border-blue-500/80 shadow-[0_0_15px_rgba(37,99,235,0.2)]' 
                          : 'bg-slate-900/50 border-white/5 hover:border-white/20 hover:bg-slate-900'
                      }`}
                    >
                      <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-white/15">
                        <img 
                          src={char.imageUrl} 
                          alt={char.name} 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-blue-600/20 flex items-center justify-center">
                            <i className="fas fa-check-circle text-white text-xs"></i>
                          </div>
                        )}
                        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full flex items-center justify-center text-[6px] border border-slate-950 ${char.gender === 'male' ? 'bg-blue-500' : 'bg-pink-500'}`}>
                          <i className={`fas ${char.gender === 'male' ? 'fa-mars' : 'fa-venus'} text-white`}></i>
                        </span>
                      </div>
                      <span className="text-[9px] font-bold text-white mt-2 truncate max-w-full">
                        {char.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 mt-4 leading-relaxed font-mono">
                {language === 'sw'
                  ? '* Mwalimu uliyemchagua ndiye atakayeongea kulingana na muundo wa sauti tanzu.'
                  : '* The selected teacher will narrate and synthesize with accurate visual representations.'}
              </p>
            </div>
          </div>
        </div>
      ) : isCinematicMode ? (
        <div className="absolute inset-0">
          <motion.div 
            animate={{ 
              scale: [1, 1.1, 1],
              opacity: [0.1, 0.2, 0.1]
            }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,#1e3a8a_0%,transparent_70%)]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:60px_60px]"></div>
          
          {/* Holographic scanning lines for cinematic mode */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
             <motion.div 
               animate={{ y: ['-100%', '200%'] }}
               transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
               className="absolute w-full h-[30%] bg-gradient-to-b from-transparent via-blue-500/5 to-transparent skew-y-12"
             />
          </div>
        </div>
      ) : (
        <div className="absolute inset-0">
           <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:32px_32px] opacity-40"></div>
           <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f080_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f080_1px,transparent_1px)] bg-[size:128px_128px]"></div>
           
           {/* Smartboard Brackets in Standard Mode */}
           <div className="absolute top-8 left-8 w-12 h-12 border-t border-l border-slate-200"></div>
           <div className="absolute bottom-8 right-8 w-12 h-12 border-b border-r border-slate-200"></div>
        </div>
      )}

      
      {/* Generating Overlay */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`absolute inset-0 z-50 ${isCinematicMode ? 'bg-slate-950/90' : 'bg-white/95'} flex flex-col items-center justify-center p-12 text-center`}
          >
            <div className="relative mb-12">
              <div className={`absolute inset-0 ${isCinematicMode ? 'bg-blue-500/20' : 'bg-blue-200/40'} blur-[80px] rounded-full animate-pulse`}></div>
              <div className={`relative w-48 h-48 border-[1px] ${isCinematicMode ? 'border-blue-500/30' : 'border-blue-500/10'} rounded-full flex items-center justify-center`}>
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-t-2 border-blue-500 rounded-full"
                ></motion.div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-5xl font-black text-blue-600 font-mono tracking-tighter">
                    {generationProgress}%
                  </span>
                  <span className={`text-[10px] font-black ${isCinematicMode ? 'text-blue-400' : 'text-blue-500'} uppercase tracking-[0.3em]`}>Neural Link</span>
                </div>
              </div>
            </div>
            
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <h3 className={`text-3xl font-black ${isCinematicMode ? 'text-white' : 'text-slate-900'} uppercase tracking-[0.4em]`}>NEURAL_SYNTHESIS_ACTIVE</h3>
              <p className={`${isCinematicMode ? 'text-blue-100/40' : 'text-slate-400'} max-w-md text-center text-xs leading-relaxed font-mono uppercase tracking-[0.2em]`}>
                Orchestrating high-fidelity cinematic masterclass in the OMNITUTOR neural cluster.
                <br/>[STATUS: SYNCING_BRAINWAVES]
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Classroom HUD Elements */}
      {!isCinematicMode && (
        <div className="absolute inset-0 pointer-events-none z-10">
          {/* Wooden Frame for the Blackboard */}
          <div className="absolute inset-x-0 top-0 h-4 bg-[#4a3728] shadow-[inset_0_-2px_10px_rgba(0,0,0,0.5)] z-20"></div>
          <div className="absolute inset-x-0 bottom-0 h-8 bg-[#5d4037] shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] z-20 flex items-center justify-center gap-8">
             {/* Chalk holder effect */}
             <div className="w-24 h-2 bg-white/20 rounded-full"></div>
             <div className="w-12 h-4 bg-yellow-100/10 rounded-sm"></div>
             <div className="w-16 h-3 bg-blue-100/10 rounded-sm"></div>
          </div>
          <div className="absolute inset-y-0 left-0 w-4 bg-[#4a3728] shadow-[inset_-2px_0_10px_rgba(0,0,0,0.5)] z-20"></div>
          <div className="absolute inset-y-0 right-0 w-4 bg-[#4a3728] shadow-[inset_2px_0_10px_rgba(0,0,0,0.5)] z-20"></div>

          {/* Classroom Labels */}
          <div className="absolute top-10 left-10 flex flex-col gap-1 items-start z-30 pointer-events-auto">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em] font-serif italic">Mwalimu Bora's Lecture Room</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500/50 animate-pulse"></div>
              <span className="text-[8px] font-mono text-white/30 uppercase tracking-[0.2em]">Period 1: Deep Learning</span>
            </div>
          </div>

          {/* Teacher's Desk (Perspective) */}
          <div className="absolute bottom-0 inset-x-0 h-16 bg-[#3e2723] z-50 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] border-t-4 border-[#5d4037] flex items-center justify-between px-12">
            <div className="flex gap-4 items-center">
              <div className="w-12 h-2 bg-black/20 rounded-full"></div>
              <div className="w-32 h-1 bg-white/5 rounded-full"></div>
            </div>
            {/* Textbook on desk */}
            <div className="w-40 h-12 bg-[#8d6e63] rounded-sm transform -skew-x-12 flex items-center justify-center shadow-lg border border-[#ac897e]">
               <div className="w-32 h-[1px] bg-[#5d4037]/20 my-1"></div>
            </div>
            <div className="flex gap-2">
               <div className="w-4 h-4 rounded-full bg-blue-500/10 border border-blue-500/20"></div>
               <div className="w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/20"></div>
            </div>
          </div>
        </div>
      )}

      {/* Cinematic HUD Elements */}
      {isCinematicMode && !isMasterclassVideo && (
        <div className="absolute inset-0 pointer-events-none z-10">
          {/* Corner HUD Brackets */}
          <div className="absolute top-10 left-10 w-24 h-24 border-t-2 border-l-2 border-blue-500/40 rounded-tl-3xl opacity-50"></div>
          <div className="absolute top-10 right-10 w-24 h-24 border-t-2 border-r-2 border-blue-500/40 rounded-tr-3xl opacity-50"></div>
          <div className="absolute bottom-10 left-10 w-24 h-24 border-b-2 border-l-2 border-blue-500/40 rounded-bl-3xl opacity-50"></div>
          <div className="absolute bottom-10 right-10 w-24 h-24 border-b-2 border-r-2 border-blue-500/40 rounded-br-3xl opacity-50"></div>

          {/* Technical Data Readouts */}
          <div className="absolute top-12 left-40 space-y-2">
             <div className="flex items-center gap-2">
                <div className="w-1 h-1 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_#ef4444]"></div>
                <span className="text-[10px] font-black text-white/50 uppercase tracking-widest font-mono">LIVE_NEURAL_LINK</span>
             </div>
             <div className="flex flex-col gap-1">
                <div className="text-[8px] font-mono text-blue-400 opacity-40">TX_RATE: 1.4GB/S // LINK_STABLE</div>
                <div className="text-[8px] font-mono text-cyan-400 flex items-center gap-2">
                   <span className="opacity-60">SESSION_TIME:</span>
                   <span className="font-bold">{formatTime(sessionTime)}</span>
                </div>
                <div className="text-[8px] font-mono text-emerald-400 flex items-center gap-2">
                   <span className="opacity-60">SEGMENT_TIME:</span>
                   <span className="font-bold">{formatTime(segmentTime)}</span>
                </div>
             </div>
          </div>

          <div className="absolute bottom-12 right-12 text-right">
             <div className="text-[10px] font-black text-white/50 uppercase tracking-[0.3em] font-mono mb-1">Mwalimu Bora Virtual Presence</div>
             <div className="flex items-center justify-end gap-2 text-blue-400 font-mono text-[8px] opacity-40">
                <span>COORD: 51.5074° N, 0.1278° W</span>
                <span className="w-2 h-[1px] bg-blue-500/40"></span>
                <span>SYNC_VER: 2.0.4</span>
             </div>
          </div>
        </div>
      )}
      
      {/* Raise Hand Button */}
      {!isGenerating && (
        <div className={`absolute bottom-12 left-6 md:left-12 z-40 pointer-events-auto transition-all duration-500 ${isCinematicMode && isPlaying ? 'opacity-40 hover:opacity-100' : 'opacity-100'}`}>
          <motion.button
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onHighlightAsk?.("Raising hand for assistance")}
            className="group flex flex-col items-center gap-2"
          >
            <div className={`p-4 ${isCinematicMode ? 'bg-blue-600/20 border-blue-400/50 backdrop-blur-md' : 'bg-emerald-600 border-emerald-400/50'} hover:${isCinematicMode ? 'bg-blue-500/30' : 'bg-emerald-500'} rounded-full shadow-2xl transition-all border-4`}>
              <i className={`fas fa-hand-paper text-white ${isCinematicMode ? 'text-blue-400' : 'text-white'} text-xl`}></i>
            </div>
            <span className={`text-[10px] font-black ${isCinematicMode ? 'text-blue-400/60 group-hover:text-blue-300' : 'text-white/60 group-hover:text-emerald-400'} uppercase tracking-[0.2em] transition-colors`}>Raise Hand</span>
          </motion.button>
        </div>
      )}

      {/* Cinematic Overlays */}
      <div className={`absolute inset-0 ${isCinematicMode ? 'bg-[radial-gradient(circle_at_50%_40%,transparent_20%,rgba(0,0,0,0.8)_100%)]' : 'bg-transparent'} pointer-events-none`}></div>
      <div className={`absolute inset-0 ${isCinematicMode ? 'bg-blue-900/10 mix-blend-overlay' : 'bg-white/5'} pointer-events-none`}></div>
      
      {/* Contextual Neural Link Tooltip */}
      <AnimatePresence>
        {selectionInfo && (
          <motion.button
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{ 
              left: selectionInfo.x, 
              top: selectionInfo.y,
              transform: 'translateX(-50%) translateY(-100%)'
            }}
            onClick={handleAskMwalimu}
            className="absolute z-[100] highlight-ask-tooltip flex items-center gap-2 px-4 py-2 bg-black/80 backdrop-blur-xl border border-blue-500/50 rounded-full shadow-[0_0_20px_rgba(59,130,246,0.4)] text-blue-400 font-black text-[10px] uppercase tracking-widest hover:bg-blue-600/20 hover:border-blue-400 transition-all active:scale-95 group"
          >
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <i className="fas fa-hand-paper text-xs"></i>
            </motion.div>
            <span>Raise Hand</span>
            <div className="absolute inset-0 rounded-full border border-blue-400/20 animate-pulse"></div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Exit Cinematic Mode */}
      {isCinematicMode && (
        <div className="absolute top-10 left-10 z-50">
          <button 
            onClick={onExitCinematic}
            aria-label="Exit Cinematic Mode"
            className="flex items-center gap-3 bg-red-500/10 backdrop-blur-md border border-red-500/20 px-5 py-3 rounded-2xl transition-all hover:bg-red-500/20 active:scale-95 group shadow-2xl"
          >
            <i className="fas fa-times text-red-500 text-xs" aria-hidden="true"></i>
            <span className="text-[9px] font-black text-red-100 uppercase tracking-[0.2em]">
              EXIT CINEMATIC
            </span>
          </button>
        </div>
      )}

      {/* Floating Holographic Particles/Equations */}
      {isCinematicMode && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={`holographic-particle-${i}`}
              initial={{ x: "-10%", y: `${10 + i * 8}%`, opacity: 0 }}
              animate={{ 
                x: "110%", 
                opacity: [0, 1, 1, 0],
                y: [`${10 + i * 8}%`, `${15 + i * 8}%`, `${10 + i * 8}%`]
              }}
              transition={{ 
                duration: 20 + i * 3, 
                repeat: Infinity, 
                delay: i * 2,
                ease: "linear"
              }}
              className="absolute whitespace-nowrap text-blue-400 font-mono text-[9px] blur-[0.5px] tracking-widest"
            >
              {i % 3 === 0 
                ? "NEURAL_MASTERCLASS_STREAMING" 
                : i % 3 === 1 
                  ? "HIGH_FIDELITY_CINEMATIC_LINK" 
                  : "MWALIMU_BORA_UNIVERSAL_ACADEMY"}
            </motion.div>
          ))}
        </div>
      )}      {/* Main Boards Layer (Content behind HUD) */}
      <div className="w-full max-w-6xl mx-auto px-4 md:px-10 h-full flex flex-col justify-center pointer-events-none relative z-20">
          {/* Current Slide Content as a HUD overlay */}
          <AnimatePresence mode="wait">
            {((isPlaying || whiteboardNotes) && teachingMode === "text") && (
              <motion.div
                key={currentSlideIndex}
                initial={{ opacity: 0, y: 30, scale: isCinematicMode ? 0.9 : 0.95 }}
                animate={{ 
                  opacity: 1, 
                  y: 0, 
                  scale: 1,
                  x: isCinematicMode ? [0, 5, -5, 0] : 0,
                }}
                transition={{
                  scale: { duration: isCinematicMode ? 10 : 0.5 },
                  x: { duration: 20, repeat: Infinity, ease: "linear" }
                }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                className={`${isCinematicMode ? 'bg-blue-950/85 border-white/20 shadow-[0_30px_100px_rgba(0,0,0,0.9)]' : 'bg-transparent shadow-none'} p-4 md:p-6 rounded-[2rem] pointer-events-auto relative flex flex-col max-h-full w-full`}
              >
                {isCinematicMode && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"></div>}
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 md:mb-6 shrink-0 gap-3 border-b border-white/5 pb-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className={`px-3 py-1 ${isCinematicMode ? 'bg-blue-500/20 border-blue-500/30' : 'bg-white/5 border-white/10'} rounded-full border`}>
                         <span className={`text-[10px] font-mono font-black ${isCinematicMode ? 'text-blue-300' : 'text-slate-300'}`}>SLIDE {currentSlideIndex + 1} OF {slidesCount}</span>
                      </div>
                    </div>
                    {/* Active teaching blink status */}
                    <div className="flex items-center gap-1.5 text-[9px] font-mono tracking-wider text-emerald-400">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                      </span>
                      <span>{language === "sw" ? "MWALIMU VIRTUAL YUPO..." : "LECTURE IN PROGRESS..."}</span>
                    </div>
                  </div>

                  {/* 15-Minute Class Duration Track HUD */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-2xl border ${sessionTime >= (classTargetDuration * 60) ? 'bg-[#10b981]/15 border-[#10b981]/30 text-emerald-400' : 'bg-black/40 border-white/5 text-slate-300'} text-[10px] font-mono`}>
                      <i className={`fas ${sessionTime >= (classTargetDuration * 60) ? 'fa-check-circle text-emerald-400 animate-bounce' : 'fa-clock text-blue-400 animate-pulse'}`}></i>
                      <span className="font-bold">{language === "sw" ? "Saa Darasa" : "Session Watch"}:</span>
                      <span className="font-black text-white">{formatTime(sessionTime)}</span>
                      <span className="opacity-40">/</span>
                      <span className="font-bold opacity-80">{formatTime(classTargetDuration * 60)}</span>
                    </div>

                    {/* Progress Bar slider indicator */}
                    <div className="w-16 md:w-24 bg-slate-800/80 rounded-full h-1.5 overflow-hidden border border-white/5 relative flex">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${sessionTime >= (classTargetDuration * 60) ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'}`}
                        style={{ width: `${Math.min(100, (sessionTime / (classTargetDuration * 60)) * 100)}%` }}
                      ></div>
                    </div>

                    {/* Target Standard Tag */}
                    {sessionTime >= (classTargetDuration * 60) ? (
                      <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-[#10b981]/25 text-emerald-400 border border-emerald-500/30 animate-pulse">
                        {language === "sw" ? "SIFA IMETIMIA ✓" : "STANDARD MET ✓"}
                      </span>
                    ) : (
                      <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-550/20">
                        {language === "sw" ? "LENGO: 15MIN" : "TARGET: 15MIN"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 mb-4 pb-20 md:pb-32">
                  {/* Conditional centering: center only if it's short content (a slide) and no diagram */}
                  <div className={`min-h-full flex flex-col ${(diagramUrl || diagramSvg) ? 'lg:flex-row lg:items-center' : ((lessonSegments[currentSlideIndex]?.content || currentSlideContent || whiteboardNotes).length < 500 ? 'items-center justify-center' : 'items-start justify-start')} gap-12`}>
                    <motion.div 
                      key={currentSlideIndex}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={`relative z-10 flex-1 w-full prose ${isCinematicMode ? 'prose-invert font-sans' : 'prose-invert font-serif font-medium chalk-text'} max-w-none 
                      prose-h1:text-center prose-h1:text-4xl md:prose-h1:text-5xl prose-h1:font-black ${isCinematicMode ? 'text-white' : 'text-white/90 text-shadow-sm shadow-white/20'} prose-h1:mb-10 prose-h1:tracking-tight prose-h1:border-b-4 ${isCinematicMode ? 'border-blue-600' : 'border-emerald-600/30'} prose-h1:pb-6
                      prose-h2:${isCinematicMode ? 'text-blue-500' : 'text-emerald-400'} prose-h2:text-2xl md:prose-h2:text-3xl prose-h2:font-bold prose-h2:mt-12 prose-h2:mb-8 prose-h2:uppercase prose-h2:tracking-wider
                      prose-h3:${isCinematicMode ? 'text-blue-400' : 'text-emerald-300'} prose-h3:text-xl md:prose-h3:text-2xl prose-h3:font-semibold prose-h3:mt-10 prose-h3:mb-6
                      ${isCinematicMode ? 'prose-p:text-blue-50/90' : 'prose-p:text-white/80'} prose-p:text-xl md:prose-p:text-2xl prose-p:leading-relaxed
                      ${isCinematicMode ? 'prose-li:text-white/90' : 'prose-li:text-white/70'} prose-li:text-xl md:prose-li:text-2xl prose-li:mb-4
                      prose-table:w-full prose-table:border-collapse prose-th:${isCinematicMode ? 'bg-blue-600/10 text-blue-500' : 'bg-white/5 text-emerald-400'} prose-th:p-4 prose-th:text-left prose-td:p-4 prose-td:border prose-td:border-white/10
                      prose-strong:${isCinematicMode ? 'text-blue-500' : 'text-emerald-400'} shadow-none overflow-hidden`}
                    >
                      {isCinematicMode && (
                        <div className="absolute inset-0 pointer-events-none opacity-5 -z-10" 
                             style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(59, 130, 246, 0.4) 1px, transparent 0)', backgroundSize: '24px 24px' }}>
                        </div>
                      )}
                      {renderedMarkdown}
                    </motion.div>

                  {(diagramSvg || diagramUrl) && (
                    <div className="flex-1 w-full max-w-2xl">
                      <InteractiveDiagram
                        svgCode={diagramSvg}
                        imageUrl={diagramUrl}
                        topic={lessonSegments[currentSlideIndex]?.content || currentSlideContent || whiteboardNotes}
                        language={language}
                        isCinematicMode={isCinematicMode}
                        onAskMwalimu={onHighlightAsk}
                      />
                    </div>
                  )}
                  </div>
                </div>


              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Chalk tray at the bottom */}
          {!isCinematicMode && (
            <div className="absolute bottom-0 inset-x-0 h-4 bg-[#3e2723] z-[60] border-t border-[#5d4037] flex items-center justify-center gap-4">
               <div className="w-8 h-1 bg-white/20 rounded-full"></div>
               <div className="w-12 h-1 bg-emerald-500/20 rounded-full"></div>
            </div>
          )}
        </div>

      {/* Primary HUD Overlay Layer (Buttons on top) */}
      <div className="absolute inset-0 p-2 md:p-6 flex flex-col pointer-events-none z-[80]">
        <div className={`absolute top-2 md:top-6 right-2 md:right-6 pointer-events-auto flex flex-wrap justify-end items-center gap-2 md:gap-3 transition-opacity duration-500 ${isCinematicMode && isPlaying ? 'opacity-40 hover:opacity-100' : 'opacity-100'}`}>
          {/* Mode Switcher Pill */}
          <div className="flex items-center gap-1 bg-slate-900/90 border border-white/10 p-1 rounded-2xl shadow-2xl backdrop-blur-md">
            <button
              onClick={() => onTeachingModeChange?.("text")}
              className={`px-3 md:px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all flex items-center gap-2 ${
                teachingMode === "text"
                  ? "bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <i className="fas fa-book-open"></i>
              <span>{language === "sw" ? "Maandishi" : "TEXT MODE"}</span>
            </button>
            <button
              onClick={() => onTeachingModeChange?.("video")}
              className={`px-3 md:px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all flex items-center gap-2 ${
                teachingMode === "video"
                  ? "bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <i className="fas fa-video animate-pulse"></i>
              <span>{language === "sw" ? "Video ya AI" : "VIDEO MODE"}</span>
            </button>
          </div>
          {showVideoTrack && (
            <div className={`flex items-center gap-2 md:gap-4 px-3 md:px-6 py-2 md:py-3 rounded-2xl border ${isCinematicMode ? 'bg-black/60 border-white/10' : 'bg-slate-900/90 border-white/10'} shadow-2xl min-w-[280px] md:min-w-[500px]`}>
              {/* Play/Pause inside the bar */}
              <button 
                onClick={() => onTogglePlay(!isPlaying)}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className={`${isCinematicMode ? 'text-blue-400' : 'text-blue-400'} hover:opacity-70 transition-opacity`}
              >
                <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'} text-xs`} aria-hidden="true"></i>
              </button>

              <span className={`text-[10px] font-mono font-bold ${isCinematicMode ? 'text-blue-400' : 'text-blue-400'}`}>
                {formatTime(currentTime)}
              </span>
              <input 
                type="range"
                min={0}
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1 bg-blue-500/20 appearance-none cursor-pointer rounded-full accent-blue-500"
              />
              <span className={`text-[10px] font-mono font-bold ${isCinematicMode ? 'text-blue-400' : 'text-blue-400'}`}>
                {formatTime(duration)}
              </span>
              
              {/* Volume Control */}
              <div className="flex items-center gap-3 ml-2 border-l border-white/10 pl-4">
                <button 
                  onClick={toggleMute}
                  aria-label={isMuted ? "Unmute video" : "Mute video"}
                  className={`${isCinematicMode ? 'text-white' : 'text-white'} hover:opacity-70 transition-opacity`}
                >
                  <i className={`fas ${isMuted || volume === 0 ? 'fa-volume-mute' : volume < 0.5 ? 'fa-volume-down' : 'fa-volume-up'} text-xs`} aria-hidden="true"></i>
                </button>
                <input 
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  aria-label="Volume"
                  className="w-16 h-1 bg-blue-500/20 appearance-none cursor-pointer rounded-full accent-blue-500"
                />
              </div>

              {/* Fullscreen Button */}
              <button 
                onClick={toggleFullscreen}
                aria-label="Toggle Fullscreen"
                className={`ml-2 ${isCinematicMode ? 'text-white' : 'text-white'} hover:opacity-70 transition-opacity`}
                title="Toggle Fullscreen"
              >
                <i className="fas fa-expand text-xs" aria-hidden="true"></i>
              </button>

              {/* Download Button */}
              <a 
                href={videoUrl} 
                download={`Masterclass_${Date.now()}.mp4`}
                className={`ml-2 ${isCinematicMode ? 'text-white' : 'text-white'} hover:opacity-70 transition-opacity flex items-center justify-center`}
                title="Download Masterclass"
              >
                <i className="fas fa-download text-xs"></i>
              </a>
            </div>
          )}

          {!showVideoTrack && (
            <button 
              onClick={() => onTogglePlay(!isPlaying)}
              aria-label={isPlaying ? 'Pause masterclass' : 'Resume masterclass'}
              className={`flex items-center gap-3 ${isCinematicMode ? 'bg-black/60 border-white/10' : 'bg-slate-900/90 border-white/10'} border px-5 py-3 rounded-2xl transition-all hover:opacity-80 active:scale-95 group shadow-2xl`}
            >
              <div className="relative flex items-center justify-center" aria-hidden="true">
                <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-blue-500 animate-pulse' : 'bg-red-500 shadow-[0_0_8px_#ef4444]'}`}></div>
                {isPlaying && <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-40"></div>}
              </div>
              <span className={`text-[9px] font-black ${isCinematicMode ? 'text-white' : 'text-white'} uppercase tracking-[0.2em]`}>
                {isPlaying ? 'PAUSE' : 'RESUME'}
              </span>
            </button>
          )}

          {onQuizStart && whiteboardNotes && !whiteboardNotes.includes("Welcome to OmniTutor") && (
            <button 
              onClick={onQuizStart}
              aria-label="Start interactive quiz"
              className={`flex items-center gap-3 ${isCinematicMode ? 'bg-emerald-650/40 border-emerald-555/40 text-emerald-300 hover:bg-emerald-600/50 hover:border-emerald-400/50' : 'bg-emerald-700 hover:bg-emerald-600 border-white/10 text-white'} border px-5 py-3 rounded-2xl transition-all active:scale-95 group shadow-2xl`}
            >
              <i className="fas fa-brain text-[10px]" aria-hidden="true"></i>
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">
                {language === 'sw' ? 'ANZA MTIHANI' : 'TAKE QUIZ'}
              </span>
            </button>
          )}

          {/* Dedicated Fullscreen Button */}
          <button 
            onClick={toggleFullscreen}
            aria-label="Toggle Fullscreen"
            className={`flex items-center justify-center w-10 md:w-12 h-10 md:h-12 rounded-2xl border transition-all active:scale-95 shadow-2xl ${isCinematicMode ? 'bg-black/60 border-white/10 text-white hover:bg-white/10' : 'bg-slate-900/90 border-white/10 text-white hover:bg-slate-800'}`}
            title="Toggle Fullscreen"
          >
            <i className={`fas ${document.fullscreenElement ? 'fa-compress' : 'fa-expand'} text-xs`} aria-hidden="true"></i>
          </button>
        </div>
      </div>
      </div>
    </div>
  );
};

