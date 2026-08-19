import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';

interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

interface InteractiveQuizProps {
  currentTopic: string;
  whiteboardNotes: string;
  language: "en" | "sw";
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
  studyLevel
}) => {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isQuizFinished, setIsQuizFinished] = useState(false);

  useEffect(() => {
    generateDynamicQuiz();
  }, [whiteboardNotes]);

  const generateDynamicQuiz = async () => {
    setIsLoading(true);
    setError(null);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setHasAnswered(false);
    setScore(0);
    setIsQuizFinished(false);

    try {
      const response = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          whiteboardNotes,
          language,
          topic: currentTopic,
          intelLevel,
          studyLevel,
        }),
      });

      if (!response.ok) {
        throw new Error(
          language === 'sw'
            ? 'Mlipuko wa neva umeshindwa kupakia maswali.'
            : 'Neural synthesis failed to fetch quiz questions.'
        );
      }

      const data = await response.json();
      if (data && data.questions && Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(data.questions);
      } else {
        throw new Error(
          language === 'sw'
            ? 'Data ya jaribio haipo au haitambuliki.'
            : 'No questions parsed from the neural cluster response.'
        );
      }
    } catch (err: any) {
      console.error('Quiz generation error:', err);
      setError(err?.message || 'Failed to initialize the neural interactive checkpoint.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOptionSelect = (option: string) => {
    if (hasAnswered) return;
    setSelectedOption(option);
  };

  const handleConfirmAnswer = () => {
    if (!selectedOption || hasAnswered) return;
    setHasAnswered(true);
    
    const currentQuestion = questions[currentQuestionIndex];
    if (
      currentQuestion &&
      selectedOption.trim().toLowerCase() === currentQuestion.correctAnswer.trim().toLowerCase()
    ) {
      setScore((prev) => prev + 1);
    }
  };

  const handleNext = () => {
    setSelectedOption(null);
    setHasAnswered(false);

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      setIsQuizFinished(true);
      if (onQuizComplete) {
        onQuizComplete(score, questions.length);
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // If we are currently loading, showing an error, or the quiz is finished, ignore keys
      if (isLoading || error || isQuizFinished) return;

      const currentQuestion = questions[currentQuestionIndex];
      if (!currentQuestion) return;

      if (!hasAnswered) {
        if (['1', '2', '3', '4'].includes(event.key)) {
          const index = parseInt(event.key, 10) - 1;
          if (currentQuestion.options && currentQuestion.options[index]) {
            handleOptionSelect(currentQuestion.options[index]);
          }
        } else if (event.key === 'Enter') {
          handleConfirmAnswer();
        }
      } else {
        if (event.key === 'Enter') {
          handleNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLoading, error, isQuizFinished, questions, currentQuestionIndex, hasAnswered, selectedOption]);

  const getCardBgColor = (option: string) => {
    const isSelected = selectedOption === option;

    if (!hasAnswered) {
      if (isSelected) {
        return 'bg-blue-500/10 border-blue-500 text-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.15)] cursor-pointer';
      }
      return 'bg-slate-800/40 hover:bg-slate-800/80 hover:border-blue-500/50 border-white/5 text-white/90 cursor-pointer';
    }
    
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return 'bg-slate-900/20 border-white/5 opacity-40 text-white/50 cursor-not-allowed';
    const isCorrectChoice = option.trim().toLowerCase() === currentQuestion.correctAnswer.trim().toLowerCase();

    if (isCorrectChoice) {
      return 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]';
    }
    if (isSelected && !isCorrectChoice) {
      return 'bg-red-500/20 border-red-500 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
    }
    return 'bg-slate-900/20 border-white/5 opacity-40 text-white/50 cursor-not-allowed';
  };

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-[2.5rem] shadow-2xl p-6 md:p-8 flex flex-col overflow-hidden max-h-[90vh]"
      >
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-60"></div>

        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
              <i className="fas fa-brain text-sm"></i>
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">
                {language === 'sw' ? 'Jaribio la Ufahamu' : 'Neural Checkpoint'}
              </h3>
              <p className="text-[10px] font-mono text-blue-400 tracking-wider">
                {currentTopic || (language === 'sw' ? 'Mada Amilifu' : 'Active Topic')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-10 h-10 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
              <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">
                {language === 'sw' ? 'Nikijenga maswali mapya kutoka kwenye maelezo...' : 'Analyzing lesson notes to design checkpoint...'}
              </p>
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto text-red-500 mb-4">
                <i className="fas fa-exclamation-triangle text-xl"></i>
              </div>
              <p className="text-xs font-mono text-red-400 mb-6">{error}</p>
              <button
                onClick={generateDynamicQuiz}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                {language === 'sw' ? 'Jaribu Tena' : 'Retry Neural Generation'}
              </button>
            </div>
          ) : isQuizFinished ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-8"
            >
              <div className="relative w-36 h-36 mx-auto mb-8 flex items-center justify-center">
                <div className="absolute inset-0 bg-blue-500/5 rounded-full blur-xl animate-pulse"></div>
                <div className="w-28 h-28 border-4 border-blue-500/10 border-t-blue-500 rounded-full flex items-center justify-center">
                  <div className="text-center">
                    <span className="text-3xl font-black text-white font-mono leading-none">{score}</span>
                    <span className="text-sm font-bold text-slate-500 font-mono block">/ {questions.length}</span>
                  </div>
                </div>
              </div>

              <h4 className="text-xl font-bold text-white uppercase tracking-widest mb-3">
                {language === 'sw' ? 'Jaribio Limekamilika!' : 'Uplink Synchronization Complete'}
              </h4>

              <p className="text-slate-400 text-xs leading-relaxed max-w-md mx-auto mb-8 font-serif">
                {score === questions.length
                  ? (language === 'sw'
                      ? 'Kazi nzuri sana! Ulinganishaji wa mawimbi ya ubongo ni 100%. Umeweza kujifunza maelezo yote kikamilifu.'
                      : 'Perfection achieved. Neuro-conceptual synchronization is at 100%. You have integrated all core assertions perfectly.')
                  : score >= questions.length / 2
                  ? (language === 'sw'
                      ? 'Nguvu nzuri ya utendaji ya kiakili. Umeweza kujibu dhana nyingi kwa usahihi.'
                      : 'Robust intellectual performance. Most core concept arrays have been synchronized successfully.')
                  : (language === 'sw'
                      ? 'Uchambuzi unaonyesha ufaulu ulio chini kidogo. Inapendekezwa kupitia upya maelezo ya ubao kabla ya kujaribu tena.'
                      : 'Conceptual alignment is partial. Re-review of whiteboard segments is recommended before repeating evaluation.')}
              </p>

              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={generateDynamicQuiz}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all"
                >
                  {language === 'sw' ? 'Anza upya' : 'Restart Quiz'}
                </button>
                <button
                  onClick={onClose}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20"
                >
                  {language === 'sw' ? 'Funga' : 'Resume Dashboard'}
                </button>
              </div>
            </motion.div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentQuestionIndex}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                {/* Progress bar / index */}
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-slate-500">
                  <span>
                    {language === 'sw' ? 'Swali' : 'Evaluation'} {currentQuestionIndex + 1} of {questions.length}
                  </span>
                  <div className="flex gap-1.5">
                    {questions.map((_, idx) => (
                      <div
                        key={`progress-dot-${idx}`}
                        className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                          idx === currentQuestionIndex
                            ? 'bg-blue-500 w-4'
                            : idx < currentQuestionIndex
                            ? 'bg-emerald-500'
                            : 'bg-slate-800'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* The actual question */}
                <h4 className="text-lg font-bold text-white leading-relaxed">
                  {currentQuestion.question}
                </h4>

                {/* Multiple choice options */}
                <div className="grid grid-cols-1 gap-3">
                  {currentQuestion.options.map((option, idx) => {
                    const optionLetter = String.fromCharCode(65 + idx); // A, B, C, D
                    return (
                      <button
                        key={`quiz-choice-${idx}`}
                        disabled={hasAnswered}
                        onClick={() => handleOptionSelect(option)}
                        className={`flex items-start text-left p-4 rounded-2xl border transition-all text-sm group ${getCardBgColor(
                          option
                        )}`}
                      >
                        <span className="w-6 h-6 shrink-0 flex items-center justify-center font-mono font-bold text-xs bg-slate-950/45 rounded-lg mr-3 text-slate-400 group-hover:text-white transition-colors">
                          {optionLetter}
                        </span>
                        <span className="flex-1 pt-0.5 leading-snug">{option}</span>
                        {!hasAnswered && (
                          <span className="shrink-0 text-[10px] font-mono text-slate-500 bg-slate-950/30 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                            Key {idx + 1}
                          </span>
                        )}
                        {hasAnswered && (
                          <div className="shrink-0 ml-3 mt-0.5">
                            {option.trim().toLowerCase() === currentQuestion.correctAnswer.trim().toLowerCase() ? (
                              <i className="fas fa-check-circle text-emerald-400 text-lg"></i>
                            ) : selectedOption === option ? (
                              <i className="fas fa-times-circle text-red-400 text-lg"></i>
                            ) : null}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Teacher's explanation card (appears only on submission) */}
                <AnimatePresence>
                  {hasAnswered && (
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-5 bg-slate-950/40 rounded-2xl border border-white/5 space-y-2 mt-4"
                    >
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-400 pb-2 border-b border-white/5">
                        <i className="fas fa-glasses text-xs"></i>
                        <span>{language === 'sw' ? 'Ufafanuzi wa Mwalimu Bora' : 'Educator Briefing'}</span>
                      </div>
                      <div className="text-xs text-slate-300 leading-relaxed font-serif prose prose-invert max-w-none">
                        <Markdown>{currentQuestion.explanation}</Markdown>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Confirm / Next Button Toolbar */}
                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                  {/* Keyboard Tips */}
                  {!hasAnswered ? (
                    <span className="flex items-center gap-1.5 text-[9px] font-mono text-slate-500 tracking-wider">
                      <kbd className="bg-slate-800 border border-white/10 px-1 py-0.5 rounded text-slate-300">1</kbd>-
                      <kbd className="bg-slate-800 border border-white/10 px-1 py-0.5 rounded text-slate-300">4</kbd> {language === 'sw' ? 'Kuteua' : 'To Select'}
                      {selectedOption && (
                        <>
                          <span className="mx-1 text-slate-700">•</span>
                          <kbd className="bg-slate-800 border border-white/10 px-1.5 py-0.5 rounded text-slate-300">Enter</kbd> {language === 'sw' ? 'Mwasilishe' : 'To Confirm'}
                        </>
                      )}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[9px] font-mono text-slate-500 tracking-wider">
                      <kbd className="bg-slate-800 border border-white/10 px-1.5 py-0.5 rounded text-slate-300">Enter</kbd> {language === 'sw' ? 'Kuendelea' : 'To Proceed'}
                    </span>
                  )}

                  {/* Actions */}
                  {!hasAnswered ? (
                    <button
                      disabled={!selectedOption}
                      onClick={handleConfirmAnswer}
                      className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-lg hover:shadow-blue-500/20 active:scale-95"
                    >
                      <span>{language === 'sw' ? 'Wasilisha Jibu' : 'Confirm Choice'}</span>
                      <i className="fas fa-check text-[8px]"></i>
                    </button>
                  ) : (
                    <button
                      onClick={handleNext}
                      className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-95 animate-fade-in"
                    >
                      <span>
                        {currentQuestionIndex === questions.length - 1
                          ? (language === 'sw' ? 'Maliza Jaribio' : 'Finish Evaluation')
                          : (language === 'sw' ? 'Swali Jipya' : 'Proceed')}
                      </span>
                      <i className="fas fa-arrow-right text-[8px]"></i>
                    </button>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </div>
  );
};
