import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Unlock, Fingerprint, Shield, LogOut, Delete, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

interface AppLockScreenProps {
  onUnlock: () => void;
  onSignOut: () => void;
  accentColor: string;
  user: any;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({ onUnlock, onSignOut, accentColor, user }) => {
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [isBiometricEnrolled, setIsBiometricEnrolled] = useState(false);
  const [isBiometricAuthenticating, setIsBiometricAuthenticating] = useState(false);
  const [isUnlockedAnim, setIsUnlockedAnim] = useState(false);
  
  // Custom states for the enrolled finger profile and fingerprint scanner
  const [enrolledFinger, setEnrolledFinger] = useState<string>('Right Thumb');
  const [enrolledSignature, setEnrolledSignature] = useState<string>('');
  const [selectedFingerForScan, setSelectedFingerForScan] = useState<'registered' | 'other' | 'intruder'>('registered');
  
  const [isWebAuthnCredentialRegistered, setIsWebAuthnCredentialRegistered] = useState(false);
  
  // Custom auth method state to toggle between biometric and pin pad
  const [authMethod, setAuthMethod] = useState<'biometric' | 'password'>('password');
  const [scanProgress, setScanProgress] = useState(0);

  const scanIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check if biometric is supported & enrolled on this device
    const checkBiometricSupport = async () => {
      const uKey = user?.uid || user?.email || "anonymous";
      const enrolled = localStorage.getItem(`tutor_app_lock_biometrics_enabled_${uKey}`) === 'true';
      setIsBiometricEnrolled(enrolled);

      const hasWebAuthn = !!localStorage.getItem(`tutor_app_lock_webauthn_credential_id_${uKey}`);
      setIsWebAuthnCredentialRegistered(hasWebAuthn);

      if (enrolled) {
        const savedFinger = localStorage.getItem(`tutor_app_lock_enrolled_finger_${uKey}`) || 'Right Thumb';
        const savedSig = localStorage.getItem(`tutor_app_lock_fingerprint_signature_id_${uKey}`) || 'BIO-SIG-1024-DEF';
        setEnrolledFinger(savedFinger);
        setEnrolledSignature(savedSig);
        setAuthMethod('biometric');
      } else {
        setEnrolledFinger('');
        setEnrolledSignature('');
        setAuthMethod('password');
      }

      if (window.PublicKeyCredential) {
        try {
          const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setIsBiometricAvailable(available);
        } catch (e) {
          console.warn("Biometric availability check failed:", e);
          setIsBiometricAvailable(true); // Treat as available for preview demo/sandbox fallback
        }
      } else {
        setIsBiometricAvailable(false);
      }
    };

    checkBiometricSupport();

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [user]);

  const authenticateWebAuthnBiometrics = async () => {
    setError(null);
    const uKey = user?.uid || user?.email || "anonymous";
    const credentialIdB64 = localStorage.getItem(`tutor_app_lock_webauthn_credential_id_${uKey}`);
    if (!credentialIdB64) {
      setError("No native hardware credential enrolled on this browser session. Please enroll your fingerprint in Settings.");
      return;
    }

    if (!window.PublicKeyCredential) {
      setError("Biometric WebAuthn API is not supported by your current browser/device.");
      return;
    }

    try {
      setIsBiometricAuthenticating(true);
      setScanProgress(30);

      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      // Convert base64 back to Uint8Array
      const rawCredentialId = Uint8Array.from(atob(credentialIdB64), c => c.charCodeAt(0));

      setScanProgress(60);

      const requestOptions: PublicKeyCredentialRequestOptions = {
        challenge,
        rpId: window.location.hostname || "localhost",
        allowCredentials: [{
          id: rawCredentialId,
          type: 'public-key',
        }],
        userVerification: "required",
        timeout: 60000,
      };

      const assertion = await navigator.credentials.get({
        publicKey: requestOptions,
      }) as PublicKeyCredential;

      if (assertion) {
        setScanProgress(100);
        setIsBiometricAuthenticating(false);
        handleUnlockSuccess();
      }
    } catch (err: any) {
      console.error("WebAuthn verification error:", err);
      setIsBiometricAuthenticating(false);
      setScanProgress(0);

      let friendlyMessage = err.message || "An unknown error occurred during device authentication.";
      if (err.name === "SecurityError") {
        friendlyMessage = "Security restriction: Browser blocked credential access inside a sandboxed iframe. Please click the 'Open App in New Tab' link at the bottom of the screen to run outside the sandbox.";
      } else if (err.name === "NotAllowedError") {
        friendlyMessage = "The operation was cancelled or timed out.";
      }
      setError(`🚨 HARDWARE SENSOR ERROR: ${friendlyMessage}`);
    }
  };

  const startScanning = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (isUnlockedAnim) return;

    if (!isBiometricEnrolled) {
      setError("🚨 ACCESS DENIED: No fingerprint has been enrolled on this account. Please unlock using your PIN/Password.");
      return;
    }

    setIsBiometricAuthenticating(true);
    setScanProgress(0);
    setError(null);

    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }

    let progress = 0;
    scanIntervalRef.current = setInterval(() => {
      progress += 10;
      if (progress >= 100) {
        setScanProgress(100);
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
        }

        if (selectedFingerForScan === 'registered') {
          handleUnlockSuccess();
        } else {
          setIsBiometricAuthenticating(false);
          setScanProgress(0);
          
          // Generate a fake mismatching signature for the intruder
          const randNum = Math.floor(1000 + Math.random() * 9000);
          const randLetters = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + String.fromCharCode(65 + Math.floor(Math.random() * 26));
          const intruderSig = `BIO-SIG-${randNum}-${randLetters}`;
          const intruderName = selectedFingerForScan === 'other' ? 'Left Index Finger' : 'Unknown Intruder Finger';
          
          setError(`🚨 ACCESS DENIED: Biometric Signature Mismatch! Scanned finger (${intruderName} [${intruderSig}]) does not match the enrolled authorized signature (${enrolledFinger} [${enrolledSignature || 'NO_ENROLLED_FINGERPRINT'}]). ONLY the saved fingerprint can unlock this workspace.`);
          
          // Play a security synthesizer voice warning
          if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            const warningUtterance = new SpeechSynthesisUtterance("Access denied. Unauthorized fingerprint detected.");
            warningUtterance.pitch = 0.85;
            warningUtterance.rate = 1.0;
            window.speechSynthesis.speak(warningUtterance);
          }
          
          if (navigator.vibrate) {
            navigator.vibrate([120, 80, 120]);
          }
        }
      } else {
        setScanProgress(progress);
      }
    }, 120); // Scan takes exactly 1.2 seconds of holding down
  };

  const stopScanning = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    if (isBiometricAuthenticating && !isUnlockedAnim && scanProgress < 100) {
      setIsBiometricAuthenticating(false);
      setScanProgress(0);
      setError("⚠️ Scan interrupted! Keep your finger held down on the sensor until the scan is 100% complete.");
    }
  };

  const handleUnlockSuccess = () => {
    setIsUnlockedAnim(true);
    setTimeout(() => {
      onUnlock();
    }, 800);
  };

  const handlePasswordSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const uKey = user?.uid || user?.email || "anonymous";
    const savedPassword = localStorage.getItem(`tutor_app_lock_password_${uKey}`) || '';
    
    if (passwordInput === savedPassword) {
      handleUnlockSuccess();
    } else {
      setError("Incorrect password or security PIN. Please try again.");
      setPasswordInput('');
      
      // Vibrate if supported
      if (navigator.vibrate) {
        navigator.vibrate(100);
      }
    }
  };

  const handleKeypadPress = (val: string) => {
    setError(null);
    if (passwordInput.length < 8) {
      setPasswordInput(prev => prev + val);
    }
  };

  const handleKeypadBackspace = () => {
    setPasswordInput(prev => prev.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-[#030712] text-white select-none">
      {/* Dynamic particles or visual background matching neural link motif */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px]"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md p-6 flex flex-col items-center z-10"
      >
        {/* Animated Security Status Badge / Large Indicator */}
        <div className="relative mb-6">
          <AnimatePresence mode="wait">
            {isUnlockedAnim ? (
              <motion.div
                key="unlocked"
                initial={{ scale: 0.8, rotate: -45, opacity: 0 }}
                animate={{ scale: 1.1, rotate: 0, opacity: 1 }}
                className="w-24 h-24 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.2)]"
              >
                <Unlock size={44} className="animate-pulse" />
              </motion.div>
            ) : isBiometricAuthenticating ? (
              <motion.div
                key="scanning"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-24 h-24 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 relative shadow-[0_0_40px_rgba(59,130,246,0.15)]"
              >
                <Fingerprint size={44} className="animate-pulse" />
                <motion.div
                  className="absolute inset-0 rounded-full border border-blue-500/60"
                  animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="locked"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-24 h-24 rounded-full bg-slate-900/80 border border-white/10 flex items-center justify-center text-slate-300 shadow-[0_0_30px_rgba(255,255,255,0.02)]"
              >
                <Lock size={40} style={{ color: accentColor }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Text Header */}
        <h2 className="text-xl font-black uppercase tracking-[0.2em] mb-1.5 italic text-center">
          TUTORNODE <span className="text-blue-500 font-sans not-italic">LOCK</span>
        </h2>
        <p className="text-xs text-slate-400 font-medium tracking-wide uppercase text-center mb-8">
          {isUnlockedAnim 
            ? "Access Approved - Opening Workspace" 
            : isBiometricAuthenticating 
            ? `Scanning Biometrics (${scanProgress}%)` 
            : "Authorized Access Only"}
        </p>

        {/* Error Notification */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-red-950/40 border border-red-500/20 px-4 py-3 rounded-2xl text-red-400 text-xs font-bold text-center mb-6 flex items-center justify-center gap-2"
          >
            <Shield size={14} /> {error}
          </motion.div>
        )}

        {/* INTERACTIVE BIOMETRIC SENSOR VIEW */}
        {authMethod === 'biometric' && !isUnlockedAnim && (
          <div className="w-full flex flex-col items-center space-y-8 animate-fadeIn">
            <div className="flex flex-col items-center space-y-6 w-full">
              {/* Glowing, Tactile Sensor Button with Gesture Handlers */}
              <button
                type="button"
                onMouseDown={isWebAuthnCredentialRegistered ? undefined : startScanning}
                onMouseUp={isWebAuthnCredentialRegistered ? undefined : stopScanning}
                onMouseLeave={isWebAuthnCredentialRegistered ? undefined : stopScanning}
                onTouchStart={isWebAuthnCredentialRegistered ? undefined : startScanning}
                onTouchEnd={isWebAuthnCredentialRegistered ? undefined : stopScanning}
                onTouchCancel={isWebAuthnCredentialRegistered ? undefined : stopScanning}
                onClick={isWebAuthnCredentialRegistered ? authenticateWebAuthnBiometrics : undefined}
                className={`w-36 h-36 rounded-full flex flex-col items-center justify-center cursor-pointer relative overflow-hidden transition-all duration-300 select-none ${
                  isBiometricAuthenticating
                    ? "bg-slate-950 border-2 border-cyan-500 shadow-[0_0_50px_rgba(34,211,238,0.3)] text-cyan-400"
                    : isWebAuthnCredentialRegistered
                      ? "bg-gradient-to-b from-cyan-600/10 to-cyan-900/20 border-2 border-cyan-500/40 hover:border-cyan-400 hover:shadow-[0_0_40px_rgba(34,211,238,0.25)] text-cyan-400"
                      : "bg-gradient-to-b from-blue-600/10 to-blue-900/20 border-2 border-blue-500/30 hover:border-blue-400 hover:shadow-[0_0_40px_rgba(59,130,246,0.15)] text-blue-400 hover:text-blue-300"
                }`}
              >
                <Fingerprint size={isBiometricAuthenticating ? 64 : 56} className={`transition-all duration-300 ${isBiometricAuthenticating ? "animate-pulse scale-105 text-cyan-400" : ""}`} />
                
                {/* Moving scanning glow bar when active */}
                {isBiometricAuthenticating && (
                  <motion.div
                    className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#22d3ee] z-20"
                    initial={{ top: "0%" }}
                    animate={{ top: "100%" }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                  />
                )}

                {/* Radial progress filling up background */}
                {isBiometricAuthenticating && (
                  <div 
                    className="absolute inset-0 bg-blue-500/15 transition-all duration-100 ease-out pointer-events-none" 
                    style={{ clipPath: `inset(${100 - scanProgress}% 0px 0px 0px)` }}
                  />
                )}
                
                <span className="absolute -bottom-1 w-20 h-1 bg-blue-500/40 rounded-full blur-md" />
              </button>
              
              <div className="text-center space-y-2 w-full max-w-xs">
                {isBiometricAuthenticating ? (
                  <>
                    <p className="text-xs font-black text-cyan-400 uppercase tracking-widest animate-pulse">
                      {isWebAuthnCredentialRegistered ? "Verifying with Device..." : `Scanning: ${scanProgress}%`}
                    </p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                      {isWebAuthnCredentialRegistered ? "🔴 PLEASE TOUCH DEVICE SENSOR" : "🔴 HOLD YOUR FINGER DOWN FIRMLY!"}
                    </p>
                    <div className="w-48 mx-auto h-1.5 bg-slate-950 rounded-full overflow-hidden border border-white/5 mt-2">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-100"
                        style={{ width: `${isWebAuthnCredentialRegistered ? 100 : scanProgress}%` }}
                      />
                    </div>
                  </>
                ) : isWebAuthnCredentialRegistered ? (
                  <>
                    <p className="text-xs font-black text-cyan-400 uppercase tracking-widest animate-pulse">
                      Tap Reader to Unlock
                    </p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                      Triggers your device's physical fingerprint sensor
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-black text-white uppercase tracking-widest animate-pulse">
                      Press and Hold Sensor
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                      Hold finger on the reader above to scan fingerprint
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* SECURE HARDWARE WEB-AUTH SCAN TRIGGER */}
            {isWebAuthnCredentialRegistered && (
              <div className="w-full max-w-sm bg-slate-950/60 border border-cyan-500/20 rounded-2xl p-4 space-y-3.5 shadow-xl animate-fadeIn text-center">
                <div className="flex items-center justify-center gap-2 border-b border-white/5 pb-2">
                  <Fingerprint size={14} className="text-cyan-400 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
                    Hardware Biometric Access
                  </span>
                </div>
                <p className="text-[9px] text-slate-400 leading-relaxed uppercase font-bold tracking-wider">
                  Your device fingerprint sensor is enrolled. Click below to verify identity:
                </p>
                <button
                  type="button"
                  onClick={authenticateWebAuthnBiometrics}
                  className="w-full bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:via-blue-500 hover:to-indigo-500 text-white font-black py-3 px-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest shadow-lg shadow-cyan-500/20 cursor-pointer border border-cyan-400/20"
                >
                  <Fingerprint size={14} className="animate-pulse" />
                  Trigger Device Sensor
                </button>
              </div>
            )}

            {/* Simulated Biometric Signature Emulator touchpad */}
            {!isBiometricAuthenticating && (
              <div className="w-full max-w-sm bg-slate-950/80 border border-white/5 rounded-2xl p-4 space-y-3 shadow-2xl animate-fadeIn">
                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                  <Fingerprint size={14} className="text-blue-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Biometric Signature Emulator
                  </span>
                </div>
                
                <p className="text-[9px] text-slate-500 leading-relaxed uppercase font-bold tracking-wider text-left">
                  Touchpad Selector: Which finger are you placing on the glass?
                </p>

                <div className="flex flex-col gap-2">
                  {/* Option 1: Registered Finger */}
                  <button
                    type="button"
                    onClick={() => setSelectedFingerForScan('registered')}
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer ${
                      selectedFingerForScan === 'registered'
                        ? "bg-blue-600/10 border-blue-500/50 text-blue-400"
                        : "bg-slate-900/40 border-white/5 text-slate-400 hover:bg-slate-900/60"
                    }`}
                  >
                    <div className="mt-0.5">
                      <div className={`w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center`}>
                        {selectedFingerForScan === 'registered' && <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider">
                        Authorized {enrolledFinger} (Correct Match)
                      </div>
                      <div className="text-[8px] font-mono text-slate-500 mt-0.5">
                        Transmits Registered Signature: <span className="text-slate-400 font-bold">{enrolledSignature || 'BIO-SIG-7721-F'}</span>
                      </div>
                    </div>
                  </button>

                  {/* Option 2: Other Finger */}
                  <button
                    type="button"
                    onClick={() => setSelectedFingerForScan('other')}
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer ${
                      selectedFingerForScan === 'other'
                        ? "bg-amber-600/10 border-amber-500/50 text-amber-400"
                        : "bg-slate-900/40 border-white/5 text-slate-400 hover:bg-slate-900/60"
                    }`}
                  >
                    <div className="mt-0.5">
                      <div className={`w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center`}>
                        {selectedFingerForScan === 'other' && <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider">
                        Left Index Finger (Mismatch)
                      </div>
                      <div className="text-[8px] font-mono text-slate-500 mt-0.5">
                        Transmits Mismatching Signature: <span className="text-slate-400 font-bold">BIO-SIG-8491-LQ</span>
                      </div>
                    </div>
                  </button>

                  {/* Option 3: Intruder Finger */}
                  <button
                    type="button"
                    onClick={() => setSelectedFingerForScan('intruder')}
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer ${
                      selectedFingerForScan === 'intruder'
                        ? "bg-red-600/10 border-red-500/50 text-red-400"
                        : "bg-slate-900/40 border-white/5 text-slate-400 hover:bg-slate-900/60"
                    }`}
                  >
                    <div className="mt-0.5">
                      <div className={`w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center`}>
                        {selectedFingerForScan === 'intruder' && <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider">
                        Unknown Intruder / Alien Finger (Mismatch)
                      </div>
                      <div className="text-[8px] font-mono text-slate-500 mt-0.5">
                        Transmits Mismatching Signature: <span className="text-slate-400 font-bold">BIO-SIG-3749-KM</span>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Switch to PIN alternative */}
            {!isBiometricAuthenticating && (
              <button
                type="button"
                onClick={() => setAuthMethod('password')}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-all uppercase tracking-widest font-black flex items-center gap-2 cursor-pointer bg-white/[0.02] border border-white/5 px-4 py-2.5 rounded-xl"
              >
                Use Security PIN / Passkey
              </button>
            )}
          </div>
        )}

        {/* SECURE PASSKEY / PIN KEYPAD VIEW */}
        {authMethod === 'password' && !isUnlockedAnim && (
          <div className="w-full flex flex-col items-center space-y-6 animate-fadeIn">
            <form onSubmit={handlePasswordSubmit} className="w-full relative">
              <div className="relative flex items-center">
                <input
                  type={showPassword ? "text" : "password"}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter Passkey or Security PIN"
                  className="w-full bg-slate-900/60 border border-white/5 rounded-2xl py-4 pl-5 pr-14 text-center font-mono font-bold tracking-[0.2em] text-white placeholder:text-slate-600 placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all text-sm"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-4 text-slate-500 hover:text-slate-300 transition-colors p-2 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </form>

            {/* Custom Digital Keypad */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeypadPress(num)}
                  className="h-14 w-full rounded-2xl bg-white/[0.02] hover:bg-white/[0.07] active:scale-95 border border-white/5 text-lg font-black tracking-widest text-slate-300 transition-all flex items-center justify-center cursor-pointer"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleKeypadBackspace}
                className="h-14 w-full rounded-2xl bg-white/[0.01] hover:bg-white/[0.05] active:scale-95 text-slate-500 hover:text-red-400 transition-all flex items-center justify-center cursor-pointer"
              >
                <Delete size={20} />
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress("0")}
                className="h-14 w-full rounded-2xl bg-white/[0.02] hover:bg-white/[0.07] active:scale-95 border border-white/5 text-lg font-black text-slate-300 transition-all flex items-center justify-center cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => handlePasswordSubmit()}
                disabled={passwordInput.length === 0}
                className="h-14 w-full rounded-2xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 disabled:opacity-20 disabled:pointer-events-none border border-blue-500/20 text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center cursor-pointer font-sans"
              >
                OK
              </button>
            </div>

            {/* Switch back to Biometrics if enrolled */}
            {isBiometricEnrolled && (
              <button
                type="button"
                onClick={() => setAuthMethod('biometric')}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-all uppercase tracking-widest font-black flex items-center gap-2 cursor-pointer bg-white/[0.02] border border-white/5 px-4 py-2.5 rounded-xl"
              >
                <Fingerprint size={12} />
                Use Biometric Reader
              </button>
            )}
          </div>
        )}

        {/* Bottom Options / Recovery / Exit */}
        <div className="mt-12 pt-6 border-t border-white/5 w-full flex flex-col items-center gap-4 text-[10px] text-slate-500 uppercase tracking-widest font-medium">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={onSignOut}
              className="hover:text-red-400 transition-all flex items-center gap-1.5 font-bold cursor-pointer"
            >
              <LogOut size={12} />
              Reset via Logout
            </button>
          </div>
          <p className="text-[9px] text-slate-700 font-mono text-center">
            SYS_LOCK_ACTIVE // SECURITY_VER_4.2
          </p>
        </div>
      </motion.div>
    </div>
  );
};
