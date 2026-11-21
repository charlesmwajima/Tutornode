import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import Markdown from 'react-markdown';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, getAuthHeaders, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  Brain,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  X,
  History,
  Send,
} from 'lucide-react';

interface QuizQuestion {
  type?: 'mcq' | 'short_answer' | string;
  question: string;
  options: string[];
  correctAnswer: string;
  acceptedKeywords?: string[];
  explanation: string;
}

interface QuestionAnswerState {
  selectedAnswer: string;
  submitted: boolean;
  isCorrect: boolean;
  points: number;
  aiFeedback?: string;
}

interface QuizAttemptSummary {
  id: string;
  topic: string;
  score: number;
  total: number;
  percentage: number;
}

interface InteractiveQuizProps {
  currentTopic: string;
  whiteboardNotes: string;
  language: 'en' | 'sw';
  onClose: () => void;
  onQuizComplete?: (score: number, total: number) => void;
  intelLevel?: string;
  studyLevel?: string;
}

export const InteractiveQuiz: React.FC<InteractiveQuizProps> = ({
  currentTopic,
  whiteboardNotes,
  language,
  onClose,
  onQuizComplete,
  intelLevel,
  studyLevel,
}) => {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, QuestionAnswerState>>({});
  const [shortInput, setShortInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isGrading, setIsGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [recentAttempts, setRecentAttempts] = useState<QuizAttemptSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const fetchQuizHistory = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(
        collection(db, 'quizAttempts'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(8)
      );
      const snap = await getDocs(q);
      setRecentAttempts(
        snap.docs.map((d) => ({
          id: d.id,
          topic: String(d.data().topic || 'Quiz'),
          score: Number(d.data().score || 0),
          total: Number(d.data().total || 1),
          percentage: Number(d.data().percentage || 0),
        }))
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'quizAttempts');
    }
  }, []);

  const generateDynamicQuiz = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setQuestions([]);
    setCurrentIndex(0);
    setAnswers({});
    setShortInput('');
    setIsFinished(false);

    if (!auth.currentUser) {
      setError(
        language === 'sw'
          ? 'Tafadhali ingia kwenye akaunti yako ili kuunda mtihani.'
          : 'Please sign in to generate a personalized quiz.'
      );
      setIsLoading(false);
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          whiteboardNotes,
          language,
          topic: currentTopic,
          intelLevel,
          studyLevel,
          questionCount: 5,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Quiz generation failed (${response.status}).`);
      }

      if (Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(data.questions);
      } else {
        throw new Error('No quiz questions were returned. Please try again.');
      }
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to generate quiz.');
    } finally {
      setIsLoading(false);
    }
  }, [currentTopic, intelLevel, language, studyLevel, whiteboardNotes]);

  useEffect(() => {
    generateDynamicQuiz();
    fetchQuizHistory();
  }, [generateDynamicQuiz, fetchQuizHistory]);

  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers[currentIndex];
  const isShortAnswer =
    currentQuestion?.type === 'short_answer' ||
    !Array.isArray(currentQuestion?.options) ||
    currentQuestion.options.length === 0;

  useEffect(() => {
    if (isShortAnswer) {
      setShortInput(currentAnswer?.selectedAnswer || '');
    }
  }, [currentIndex, isShortAnswer, currentAnswer?.selectedAnswer]);

  const selectMcqOption = (option: string) => {
    if (currentAnswer?.submitted) return;
    setAnswers((prev) => ({
      ...prev,
      [currentIndex]: {
        selectedAnswer: option,
        submitted: false,
        isCorrect: false,
        points: 0,
      },
    }));
  };

  const confirmCurrentAnswer = async () => {
    if (!currentQuestion || currentAnswer?.submitted) return;

    if (isShortAnswer) {
      const studentText = shortInput.trim();
      if (!studentText) return;
      setIsGrading(true);
      try {
        const headers = await getAuthHeaders();
        const resp = await fetch('/api/grade-short-answer', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            question: currentQuestion.question,
            studentAnswer: studentText,
            modelAnswer: currentQuestion.correctAnswer,
            acceptedKeywords: currentQuestion.acceptedKeywords || [],
            language,
          }),
        });
        const graded = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(graded.error || 'Could not grade response.');
        }

        const pts = Math.max(0, Math.min(1, Number(graded.score ?? (graded.isCorrect ? 1 : 0))));
        setAnswers((prev) => ({
          ...prev,
          [currentIndex]: {
            selectedAnswer: studentText,
            submitted: true,
            isCorrect: Boolean(graded.isCorrect) || pts >= 0.75,
            points: pts,
            aiFeedback: graded.feedback || currentQuestion.explanation,
          },
        }));
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Unable to grade short answer.');
      } finally {
        setIsGrading(false);
      }
      return;
    }

    const chosen = currentAnswer?.selectedAnswer;
    if (!chosen) return;
    const isCorrect =
      chosen.trim().toLowerCase() === currentQuestion.correctAnswer.trim().toLowerCase();
    setAnswers((prev) => ({
      ...prev,
      [currentIndex]: {
        selectedAnswer: chosen,
        submitted: true,
        isCorrect,
        points: isCorrect ? 1 : 0,
      },
    }));
  };

  const computeTotalScore = () =>
    questions.reduce((acc, _q, idx) => acc + (answers[idx]?.points || 0), 0);

  const finishQuiz = async () => {
    const totalPoints = computeTotalScore();
    const totalCount = questions.length;
    const percentage = totalCount > 0 ? Math.round((totalPoints / totalCount) * 100) : 0;

    setIsFinished(true);
    onQuizComplete?.(totalPoints, totalCount);

    if (auth.currentUser && totalCount > 0) {
      try {
        await addDoc(collection(db, 'quizAttempts'), {
          userId: auth.currentUser.uid,
          topic: (currentTopic || 'Lesson Assessment').slice(0, 300),
          studyLevel: (studyLevel || 'Undergraduate').slice(0, 80),
          score: totalPoints,
          total: totalCount,
          percentage,
          answers: questions.map((q, idx) => ({
            question: q.question.slice(0, 400),
            userAnswer: (answers[idx]?.selectedAnswer || 'Skipped').slice(0, 500),
            correctAnswer: q.correctAnswer.slice(0, 500),
            isCorrect: Boolean(answers[idx]?.isCorrect),
          })),
          createdAt: serverTimestamp(),
        });
        fetchQuizHistory();
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'quizAttempts');
      }
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      finishQuiz();
    }
  };

  const totalScore = computeTotalScore();
  const submittedCount = Object.values(answers).filter((a) => a.submitted).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl shadow-2xl p-5 sm:p-7 flex flex-col max-h-[92vh]"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-blue-500/15 border border-blue-500/30 rounded-xl text-blue-400 shrink-0">
              <Brain size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">
                {language === 'sw' ? 'Mtihani wa Ufahamu' : 'Interactive Assessment'}
              </h3>
              <p className="text-xs text-blue-400 truncate">
                {currentTopic || 'Lesson Topic'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {recentAttempts.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistory((prev) => !prev)}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 flex items-center gap-1.5"
              >
                <History size={13} />
                <span>{showHistory ? 'Quiz' : 'History'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close quiz"
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {showHistory ? (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Recent Quiz Results
              </h4>
              {recentAttempts.map((att) => (
                <div
                  key={att.id}
                  className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/10 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{att.topic}</p>
                    <p className="text-xs text-slate-400">
                      Score: {att.score} / {att.total}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold tabular-nums ${
                      att.percentage >= 70
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : att.percentage >= 50
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-red-500/20 text-red-300'
                    }`}
                  >
                    {att.percentage}%
                  </span>
                </div>
              ))}
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="w-9 h-9 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-xs text-slate-400">
                {language === 'sw'
                  ? 'Kuandaa maswali ya mtihani...'
                  : 'Preparing personalized questions from your lesson...'}
              </p>
            </div>
          ) : error ? (
            <div className="text-center py-10 space-y-4">
              <p className="text-sm text-red-300">{error}</p>
              <button
                type="button"
                onClick={generateDynamicQuiz}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold"
              >
                <RotateCcw size={14} /> Retry Quiz Generation
              </button>
            </div>
          ) : isFinished ? (
            <div className="space-y-6 py-2">
              <div className="text-center bg-slate-950/60 border border-white/10 rounded-2xl p-6">
                <div className="text-3xl font-extrabold text-white tabular-nums">
                  {totalScore} / {questions.length}
                </div>
                <p className="text-sm font-semibold text-blue-400 mt-1">
                  {questions.length > 0 ? Math.round((totalScore / questions.length) * 100) : 0}% Mastery Score
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  Review your answers and teacher explanations below.
                </p>
              </div>

              <div className="space-y-3">
                {questions.map((q, idx) => {
                  const ans = answers[idx];
                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-2xl border ${
                        ans?.isCorrect
                          ? 'bg-emerald-950/25 border-emerald-500/30'
                          : 'bg-red-950/20 border-red-500/25'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-slate-300">
                          Q{idx + 1}. {q.question}
                        </span>
                        {ans?.isCorrect ? (
                          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle size={16} className="text-red-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-300">
                        <span className="text-slate-400">Your Answer:</span>{' '}
                        {ans?.selectedAnswer || 'Not answered'}
                      </p>
                      {!ans?.isCorrect && (
                        <p className="text-xs text-emerald-300 mt-1">
                          <span className="text-slate-400">Model Answer:</span> {q.correctAnswer}
                        </p>
                      )}
                      <div className="text-xs text-slate-400 mt-2 pt-2 border-t border-white/5 prose prose-invert prose-xs max-w-none">
                        <Markdown>{ans?.aiFeedback || q.explanation}</Markdown>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={generateDynamicQuiz}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs flex items-center gap-2"
                >
                  <RotateCcw size={13} /> New Quiz
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs"
                >
                  Back to Classroom
                </button>
              </div>
            </div>
          ) : currentQuestion ? (
            <div className="space-y-5">
              {/* Question Navigation Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-400 tabular-nums">
                  Question {currentIndex + 1} of {questions.length} ({submittedCount} answered)
                </span>
                <div className="flex items-center gap-1.5">
                  {questions.map((_, idx) => {
                    const st = answers[idx];
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCurrentIndex(idx)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                          idx === currentIndex
                            ? 'bg-blue-600 text-white'
                            : st?.submitted
                            ? st.isCorrect
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-red-500/20 text-red-300 border border-red-500/40'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              <h4 className="text-base sm:text-lg font-bold text-white leading-snug">
                {currentQuestion.question}
              </h4>

              {isShortAnswer ? (
                <div className="space-y-3">
                  <textarea
                    rows={4}
                    value={shortInput}
                    disabled={Boolean(currentAnswer?.submitted) || isGrading}
                    onChange={(e) => setShortInput(e.target.value)}
                    placeholder={
                      language === 'sw'
                        ? 'Andika jibu lako kwa ufupi hapa...'
                        : 'Write your explanation or solution step here...'
                    }
                    className="w-full bg-slate-950/80 border border-white/10 rounded-2xl p-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {currentQuestion.options.map((option, idx) => {
                    const isSelected = currentAnswer?.selectedAnswer === option;
                    const submitted = Boolean(currentAnswer?.submitted);
                    const isCorrectChoice =
                      option.trim().toLowerCase() ===
                      currentQuestion.correctAnswer.trim().toLowerCase();

                    let btnClass =
                      'bg-slate-800/50 hover:bg-slate-800 border-white/10 text-slate-200';
                    if (!submitted && isSelected) {
                      btnClass = 'bg-blue-600/20 border-blue-500 text-white';
                    } else if (submitted && isCorrectChoice) {
                      btnClass = 'bg-emerald-500/20 border-emerald-500 text-emerald-200';
                    } else if (submitted && isSelected && !isCorrectChoice) {
                      btnClass = 'bg-red-500/20 border-red-500 text-red-200';
                    } else if (submitted) {
                      btnClass = 'bg-slate-900/40 border-white/5 text-slate-500';
                    }

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={submitted}
                        onClick={() => selectMcqOption(option)}
                        className={`flex items-start text-left p-3.5 rounded-2xl border transition-all text-sm gap-3 ${btnClass}`}
                      >
                        <span className="w-6 h-6 rounded-lg bg-slate-950/60 flex items-center justify-center text-xs font-bold shrink-0">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="flex-1 leading-snug">{option}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {currentAnswer?.submitted && (
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className={currentAnswer.isCorrect ? 'text-emerald-400' : 'text-amber-300'}>
                      {currentAnswer.isCorrect
                        ? 'Correct Reasoning'
                        : isShortAnswer && currentAnswer.points > 0
                        ? `Partial Credit (${currentAnswer.points}/1)`
                        : 'Review Needed'}
                    </span>
                    {isShortAnswer && (
                      <span className="text-slate-400">Model Answer: {currentQuestion.correctAnswer}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-300 prose prose-invert prose-xs max-w-none">
                    <Markdown>{currentAnswer.aiFeedback || currentQuestion.explanation}</Markdown>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-white/10 gap-3">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                >
                  <ArrowLeft size={14} /> Previous
                </button>

                {!currentAnswer?.submitted ? (
                  <button
                    type="button"
                    disabled={
                      isGrading ||
                      (isShortAnswer ? !shortInput.trim() : !currentAnswer?.selectedAnswer)
                    }
                    onClick={confirmCurrentAnswer}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    {isGrading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Grading...
                      </>
                    ) : (
                      <>
                        <Send size={13} /> Submit Answer
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <span>{currentIndex === questions.length - 1 ? 'Finish & Review' : 'Next Question'}</span>
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
};
