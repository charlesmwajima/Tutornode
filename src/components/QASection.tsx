import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import Markdown from 'react-markdown';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, getAuthHeaders, handleFirestoreError, OperationType } from '../lib/firebase';
import { RotateCcw, Send, X, MessageSquare, Check } from 'lucide-react';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface QASectionProps {
  currentTopic: string;
  currentSegment: { content: string; speech: string } | null;
  language: 'en' | 'sw';
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

function buildThreadDocId(uid: string, topic: string): string {
  const safeSlug = (topic || 'general')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'general';
  return `${uid.slice(0, 48)}_${safeSlug}`;
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
  isLessonEnded = false,
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages || []);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<{ message: string; failedQuestion: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastProcessedQuestion = useRef<string | null>(null);

  const threadDocId = auth.currentUser ? buildThreadDocId(auth.currentUser.uid, currentTopic) : null;

  // Load persisted tutor thread when opening a topic
  useEffect(() => {
    let active = true;
    const loadThread = async () => {
      if (!auth.currentUser || !threadDocId || (initialMessages && initialMessages.length > 0)) return;
      try {
        const snap = await getDoc(doc(db, 'tutorThreads', threadDocId));
        if (active && snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.messages)) {
            setMessages(data.messages.slice(-50));
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `tutorThreads/${threadDocId}`);
      }
    };
    loadThread();
    return () => {
      active = false;
    };
  }, [threadDocId, initialMessages]);

  const persistThread = useCallback(
    async (updatedMessages: Message[]) => {
      if (!auth.currentUser || !threadDocId) return;
      try {
        await setDoc(doc(db, 'tutorThreads', threadDocId), {
          userId: auth.currentUser.uid,
          topic: (currentTopic || 'General Study').slice(0, 300),
          messages: updatedMessages.slice(-50),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `tutorThreads/${threadDocId}`);
      }
    },
    [currentTopic, threadDocId]
  );

  const processQuestion = useCallback(
    async (userMessage: string, isRetry = false) => {
      const trimmed = userMessage.trim();
      if (!trimmed || isLoading) return;

      if (isWaitingForContinue) {
        const lower = trimmed.toLowerCase();
        if (
          lower === 'yes' ||
          lower === 'y' ||
          lower.includes('continue') ||
          lower.includes('ndio') ||
          lower.includes('ndiyo') ||
          lower.includes('endelea')
        ) {
          onClose();
          return;
        }
        onWaitingForContinueChange?.(false);
      }

      if (!auth.currentUser) {
        setLastError({
          message:
            language === 'sw'
              ? 'Tafadhali ingia kwenye akaunti yako ili kuzungumza na Mwalimu AI.'
              : 'Please sign in to chat with your TutorNode AI instructor.',
          failedQuestion: trimmed,
        });
        return;
      }

      setLastError(null);
      onQuestionAsked?.();

      const historySnapshot = messages;
      const nextMessages: Message[] = isRetry
        ? messages
        : [...messages, { role: 'user', content: trimmed }];

      if (!isRetry) {
        setMessages(nextMessages);
      }
      setIsLoading(true);

      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/qa-lesson', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            currentTopic,
            currentSegment,
            language,
            messages: historySnapshot,
            userMessage: trimmed,
            intelLevel,
            studyLevel,
            teachingTechniqueId,
          }),
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || `Tutor service returned status ${res.status}`);
        }

        const answer = payload.text?.trim();
        if (!answer) {
          throw new Error('Empty response received from tutor service.');
        }

        const withAnswer: Message[] = [...nextMessages, { role: 'assistant', content: answer }];
        setMessages(withAnswer);
        persistThread(withAnswer);

        const continuePrompt = isLessonEnded
          ? language === 'sw'
            ? 'Je, nimejibu swali lako?'
            : 'Have I answered your question?'
          : language === 'sw'
          ? 'Je, tuendelee na somo?'
          : 'Should we continue with the lesson?';

        if (onAssistantSpeak) {
          onAssistantSpeak(answer, () => {
            onWaitingForContinueChange?.(true);
            onAnswerFinished?.();
            onAssistantSpeak(continuePrompt);
          });
        } else {
          onWaitingForContinueChange?.(true);
          onAnswerFinished?.();
        }
      } catch (err: unknown) {
        const msg =
          (err as { message?: string })?.message ||
          'Unable to reach AI tutor service. Please retry.';
        setLastError({ message: msg, failedQuestion: trimmed });
      } finally {
        setIsLoading(false);
      }
    },
    [
      currentSegment,
      currentTopic,
      intelLevel,
      isLessonEnded,
      isLoading,
      isWaitingForContinue,
      language,
      messages,
      onAnswerFinished,
      onAssistantSpeak,
      onClose,
      onQuestionAsked,
      onWaitingForContinueChange,
      persistThread,
      studyLevel,
      teachingTechniqueId,
    ]
  );

  useEffect(() => {
    if (initialQuestion && initialQuestion !== lastProcessedQuestion.current) {
      lastProcessedQuestion.current = initialQuestion;
      processQuestion(initialQuestion);
    }
  }, [initialQuestion, processQuestion]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, lastError]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const userMessage = input.trim();
    if (!userMessage) return;
    setInput('');
    processQuestion(userMessage);
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed md:absolute inset-y-0 right-0 w-full md:w-[440px] bg-slate-900 border-l border-white/10 z-[100] flex flex-col shadow-2xl"
    >
      <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/70">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <MessageSquare size={17} className="text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate">
              {language === 'sw' ? 'Mazungumzo na Mwalimu' : 'AI Tutor Dialogue'}
            </h3>
            <p className="text-[11px] text-slate-400 truncate">
              {currentTopic || 'Active Topic'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Tutor Dialogue"
          className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 custom-scrollbar">
        {messages.length === 0 && !isLoading && (
          <div className="h-full flex flex-col items-center justify-center text-center py-10 px-6">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
              <MessageSquare size={24} className="text-emerald-400/70" />
            </div>
            <p className="text-sm font-semibold text-white mb-1.5">
              {language === 'sw' ? 'Uliza Swali Lolote' : 'Ask Mwalimu Bora'}
            </p>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
              {language === 'sw'
                ? 'Omba ufafanuzi, vidokezo vya hatua kwa hatua, au mifano ya ziada kuhusu somo hili.'
                : 'Request step-by-step explanations, progressive exam hints, worked examples, or clarification on any concept.'}
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[90%] p-4 rounded-2xl text-sm ${
                m.role === 'user'
                  ? 'bg-blue-600/20 border border-blue-500/30 text-slate-100 rounded-br-sm'
                  : 'bg-slate-800/80 border border-white/10 text-slate-100 rounded-bl-sm'
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                {m.role === 'user' ? 'Student' : 'Mwalimu Bora'}
              </div>
              <div className="prose prose-invert prose-sm max-w-none leading-relaxed">
                <Markdown>{m.content}</Markdown>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800/80 border border-white/10 px-4 py-3 rounded-2xl text-xs text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{language === 'sw' ? 'Mwalimu anafikiri...' : 'Mwalimu is preparing a response...'}</span>
            </div>
          </div>
        )}

        {lastError && (
          <div className="bg-red-950/50 border border-red-500/30 rounded-2xl p-4 space-y-2.5 text-xs text-red-200">
            <p className="leading-relaxed">{lastError.message}</p>
            <button
              type="button"
              onClick={() => processQuestion(lastError.failedQuestion, true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold"
            >
              <RotateCcw size={12} />
              <span>{language === 'sw' ? 'Jaribu Tena' : 'Retry'}</span>
            </button>
          </div>
        )}
      </div>

      {isWaitingForContinue && (
        <div className="mx-4 mb-2 p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/30 flex flex-col gap-2">
          <p className="text-xs font-semibold text-emerald-200 text-center">
            {isLessonEnded
              ? language === 'sw'
                ? 'Je, nimejibu swali lako?'
                : 'Have I answered your question?'
              : language === 'sw'
              ? 'Je, tuendelee na somo?'
              : 'Ready to continue the lesson?'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onWaitingForContinueChange?.(false);
                if (!isLessonEnded) onClose();
              }}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1"
            >
              <Check size={13} />
              {isLessonEnded ? (language === 'sw' ? 'Ndiyo' : 'Yes') : language === 'sw' ? 'Endelea' : 'Resume Lesson'}
            </button>
            <button
              type="button"
              onClick={() => onWaitingForContinueChange?.(false)}
              className="flex-1 bg-white/10 hover:bg-white/15 text-slate-200 py-2 px-3 rounded-lg text-xs"
            >
              {language === 'sw' ? 'Uliza Zaidi' : 'Ask More'}
            </button>
          </div>
        </div>
      )}

      <div className="p-4 bg-slate-950/80 border-t border-white/10">
        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 bg-slate-900 border border-white/10 focus-within:border-emerald-500 rounded-2xl px-3 py-1.5"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={language === 'sw' ? 'Uliza swali lako hapa...' : 'Ask your question or attempt an exam step...'}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none py-2 px-1 min-w-0"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            aria-label="Send message"
            className="w-9 h-9 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center shrink-0 transition-colors"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </motion.div>
  );
};
