import React, { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  updateProfile
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User, LogIn, UserPlus, Fingerprint, Sparkles, ShieldCheck, ExternalLink, Copy, Check, Globe, AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';

interface AuthGateProps {
  onSuccess?: () => void;
  onSandboxAccess?: () => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onSuccess, onSandboxAccess }) => {
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
  const isVercelDomain = currentHostname.includes('vercel.app');

  // Handle redirect result if user came back from signInWithRedirect
  useEffect(() => {
    let isMounted = true;
    getRedirectResult(auth)
      .then((result) => {
        if (!isMounted) return;
        if (result && result.user) {
          const isNewUser = result.user?.metadata?.creationTime === result.user?.metadata?.lastSignInTime;
          if (isNewUser) {
            localStorage.setItem('omnitutor_just_signed_up', 'true');
          }
          onSuccess?.();
        }
      })
      .catch((err: any) => {
        if (!isMounted) return;
        console.error("Redirect auth error:", err);
        const errCode = err?.code || "";
        const errMsg = err?.message || "";
        if (errCode === "auth/unauthorized-domain" || errMsg.includes("unauthorized-domain")) {
          setIsUnauthorizedDomain(true);
          setError(`Domain '${currentHostname}' is not authorized in Firebase Console.`);
        } else if (errCode) {
          setError(errMsg || "Google Sign-In failed.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentHostname, onSuccess]);

  const copyHostname = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
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
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        localStorage.setItem('omnitutor_just_signed_up', 'true');
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) {
          await updateProfile(userCredential.user, { displayName });
        }
      }
      onSuccess?.();
    } catch (err: any) {
      console.error("Auth error:", err);
      let message = "Authentication failed. Please check your credentials.";
      if (err.code === 'auth/email-already-in-use') message = "This email is already registered. Please switch to SIGN IN.";
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') message = "Incorrect password or credentials.";
      if (err.code === 'auth/user-not-found') message = "No account found with this email. Click REGISTER above to create one.";
      if (err.code === 'auth/weak-password') message = "Password should be at least 6 characters.";
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
      
      const isNewUser = userCredential.user?.metadata?.creationTime === userCredential.user?.metadata?.lastSignInTime;
      if (isNewUser) {
        localStorage.setItem('omnitutor_just_signed_up', 'true');
      }
      onSuccess?.();
    } catch (err: any) {
      console.error("Google login error:", err);
      const errCode = err.code || "";
      const errMsg = err.message || "";
      if (errCode === "auth/unauthorized-domain" || errMsg.includes("unauthorized-domain")) {
        setIsUnauthorizedDomain(true);
        setError(`Domain '${currentHostname}' is not yet added to your Firebase Authorized Domains.`);
      } else if (errCode === "auth/popup-blocked" || errMsg.includes("popup")) {
        setIsPopupBlocked(true);
        if (isVercelDomain) {
          setIsUnauthorizedDomain(true);
        }
        setError("🔒 Google Login popup was blocked by your browser! You can use 'Sign In with Google (Redirect Mode)' below (which doesn't require popups), sign in with Email & Password, or click 'Launch Sandbox Demo Mode'.");
      } else if (errCode === "auth/internal-error" || errMsg.includes("internal-error") || errMsg.includes("auth/internal-error")) {
        setIsUnauthorizedDomain(true);
        setError(`🔒 Google Sign-In failed with 'auth/internal-error'. This usually happens because: 1) Google Sign-In is not yet enabled in your Firebase console under Authentication, 2) This preview/deployment domain (${currentHostname}) is not added to your Firebase 'Authorized Domains' list, or 3) Third-party cookies are blocked.`);
      } else {
        setError(`Sync Google link error: ${errMsg || 'popup window or cookies blocked.'} Please register with Email/Password (works anywhere) or use Redirect Sign-In!`);
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
    } catch (err: any) {
      console.error("Google redirect login error:", err);
      const errCode = err.code || "";
      const errMsg = err.message || "";
      if (errCode === "auth/unauthorized-domain" || errMsg.includes("unauthorized-domain")) {
        setIsUnauthorizedDomain(true);
        setError(`Domain '${currentHostname}' is not authorized. Please add it to your Firebase Authorized Domains.`);
      } else {
        setError(`Google Redirect error: ${errMsg || 'Unable to redirect to Google'}`);
      }
      setLoading(false);
      setIsRedirecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#020617] overflow-y-auto p-4 py-12 md:py-8">
      {/* Background Animated Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.2, 0.1],
            rotate: [0, 90, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-1/4 -left-1/4 w-[1000px] h-[1000px] bg-blue-500/10 blur-[150px] rounded-full"
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.1, 1],
            opacity: [0.05, 0.15, 0.05],
            rotate: [0, -45, 0]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-1/4 -right-1/4 w-[800px] h-[800px] bg-indigo-500/10 blur-[150px] rounded-full"
        />
        
        {/* Grid Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e3a8a30_1px,transparent_1px),linear-gradient(to_bottom,#1e3a8a30_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-md p-8 sm:p-12 z-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-blue-600/10 border border-blue-500/20 mb-6 group">
             <Fingerprint className="text-blue-500 w-10 h-10 group-hover:scale-110 transition-transform" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight uppercase mb-2 italic">
            Tutor<span className="text-blue-500">Node</span>
          </h1>
          <p className="text-slate-400 text-sm font-medium tracking-wide uppercase">Neural Academy Access Point</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden relative group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"></div>
          
          <div className="flex bg-slate-950/50 p-1.5 rounded-2xl mb-8 border border-white/5">
            <button 
              onClick={() => setIsLogin(true)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isLogin ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <LogIn size={14} /> SIGN IN
            </button>
            <button 
              onClick={() => setIsLogin(false)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${!isLogin ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <UserPlus size={14} /> REGISTER
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 overflow-hidden"
                >
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                  <div className="relative group/input">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within/input:text-blue-500 transition-colors" size={18} />
                    <input 
                      type="text" 
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all font-medium"
                      required={!isLogin}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative group/input">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within/input:text-blue-500 transition-colors" size={18} />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all font-medium"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Password</label>
              <div className="relative group/input">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within/input:text-blue-500 transition-colors" size={18} />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all font-medium"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="space-y-3">
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-500/10 border border-red-500/20 p-3.5 rounded-xl flex items-start gap-3 text-red-400 text-xs font-semibold"
                >
                  <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-400" />
                  <span className="leading-relaxed">{error}</span>
                </motion.div>

                {(isUnauthorizedDomain || isVercelDomain) && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-amber-950/40 border border-amber-500/30 rounded-2xl p-4 space-y-3 text-xs"
                  >
                    <div className="flex items-center gap-2 text-amber-400 font-bold">
                      <Globe size={14} />
                      <span>Firebase Authorized Domain Required:</span>
                    </div>

                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                      For Google Sign-In to work on Vercel, Firebase requires your domain to be whitelisted:
                    </p>

                    <div className="bg-black/60 rounded-xl p-2.5 border border-white/10 flex items-center justify-between gap-2 font-mono text-[11px] text-amber-200">
                      <span className="truncate">{currentHostname || 'this domain'}</span>
                      <button
                        type="button"
                        onClick={copyHostname}
                        className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                      >
                        {copiedDomain ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        <span>{copiedDomain ? 'Copied!' : 'Copy Domain'}</span>
                      </button>
                    </div>

                    <ol className="text-[10px] text-zinc-400 list-decimal list-inside space-y-1">
                      <li>Open <a href="https://console.firebase.google.com/project/bwai-pwani-charles/authentication/settings" target="_blank" rel="noopener noreferrer" className="text-amber-300 underline font-semibold">Firebase Console &gt; Auth Settings <ExternalLink size={10} className="inline ml-0.5" /></a></li>
                      <li>Scroll to <strong className="text-zinc-200">Authorized domains &gt; Add domain</strong></li>
                      <li>Paste <code className="text-amber-300 bg-black/40 px-1 py-0.5 rounded">{currentHostname}</code> and save.</li>
                    </ol>

                    <div className="pt-2 border-t border-white/5 flex flex-col gap-1.5">
                      <p className="text-[10px] font-bold text-emerald-400">
                        ⚡ Or Use Instant Login (No domain setup required):
                      </p>
                      <p className="text-[10px] text-zinc-300">
                        Sign in with <strong>Email &amp; Password</strong> above, or click <strong>Launch Sandbox Demo Mode</strong> below for instant full access!
                      </p>
                    </div>
                  </motion.div>
                )}

                {(isPopupBlocked || error?.toLowerCase().includes("popup") || error?.toLowerCase().includes("blocked")) && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2"
                  >
                    <button 
                      type="button"
                      onClick={handleGoogleRedirectLogin}
                      disabled={loading || isRedirecting}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black py-3.5 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20 text-center cursor-pointer disabled:opacity-50"
                    >
                      {isRedirecting ? (
                        <div className="flex items-center gap-2">
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Redirecting to Google...</span>
                        </div>
                      ) : (
                        <>
                          <span>Sign In with Google (Redirect Mode)</span>
                          <ArrowRight size={14} />
                        </>
                      )}
                    </button>
                    <p className="text-[10px] text-zinc-400 text-center">
                      Redirect mode avoids browser popup blockers by navigating directly in this tab.
                    </p>
                  </motion.div>
                )}
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className={`w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/20 transition-all active:scale-95 flex items-center justify-center gap-2 uppercase tracking-[0.2em] text-[11px] mt-2`}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  {isLogin ? 'Establish Link' : 'Initialize Node'}
                  <Sparkles size={14} />
                </>
              )}
            </button>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/5"></div>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest text-slate-600">
                <span className="bg-[#0f172a] px-4">Cloud Uplink</span>
              </div>
            </div>

            <button 
              type="button" 
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full bg-[#1e293b] text-white hover:bg-[#334155] border border-white/5 font-bold py-3.5 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-3 text-xs uppercase tracking-widest shadow-xl shadow-black/20"
            >
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-blue-500"></div>
                <span>Sync Google Uplink</span>
              </div>
            </button>

            {typeof window !== 'undefined' && window.self !== window.top && (
              <p className="text-[10px] text-center text-slate-500 mt-2 leading-relaxed">
                Running in preview frame? For an unrestricted login experience, you can{' '}
                <a 
                  href={window.location.href} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-400 hover:underline font-bold inline-flex items-center gap-0.5"
                >
                  Open in New Tab <ExternalLink size={10} />
                </a>
              </p>
            )}

            {onSandboxAccess && (
              <button 
                type="button" 
                onClick={onSandboxAccess}
                className="w-full mt-3 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 hover:from-blue-600/35 hover:to-indigo-600/35 text-blue-400 border border-blue-500/30 hover:border-blue-500/50 font-black py-3.5 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 text-xs uppercase tracking-widest shadow-lg shadow-blue-500/5 cursor-pointer"
              >
                <span>Launch Sandbox Demo Mode</span>
              </button>
            )}
          </form>

          <div className="mt-8 pt-6 border-t border-white/5 flex flex-col items-center gap-4">
             <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full bg-blue-500/40 animate-pulse`} style={{ animationDelay: `${i * 0.2}s` }}></div>
                ))}
             </div>
             <p className="text-[10px] text-slate-600 font-mono text-center leading-relaxed">
                SESSION_SECURE: AES-256_ENC<br/>
                NEURAL_STABILITY: 98.4%
             </p>
          </div>
        </div>
        
        <p className="mt-8 text-center text-slate-500 text-[10px] font-medium uppercase tracking-[0.3em]">
          Universal Neural Network protocol v4.2.0
        </p>
      </motion.div>
    </div>
  );
};
