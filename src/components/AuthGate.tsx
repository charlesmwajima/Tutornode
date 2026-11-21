import React, { useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mail,
  Lock,
  User,
  LogIn,
  UserPlus,
  GraduationCap,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Globe,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  BookOpen,
} from 'lucide-react';

interface AuthGateProps {
  onSuccess?: () => void;
  onPreviewAccess?: () => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onSuccess, onPreviewAccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorizedDomain, setIsUnauthorizedDomain] = useState(false);
  const [isPopupBlocked, setIsPopupBlocked] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';

  useEffect(() => {
    let isMounted = true;
    getRedirectResult(auth)
      .then((result) => {
        if (!isMounted) return;
        if (result?.user) {
          const isNewUser = result.user.metadata?.creationTime === result.user.metadata?.lastSignInTime;
          if (isNewUser) {
            localStorage.setItem('tutornode_just_signed_up', 'true');
          }
          onSuccess?.();
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const errCode = (err as { code?: string })?.code || '';
        const errMsg = (err as { message?: string })?.message || '';
        if (errCode === 'auth/unauthorized-domain' || errMsg.includes('unauthorized-domain')) {
          setIsUnauthorizedDomain(true);
          setError(`Domain '${currentHostname}' is not authorized in Firebase Console.`);
        } else if (errCode) {
          setError(errMsg || 'Google Sign-In failed.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentHostname, onSuccess]);

  const copyHostname = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard && currentHostname) {
      navigator.clipboard.writeText(currentHostname);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsUnauthorizedDomain(false);
    setIsPopupBlocked(false);
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        localStorage.setItem('tutornode_just_signed_up', 'true');
        const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName.trim()) {
          await updateProfile(userCredential.user, { displayName: displayName.trim() });
        }
      }
      onSuccess?.();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      let message = 'Authentication failed. Please check your credentials.';
      if (code === 'auth/email-already-in-use') {
        message = 'This email is already registered. Switch to Sign In above.';
      } else if (
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-email'
      ) {
        message = 'Invalid email or password. Please verify and try again.';
      } else if (code === 'auth/user-not-found') {
        message = 'No account found with this email. Switch to Register above to create one.';
      } else if (code === 'auth/weak-password') {
        message = 'Password must be at least 6 characters.';
      } else if (code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please wait briefly before trying again.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setIsUnauthorizedDomain(false);
    setIsPopupBlocked(false);
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const userCredential = await signInWithPopup(auth, provider);
      const isNewUser =
        userCredential.user.metadata?.creationTime === userCredential.user.metadata?.lastSignInTime;
      if (isNewUser) {
        localStorage.setItem('tutornode_just_signed_up', 'true');
      }
      onSuccess?.();
    } catch (err: unknown) {
      const errCode = (err as { code?: string })?.code || '';
      const errMsg = (err as { message?: string })?.message || '';
      if (errCode === 'auth/unauthorized-domain' || errMsg.includes('unauthorized-domain')) {
        setIsUnauthorizedDomain(true);
        setError(
          `Google Sign-In requires '${currentHostname}' in Firebase Authorized Domains. Email & Password works immediately below without extra setup.`
        );
      } else if (
        errCode === 'auth/popup-blocked' ||
        errCode === 'auth/popup-closed-by-user' ||
        errMsg.includes('popup')
      ) {
        setIsPopupBlocked(true);
        setError(
          'Google Sign-In popup was blocked or closed. Use Redirect Mode below or sign in with Email & Password.'
        );
      } else if (errCode === 'auth/internal-error' || errMsg.includes('internal-error')) {
        setIsUnauthorizedDomain(true);
        setError(
          `Google Sign-In hit a configuration error on '${currentHostname}'. Ensure Google provider is enabled and this domain is listed in Firebase Authentication settings, or use Email & Password.`
        );
      } else {
        setError(errMsg || 'Unable to sign in with Google. Try Email & Password above.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRedirectLogin = async () => {
    setError(null);
    setLoading(true);
    setIsRedirecting(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithRedirect(auth, provider);
    } catch (err: unknown) {
      const errCode = (err as { code?: string })?.code || '';
      const errMsg = (err as { message?: string })?.message || '';
      if (errCode === 'auth/unauthorized-domain' || errMsg.includes('unauthorized-domain')) {
        setIsUnauthorizedDomain(true);
        setError(`Domain '${currentHostname}' is not authorized in Firebase Console.`);
      } else {
        setError(errMsg || 'Unable to redirect to Google Sign-In.');
      }
      setLoading(false);
      setIsRedirecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950 overflow-y-auto p-4 py-10">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[560px] h-[560px] bg-blue-600/10 blur-[140px] rounded-full" />
        <div className="absolute -bottom-40 -right-40 w-[560px] h-[560px] bg-sky-500/10 blur-[140px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md z-10 my-auto"
      >
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600/15 border border-blue-500/30 mb-4">
            <GraduationCap className="text-blue-400 w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Tutor<span className="text-blue-400">Node</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            AI-Guided Lessons, Exam Revision & Document Study
          </p>
        </div>

        <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="flex bg-slate-950/70 p-1 rounded-xl mb-6 border border-white/5">
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                isLogin ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LogIn size={14} /> Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLogin(false);
                setError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                !isLogin ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus size={14} /> Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-1.5 overflow-hidden"
                >
                  <label className="text-xs font-semibold text-slate-300 block">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="w-full bg-slate-950/70 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      required={!isLogin}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@example.com"
                  className="w-full bg-slate-950/70 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  className="w-full bg-slate-950/70 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="space-y-3">
                <div className="bg-red-500/10 border border-red-500/30 p-3.5 rounded-xl flex items-start gap-2.5 text-red-300 text-xs">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-400" />
                  <span className="leading-relaxed">{error}</span>
                </div>

                {isUnauthorizedDomain && (
                  <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3.5 space-y-2.5 text-xs">
                    <div className="flex items-center gap-2 text-amber-300 font-semibold">
                      <Globe size={14} />
                      <span>Add Domain for Google Sign-In</span>
                    </div>
                    <div className="bg-black/50 rounded-lg p-2 border border-white/10 flex items-center justify-between gap-2 font-mono text-[11px] text-amber-200">
                      <span className="truncate">{currentHostname || 'localhost'}</span>
                      <button
                        type="button"
                        onClick={copyHostname}
                        className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded text-[10px] font-bold flex items-center gap-1 shrink-0"
                      >
                        {copiedDomain ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        {copiedDomain ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      In Firebase Console &rarr; Authentication &rarr; Settings &rarr; Authorized domains, add{' '}
                      <code className="text-amber-300">{currentHostname}</code>. Email &amp; Password sign-in works without waiting.
                    </p>
                  </div>
                )}

                {isPopupBlocked && (
                  <button
                    type="button"
                    onClick={handleGoogleRedirectLogin}
                    disabled={loading || isRedirecting}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs"
                  >
                    {isRedirecting ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" /> Redirecting to Google...
                      </>
                    ) : (
                      <>
                        Continue Google Sign-In via Redirect <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isLogin ? 'Sign In to Classroom' : 'Create Student Account'}
                  <Sparkles size={14} />
                </>
              )}
            </button>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-wider text-slate-500">
                <span className="bg-slate-900 px-3">Or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white border border-white/10 font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2.5 text-xs"
            >
              <Globe size={15} className="text-blue-400" />
              <span>Continue with Google</span>
            </button>

            {typeof window !== 'undefined' && window.self !== window.top && (
              <p className="text-[11px] text-center text-slate-400 mt-1">
                Inside an embedded frame?{' '}
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline font-semibold inline-flex items-center gap-1"
                >
                  Open in new tab <ExternalLink size={11} />
                </a>
              </p>
            )}

            {onPreviewAccess && (
              <button
                type="button"
                onClick={onPreviewAccess}
                className="w-full mt-2 bg-slate-950/60 hover:bg-slate-800/80 text-slate-300 border border-white/10 font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-xs"
              >
                <BookOpen size={14} className="text-sky-400" />
                <span>Browse Built-In Curriculum (Read-Only)</span>
              </button>
            )}
          </form>
        </div>
      </motion.div>
    </div>
  );
};
