import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { X, Star, Send, CheckCircle2 } from 'lucide-react';

interface FeedbackModalProps {
  currentTopic: string;
  teacherDialogue: string;
  language: 'en' | 'sw';
  onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  currentTopic,
  teacherDialogue,
  language,
  onClose,
}) => {
  const [qualityScore, setQualityScore] = useState(5);
  const [relevanceScore, setRelevanceScore] = useState(5);
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      setError('Please sign in before submitting feedback.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await addDoc(collection(db, 'feedbacks'), {
        userId: auth.currentUser.uid,
        topic: (currentTopic || 'General Platform Feedback').slice(0, 300),
        teacher_dialogue: (teacherDialogue || '').slice(0, 20000),
        quality_score: Math.min(5, Math.max(1, Math.round(qualityScore))),
        relevance_score: Math.min(5, Math.max(1, Math.round(relevanceScore))),
        comments: comments.trim().slice(0, 2000),
        timestamp: serverTimestamp(),
      });
      setSubmitted(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'feedbacks');
      setError('Unable to save feedback. Please check your connection and retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 className="text-base font-bold text-white">
            {language === 'sw' ? 'Toa Maoni Yako' : 'Lesson Feedback'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close feedback"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {submitted ? (
          <div className="text-center py-6 space-y-3">
            <CheckCircle2 size={36} className="mx-auto text-emerald-400" />
            <p className="text-sm font-bold text-white">Thank you for your feedback!</p>
            <p className="text-xs text-slate-400">Your rating helps improve TutorNode lessons.</p>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">
                Teaching Clarity (1 - 5)
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setQualityScore(n)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 ${
                      qualityScore >= n
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-slate-950 border-white/10 text-slate-500'
                    }`}
                  >
                    <Star size={12} /> {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">
                Content Relevance (1 - 5)
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRelevanceScore(n)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 ${
                      relevanceScore >= n
                        ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                        : 'bg-slate-950 border-white/10 text-slate-500'
                    }`}
                  >
                    <Star size={12} /> {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">Comments</label>
              <textarea
                rows={3}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Share what worked well or what we should improve..."
                className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <Send size={13} />
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
