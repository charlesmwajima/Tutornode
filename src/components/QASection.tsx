import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface QASectionProps {
  currentTopic: string;
  currentSegment: { content: string; speech: string } | null;
  language: "en" | "sw";
  onClose: () => void;
  initialQuestion?: string;
  onAssistantSpeak?: (text: string, onEnd?: () => void) => void;
  onAnswerFinished?: () => void;
  onQuestionAsked?: () => void;
  intelLevel?: string;
  studyLevel?: string;
  teachingTechniqueId?: string;
  initialMessages?: Message[];
  isWaitingForContinue?: boolean;
  onWaitingForContinueChange?: (waiting: boolean) => void;
  isLessonEnded?: boolean;
}

export const QASection: React.FC<QASectionProps> = ({ 
  currentTopic, 
  currentSegment, 
  language,
  onClose,
  initialQuestion,
  onAssistantSpeak,
  onAnswerFinished,
  onQuestionAsked,
  intelLevel,
  studyLevel,
  teachingTechniqueId,
  initialMessages,
  isWaitingForContinue = false,
  onWaitingForContinueChange,
  isLessonEnded = false
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages || []);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastProcessedQuestion = useRef<string | null>(null);

  useEffect(() => {
    if (initialQuestion && initialQuestion !== lastProcessedQuestion.current) {
      lastProcessedQuestion.current = initialQuestion;
      processQuestion(initialQuestion);
    }
  }, [initialQuestion]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const processQuestion = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return;

    if (isWaitingForContinue) {
      const lower = userMessage.toLowerCase().trim();
      if (
        lower === 'yes' || 
        lower === 'y' || 
        lower.includes('continue') || 
        lower.includes('ndio') || 
        lower.includes('ndiyo') || 
        lower.includes('endelea') ||
        lower.includes('yes, continue') ||
        lower.includes('yes.')
      ) {
        onClose();
        return;
      } else {
        if (onWaitingForContinueChange) {
          onWaitingForContinueChange(false);
        }
      }
    }

    if (onQuestionAsked) onQuestionAsked();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/qa-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentTopic,
          currentSegment,
          language,
          messages,
          userMessage,
          intelLevel,
          studyLevel,
          teachingTechniqueId
        })
      });

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.error || `Server returned status ${res.status}`);
      }

      const resJson = await res.json();
      const answer = resJson.text || "I am currently processing your inquiry. Please re-state your question.";
      setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
      
      // Request Mwalimu to speak the answer
      if (onAssistantSpeak) {
        onAssistantSpeak(answer, () => {
          // Speak the continuation prompt after the main answer is read
          const continuePrompt = isLessonEnded
            ? (language === 'sw' ? "Je, nimejibu swali lako?" : "Have I answered your question?")
            : (language === 'sw' ? "Je, tuendelee na somo?" : "Should we continue with the lesson?");
          
          setMessages(prev => [...prev, { role: 'assistant', content: continuePrompt }]);
          
          onAssistantSpeak(continuePrompt, () => {
            if (onWaitingForContinueChange) {
              onWaitingForContinueChange(true);
            }
            if (onAnswerFinished) onAnswerFinished();
          });
        });
      } else {
        const continuePrompt = isLessonEnded
          ? (language === 'sw' ? "Je, nimejibu swali lako?" : "Have I answered your question?")
          : (language === 'sw' ? "Je, tuendelee na somo?" : "Should we continue with the lesson?");
        setMessages(prev => [...prev, { role: 'assistant', content: continuePrompt }]);
        if (onWaitingForContinueChange) {
          onWaitingForContinueChange(true);
        }
        if (onAnswerFinished) onAnswerFinished();
      }
    } catch (error: any) {
      console.error("QA Error:", error);
      const errorText = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
      const isRateLimit = errorText.includes('429') || errorText.includes('RESOURCE_EXHAUSTED');
      const errorMessage = isRateLimit 
        ? "Academy Neural Link is saturated (Quota Exceeded). If you are using the free tier, please wait a moment or add a billing-enabled API key in Settings > Secrets to increase capacity."
        : "Neural link timeout or connection error. Please check your network and try again.";
        
      setMessages(prev => [...prev, { role: 'assistant', content: errorMessage }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const userMessage = input.trim();
    setInput('');
    processQuestion(userMessage);
  };

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="absolute inset-y-0 right-0 w-full md:w-[450px] bg-[#1a2f23] border-l-8 border-[#4a3728] z-[100] flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.5)]"
    >
      {/* Chalkboard Texture */}
      <div className="absolute inset-0 pointer-events-none opacity-10 bg-[url('https://www.transparenttextures.com/patterns/chalkboard.png')]"></div>
      
      {/* Header */}
      <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#14231b] relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center shadow-inner">
            <i className="fas fa-hand-paper text-emerald-400 text-sm"></i>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-[0.3em] font-serif italic">Student Dialogue</h3>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <p className="text-[9px] text-white/40 font-mono tracking-widest uppercase">Active Inquiry System</p>
            </div>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all hover:rotate-90 border border-white/10"
        >
          <i className="fas fa-times text-white/40"></i>
        </button>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar relative z-10"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center py-12 px-8">
             <div className="w-20 h-20 rounded-full bg-emerald-900/20 border-2 border-emerald-500/10 flex items-center justify-center mb-6">
               <i className="fas fa-graduation-cap text-3xl text-emerald-500/20"></i>
             </div>
            <p className="text-xs font-black text-emerald-400/50 uppercase tracking-[0.4em] mb-4">Classroom Discussion</p>
            <p className="text-[11px] font-serif italic text-white/30 leading-relaxed">
              "The beautiful thing about learning is that no one can take it away from you."
              <br/>
              <span className="mt-2 block not-italic font-mono text-[8px] opacity-40">— B.B. King</span>
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, x: m.role === 'user' ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[90%] p-5 rounded-3x relative ${
              m.role === 'user' 
                ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-50 rounded-br-none' 
                : 'bg-white/5 border border-white/10 text-white/90 rounded-bl-none shadow-xl'
            }`}>
              <div className={`absolute top-0 ${m.role === 'user' ? 'right-0' : 'left-0'} -translate-y-full mb-1`}>
                <span className="text-[8px] font-black uppercase tracking-widest opacity-30">
                  {m.role === 'user' ? 'Student' : 'Mwalimu Bora'}
                </span>
              </div>
              <div className={`markdown-body ${m.role === 'assistant' ? 'chalk-text font-serif text-lg leading-relaxed' : 'font-sans'}`}>
                <Markdown>{m.content}</Markdown>
              </div>
            </div>
          </motion.div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/5 p-4 rounded-2xl rounded-bl-none border border-white/10 flex gap-2">
              {[0, 1, 2].map((dot) => (
                <motion.div 
                  key={dot}
                  animate={{ y: [0, -5, 0], opacity: [0.3, 1, 0.3] }} 
                  transition={{ repeat: Infinity, duration: 1, delay: dot * 0.2 }} 
                  className="w-1.5 h-1.5 bg-emerald-500 rounded-full"
                ></motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isWaitingForContinue && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-6 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/20 flex flex-col gap-2 relative z-10 mb-2"
        >
          <p className="text-[10px] uppercase font-black tracking-widest text-[#dfca9c] text-center">
            {isLessonEnded 
              ? (language === 'sw' ? "Je, nimejibu swali lako?" : "Have I answered your question?")
              : (language === 'sw' ? "Je, tuendelee na somo?" : "Should we continue with the lesson?")
            }
          </p>
          <div className="flex gap-2">
            {isLessonEnded ? (
              <>
                <button
                  onClick={() => {
                    if (onWaitingForContinueChange) {
                      onWaitingForContinueChange(false);
                    }
                    const gladMsg = language === 'sw' ? "Ninafurahi!" : "I am glad!";
                    setMessages(prev => [...prev, { role: 'assistant', content: gladMsg }]);
                    if (onAssistantSpeak) {
                      onAssistantSpeak(gladMsg);
                    }
                  }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-1 border border-emerald-400/30"
                  type="button"
                >
                  <i className="fas fa-check text-[9px]"></i>
                  {language === 'sw' ? "Ndiyo" : "Yes"}
                </button>
                <button
                  onClick={() => {
                    if (onWaitingForContinueChange) {
                      onWaitingForContinueChange(false);
                    }
                    const clarifyMsg = language === 'sw' 
                      ? "Tafadhali unaweza kuniambia ni nini hasa ungependa nikufafanulie?" 
                      : "Could you please tell me what exactly you want me to clarify?";
                    setMessages(prev => [...prev, { role: 'assistant', content: clarifyMsg }]);
                    if (onAssistantSpeak) {
                      onAssistantSpeak(clarifyMsg);
                    }
                  }}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white/80 py-2 px-3 rounded-lg text-xs transition-all border border-white/10 active:scale-95 text-center"
                  type="button"
                >
                  {language === 'sw' ? "Hapana" : "No"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onClose()}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-1 border border-emerald-400/30"
                  type="button"
                >
                  <i className="fas fa-check text-[9px]"></i>
                  {language === 'sw' ? "Ndiyo, Endelea" : "Yes, Continue"}
                </button>
                <button
                  onClick={() => {
                    if (onWaitingForContinueChange) {
                      onWaitingForContinueChange(false);
                    }
                    if (onAssistantSpeak) {
                      onAssistantSpeak(language === 'sw' ? "Sawa, unaweza kuuliza swali lingine." : "Alright, what other question do you have?");
                    }
                  }}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white/80 py-2 px-3 rounded-lg text-xs transition-all border border-white/10 active:scale-95 text-center"
                  type="button"
                >
                  {language === 'sw' ? "Hapana, Uliza zaidi" : "No, Ask More"}
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* Input */}
      <div className="p-6 bg-[#101c15] border-t border-white/5 relative z-10 shadow-[0_-10px_30px_rgba(0,0,0,0.4)]">
        <form onSubmit={handleSend} className="relative flex items-center justify-between w-full h-[58px] bg-zinc-950/80 hover:bg-zinc-950/95 border border-emerald-950 focus-within:border-emerald-700/60 rounded-full px-4 gap-2 transition-all shadow-inner">
          <input 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={language === 'sw' ? "Uliza swali lako hapa..." : "Ask your question here..."}
            className="flex-1 bg-transparent border-none text-white placeholder:text-zinc-400 caret-white text-sm focus:outline-none focus:ring-0 px-2 h-full py-2 min-w-0 font-sans"
            disabled={isLoading}
          />
          <button 
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-10 h-10 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:opacity-40 text-zinc-950 disabled:text-zinc-500 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-md shrink-0"
            title="Send Question"
          >
            {isLoading ? (
              <i className="fas fa-circle-notch fa-spin text-sm"></i>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            )}
          </button>
        </form>
        <div className="mt-4 flex items-center justify-between px-2">
           <span className="text-[8px] font-mono text-white/20 uppercase tracking-[0.2em]">Lesson Context Synchronized</span>
           <div className="flex gap-1">
              <div className="w-8 h-1 bg-white/5 rounded-full"></div>
              <div className="w-12 h-1 bg-emerald-500/20 rounded-full"></div>
           </div>
        </div>
      </div>
    </motion.div>
  );
};
