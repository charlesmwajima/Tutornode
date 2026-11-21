import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Unlock, Fingerprint, Shield, LogOut, Delete, Eye, EyeOff } from 'lucide-react';
import {
  hasWebAuthnCredential,
  verifyAppLockPin,
  verifyWebAuthnBiometric,
} from '../lib/appLock';

interface AppLockScreenProps {
  onUnlock: () => void;
  onSignOut: () => void;
  accentColor: string;
  user: { uid?: string; email?: string | null } | null;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({
  onUnlock,
  onSignOut,
  accentColor,
  user,
}) => {
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBiometricAuthenticating, setIsBiometricAuthenticating] = useState(false);
  const [isUnlockedAnim, setIsUnlockedAnim] = useState(false);
  const [hasHardwarePasskey, setHasHardwarePasskey] = useState(false);

  const uKey = user?.uid || user?.email || 'anonymous';

  useEffect(() => {
    setHasHardwarePasskey(hasWebAuthnCredential(uKey));
  }, [uKey]);

  const triggerUnlock = () => {
    setIsUnlockedAnim(true);
    setTimeout(() => {
      onUnlock();
    }, 550);
  };

  const handleHardwarePasskeyUnlock = async () => {
    setError(null);
    setIsBiometricAuthenticating(true);
    try {
      const ok = await verifyWebAuthnBiometric(uKey);
      if (ok) {
        triggerUnlock();
      } else {
        setError('Passkey verification did not succeed.');
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Device passkey verification failed.';
      const name = (err as { name?: string })?.name || '';
      if (name === 'SecurityError') {
        setError('Passkeys require a top-level browser tab. Unlock using your Security PIN below.');
      } else if (name === 'NotAllowedError') {
        setError('Passkey verification was cancelled or timed out.');
      } else {
        setError(msg);
      }
    } finally {
      setIsBiometricAuthenticating(false);
    }
  };

  const handlePasswordSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!passwordInput.trim()) return;
    setError(null);

    try {
      const valid = await verifyAppLockPin(uKey, passwordInput);
      if (valid) {
        triggerUnlock();
      } else {
        setError('Incorrect security PIN. Please try again.');
        setPasswordInput('');
        if (navigator.vibrate) {
          navigator.vibrate(100);
        }
      }
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Unable to verify PIN in this browser.');
    }
  };

  const handleKeypadPress = (val: string) => {
    setError(null);
    if (passwordInput.length < 12) {
      setPasswordInput((prev) => prev + val);
    }
  };

  const handleKeypadBackspace = () => {
    setPasswordInput((prev) => prev.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-slate-950 text-white select-none p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-sm p-6 flex flex-col items-center z-10 bg-slate-900/80 border border-white/10 rounded-3xl shadow-2xl"
      >
        <div className="mb-5">
          <AnimatePresence mode="wait">
            {isUnlockedAnim ? (
              <motion.div
                key="unlocked"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1.05, opacity: 1 }}
                className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400"
              >
                <Unlock size={36} />
              </motion.div>
            ) : (
              <motion.div
                key="locked"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-20 h-20 rounded-full bg-slate-950 border border-white/10 flex items-center justify-center"
              >
                <Lock size={34} style={{ color: accentColor }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <h2 className="text-lg font-extrabold tracking-tight text-center">
          TutorNode <span className="text-blue-400">App Lock</span>
        </h2>
        <p className="text-xs text-slate-400 text-center mt-1 mb-6">
          {isUnlockedAnim ? 'Unlocked — opening classroom...' : 'Enter your security PIN to resume your session'}
        </p>

        {error && (
          <div className="w-full bg-red-950/50 border border-red-500/30 px-3.5 py-2.5 rounded-xl text-red-300 text-xs text-center mb-5 flex items-center justify-center gap-2">
            <Shield size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!isUnlockedAnim && (
          <div className="w-full flex flex-col items-center space-y-5">
            <form onSubmit={handlePasswordSubmit} className="w-full">
              <div className="relative flex items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter Security PIN"
                  className="w-full bg-slate-950 border border-white/10 rounded-xl py-3.5 pl-4 pr-12 text-center font-mono font-bold tracking-[0.2em] text-white placeholder:text-slate-500 placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 text-slate-400 hover:text-white p-1.5"
                  aria-label={showPassword ? 'Hide PIN' : 'Show PIN'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </form>

            <div className="grid grid-cols-3 gap-2.5 w-full max-w-[260px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeypadPress(num)}
                  className="h-12 rounded-xl bg-slate-800/70 hover:bg-slate-700 active:scale-95 border border-white/5 text-base font-bold text-slate-200 transition-all"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleKeypadBackspace}
                aria-label="Backspace"
                className="h-12 rounded-xl bg-slate-950/60 hover:bg-slate-800 active:scale-95 text-slate-400 hover:text-red-400 flex items-center justify-center transition-all"
              >
                <Delete size={18} />
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress('0')}
                className="h-12 rounded-xl bg-slate-800/70 hover:bg-slate-700 active:scale-95 border border-white/5 text-base font-bold text-slate-200 transition-all"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => handlePasswordSubmit()}
                disabled={passwordInput.length === 0}
                className="h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-30 text-xs font-bold uppercase tracking-wider transition-all"
              >
                Unlock
              </button>
            </div>

            {hasHardwarePasskey && (
              <button
                type="button"
                onClick={handleHardwarePasskeyUnlock}
                disabled={isBiometricAuthenticating}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-600/15 hover:bg-cyan-600/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all"
              >
                <Fingerprint size={15} />
                {isBiometricAuthenticating ? 'Waiting for Device Passkey...' : 'Unlock with Device Passkey'}
              </button>
            )}
          </div>
        )}

        <div className="mt-7 pt-4 border-t border-white/10 w-full flex justify-center">
          <button
            type="button"
            onClick={onSignOut}
            className="text-xs text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1.5 font-semibold"
          >
            <LogOut size={13} />
            Reset lock by signing out
          </button>
        </div>
      </motion.div>
    </div>
  );
};
