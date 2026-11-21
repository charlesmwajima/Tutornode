import React, { useState, useEffect, useCallback } from 'react';
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  orderBy,
  query,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, getAuthHeaders, handleFirestoreError, OperationType } from '../lib/firebase';
import { ShieldCheck, Sparkles, Trash2, RefreshCw } from 'lucide-react';

interface AdminFeedback {
  id: string;
  topic: string;
  quality_score: number;
  relevance_score: number;
  comments?: string;
}

interface AdminLesson {
  id: string;
  topic: string;
  userId: string;
}

interface AdminAnalysis {
  summary: string;
  sentimentPercentage: number;
  positiveThemes: string[];
  painPoints: string[];
  actionableRecommendations: string[];
}

export const AdminDashboard: React.FC<{ language: 'en' | 'sw' }> = ({ language }) => {
  const [feedbacks, setFeedbacks] = useState<AdminFeedback[]>([]);
  const [lessons, setLessons] = useState<AdminLesson[]>([]);
  const [videoComingSoon, setVideoComingSoon] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AdminAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isVerifiedAdmin = Boolean(
    auth.currentUser?.email === 'charlesmwajima@gmail.com' && auth.currentUser?.emailVerified
  );

  const loadAdminData = useCallback(async () => {
    if (!isVerifiedAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const [fbSnap, lessonSnap, settingSnap] = await Promise.all([
        getDocs(query(collection(db, 'feedbacks'), orderBy('timestamp', 'desc'), limit(50))),
        getDocs(query(collection(db, 'lessons'), orderBy('timestamp', 'desc'), limit(30))),
        getDoc(doc(db, 'appSettings', 'videoMode')),
      ]);

      setFeedbacks(
        fbSnap.docs.map((d) => ({
          id: d.id,
          topic: String(d.data().topic || 'General'),
          quality_score: Number(d.data().quality_score || 0),
          relevance_score: Number(d.data().relevance_score || 0),
          comments: String(d.data().comments || ''),
        }))
      );
      setLessons(
        lessonSnap.docs.map((d) => ({
          id: d.id,
          topic: String(d.data().topic || 'Lesson'),
          userId: String(d.data().userId || ''),
        }))
      );
      if (settingSnap.exists()) {
        setVideoComingSoon(Boolean(settingSnap.data().comingSoon));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'feedbacks');
      setError('Unable to load admin records.');
    } finally {
      setLoading(false);
    }
  }, [isVerifiedAdmin]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const toggleVideoModeSetting = async () => {
    if (!isVerifiedAdmin) return;
    const nextVal = !videoComingSoon;
    try {
      await setDoc(doc(db, 'appSettings', 'videoMode'), {
        comingSoon: nextVal,
        updatedAt: serverTimestamp(),
      });
      setVideoComingSoon(nextVal);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'appSettings/videoMode');
      setError('Failed to update appSettings/videoMode.');
    }
  };

  const runFeedbackAnalysis = async () => {
    if (!isVerifiedAdmin || feedbacks.length === 0 || analyzing) return;
    setAnalyzing(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/analyze-admin-feedbacks', {
        method: 'POST',
        headers,
        body: JSON.stringify({ feedbacks, language }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `Feedback analysis failed (${resp.status}).`);
      }
      setAnalysis(data as AdminAnalysis);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Unable to analyze feedbacks.');
    } finally {
      setAnalyzing(false);
    }
  };

  const deleteFeedbackItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'feedbacks', id));
      setFeedbacks((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `feedbacks/${id}`);
    }
  };

  if (!isVerifiedAdmin) {
    return (
      <div className="p-6 rounded-2xl bg-red-950/30 border border-red-500/30 text-xs text-red-200">
        Verified Administrator sign-in (charlesmwajima@gmail.com with verified email) is required to access Admin controls.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-950 border border-white/10">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="text-emerald-400" size={18} />
          <div>
            <div className="text-sm font-bold text-white">Video Presentation Mode</div>
            <div className="text-xs text-slate-400">
              Toggle global availability of the Smartboard Video Storyboard tab
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleVideoModeSetting}
          className={`px-4 py-2 rounded-xl text-xs font-bold ${
            videoComingSoon ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white'
          }`}
        >
          {videoComingSoon ? 'Set Live (Currently Paused)' : 'Live (Click to Pause)'}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold text-slate-300">
          Student Feedback ({feedbacks.length}) &bull; Recent Lessons ({lessons.length})
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadAdminData}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1.5"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            onClick={runFeedbackAnalysis}
            disabled={analyzing || feedbacks.length === 0}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1.5"
          >
            <Sparkles size={12} /> {analyzing ? 'Analyzing...' : 'Analyze with AI'}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {analysis && (
        <div className="p-4 rounded-2xl bg-blue-950/30 border border-blue-500/30 space-y-2 text-xs">
          <div className="font-bold text-blue-300">
            Sentiment Score: {analysis.sentimentPercentage}%
          </div>
          <p className="text-slate-200 leading-relaxed">{analysis.summary}</p>
          {analysis.actionableRecommendations?.length > 0 && (
            <ul className="list-disc pl-5 text-slate-300 space-y-1">
              {analysis.actionableRecommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
        {feedbacks.map((fb) => (
          <div
            key={fb.id}
            className="p-3 rounded-xl bg-slate-950 border border-white/10 flex items-start justify-between gap-2 text-xs"
          >
            <div className="min-w-0">
              <div className="font-bold text-white truncate">{fb.topic}</div>
              <div className="text-slate-400">
                Quality {fb.quality_score}/5 &bull; Relevance {fb.relevance_score}/5
              </div>
              {fb.comments && <p className="text-slate-300 mt-1">{fb.comments}</p>}
            </div>
            <button
              type="button"
              onClick={() => deleteFeedbackItem(fb.id)}
              aria-label="Delete feedback"
              className="text-slate-500 hover:text-red-400 p-1"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
