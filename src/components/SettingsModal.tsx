import React, { useState, lazy, Suspense } from 'react';
import { TEACHER_CHARACTERS, TeacherCharacter } from '../lib/characters';
import {
  clearAppLockData,
  enrollWebAuthnBiometric,
  hasAppLockPin,
  hasWebAuthnCredential,
  saveAppLockPin,
  setAppLockEnabledStorage,
} from '../lib/appLock';
import { X, Volume2, Shield, Cpu, Sliders, Lock, Fingerprint, CheckCircle2 } from 'lucide-react';

const AdminDashboard = lazy(() =>
  import('./AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);

interface SettingsModalProps {
  onClose: () => void;
  language: 'en' | 'sw';
  onChangeLanguage: (lang: 'en' | 'sw') => void;
  studyLevel: string;
  onChangeStudyLevel: (lvl: string) => void;
  classTrack: string;
  onChangeClassTrack: (track: string) => void;
  intelLevel: 'Standard' | '100% Omni-Intelligence';
  onChangeIntelLevel: (lvl: 'Standard' | '100% Omni-Intelligence') => void;
  selectedCharacter: TeacherCharacter;
  onSelectCharacter: (char: TeacherCharacter) => void;
  availableVoices: SpeechSynthesisVoice[];
  selectedVoiceName: string | null;
  onSelectVoiceName: (name: string | null) => void;
  onTestVoice: () => void;
  showSubtitles: boolean;
  onToggleSubtitles: (val: boolean) => void;
  user: { uid: string; email?: string | null; emailVerified?: boolean } | null;
  isAppLockEnabled: boolean;
  onChangeAppLockEnabled: (val: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  language,
  onChangeLanguage,
  studyLevel,
  onChangeStudyLevel,
  classTrack,
  onChangeClassTrack,
  intelLevel,
  onChangeIntelLevel,
  selectedCharacter,
  onSelectCharacter,
  availableVoices,
  selectedVoiceName,
  onSelectVoiceName,
  onTestVoice,
  showSubtitles,
  onToggleSubtitles,
  user,
  isAppLockEnabled,
  onChangeAppLockEnabled,
}) => {
  const [tab, setTab] = useState<'general' | 'intelligence' | 'privacy' | 'admin'>('general');
  const [pinInput, setPinInput] = useState('');
  const [pinMsg, setPinMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const uKey = user?.uid || user?.email || 'anonymous';
  const [hasPin, setHasPin] = useState(() => hasAppLockPin(uKey));
  const [hasPasskey, setHasPasskey] = useState(() => hasWebAuthnCredential(uKey));

  const isVerifiedAdmin = Boolean(
    user?.email === 'charlesmwajima@gmail.com' && user?.emailVerified
  );

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMsg(null);
    try {
      await saveAppLockPin(uKey, pinInput);
      setAppLockEnabledStorage(uKey, true);
      onChangeAppLockEnabled(true);
      setHasPin(true);
      setPinInput('');
      setPinMsg({ type: 'ok', text: 'Security PIN hashed and App Lock enabled.' });
    } catch (err: unknown) {
      setPinMsg({ type: 'err', text: (err as { message?: string })?.message || 'Unable to save PIN.' });
    }
  };

  const handleEnrollPasskey = async () => {
    setPinMsg(null);
    try {
      await enrollWebAuthnBiometric(uKey, user?.email || 'student@tutornode.app');
      setHasPasskey(true);
      setPinMsg({ type: 'ok', text: 'Device hardware passkey enrolled.' });
    } catch (err: unknown) {
      setPinMsg({
        type: 'err',
        text: (err as { message?: string })?.message || 'Hardware passkey enrollment failed.',
      });
    }
  };

  const handleDisableLock = () => {
    clearAppLockData(uKey);
    onChangeAppLockEnabled(false);
    setHasPin(false);
    setHasPasskey(false);
    setPinMsg({ type: 'ok', text: 'App Lock cleared for this browser.' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h3 className="text-base font-bold text-white">Classroom Settings</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 px-6 pt-3 border-b border-white/10 overflow-x-auto">
          {(
            [
              { id: 'general', label: 'General & Voice', icon: <Sliders size={13} /> },
              { id: 'intelligence', label: 'AI Depth', icon: <Cpu size={13} /> },
              { id: 'privacy', label: 'App Lock', icon: <Lock size={13} /> },
              ...(isVerifiedAdmin ? [{ id: 'admin', label: 'Admin', icon: <Shield size={13} /> }] : []),
            ] as Array<{ id: typeof tab; label: string; icon: React.ReactNode }>
          ).map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                tab === id
                  ? 'border-blue-500 text-white bg-white/5'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-5">
          {tab === 'general' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">Language</label>
                  <select
                    value={language}
                    onChange={(e) => onChangeLanguage(e.target.value as 'en' | 'sw')}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
                  >
                    <option value="en">English</option>
                    <option value="sw">Kiswahili</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">Study Level</label>
                  <select
                    value={studyLevel}
                    onChange={(e) => onChangeStudyLevel(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
                  >
                    <option value="High School">High School</option>
                    <option value="Diploma / TVET">Diploma / TVET</option>
                    <option value="Undergraduate">Undergraduate</option>
                    <option value="Postgraduate">Postgraduate</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">Academic Track</label>
                <select
                  value={classTrack}
                  onChange={(e) => onChangeClassTrack(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
                >
                  <option value="Engineering & STEM">Engineering &amp; STEM</option>
                  <option value="Business">Business &amp; Economics</option>
                  <option value="Health & Sciences">Health &amp; Sciences</option>
                  <option value="Humanities & Law">Humanities &amp; Law</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Instructor Voice</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={selectedVoiceName || ''}
                    onChange={(e) => onSelectVoiceName(e.target.value || null)}
                    className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
                  >
                    <option value="">Automatic (Matched to Instructor)</option>
                    {availableVoices.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={onTestVoice}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Volume2 size={14} /> Test Voice
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Teacher Avatar</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {TEACHER_CHARACTERS.slice(0, 6).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelectCharacter(c)}
                      className={`p-2 rounded-xl border flex items-center gap-2 text-left ${
                        selectedCharacter.id === c.id
                          ? 'bg-blue-600/20 border-blue-500 text-white'
                          : 'bg-slate-950 border-white/10 text-slate-300'
                      }`}
                    >
                      <img src={c.imageUrl} alt={c.name} className="w-8 h-8 rounded-lg" />
                      <span className="text-xs font-bold truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-white/10 cursor-pointer">
                <span className="text-xs font-semibold text-slate-200">
                  Show live instructor captions bar
                </span>
                <input
                  type="checkbox"
                  checked={showSubtitles}
                  onChange={(e) => onToggleSubtitles(e.target.checked)}
                  className="accent-blue-500 w-4 h-4"
                />
              </label>
            </>
          )}

          {tab === 'intelligence' && (
            <div className="space-y-3">
              {(
                [
                  [
                    'Standard',
                    'Fast, responsive explanations optimized for everyday classroom pacing.',
                  ],
                  [
                    '100% Omni-Intelligence',
                    'Deeper step-by-step derivations and multi-layered worked analysis.',
                  ],
                ] as const
              ).map(([lvl, desc]) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => onChangeIntelLevel(lvl)}
                  className={`w-full p-4 rounded-2xl border text-left transition-all ${
                    intelLevel === lvl
                      ? 'bg-blue-600/15 border-blue-500 text-white'
                      : 'bg-slate-950 border-white/10 text-slate-300'
                  }`}
                >
                  <div className="text-sm font-bold flex items-center justify-between">
                    <span>{lvl}</span>
                    {intelLevel === lvl && <CheckCircle2 size={16} className="text-blue-400" />}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{desc}</p>
                </button>
              ))}
            </div>
          )}

          {tab === 'privacy' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-white">Local App Lock</div>
                    <div className="text-xs text-slate-400">
                      Protected with salted SHA-256 PIN hashing in this browser.
                    </div>
                  </div>
                  {hasPin && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = !isAppLockEnabled;
                        setAppLockEnabledStorage(uKey, next);
                        onChangeAppLockEnabled(next);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                        isAppLockEnabled ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {isAppLockEnabled ? 'Active' : 'Paused'}
                    </button>
                  )}
                </div>

                <form onSubmit={handleSavePin} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="password"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder={hasPin ? 'Enter new PIN (min 4 chars)' : 'Set Security PIN (min 4 chars)'}
                    minLength={4}
                    className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white"
                  />
                  <button
                    type="submit"
                    disabled={pinInput.trim().length < 4}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold"
                  >
                    {hasPin ? 'Update PIN' : 'Save & Enable'}
                  </button>
                </form>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleEnrollPasskey}
                    className="px-3.5 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-200 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Fingerprint size={14} />
                    {hasPasskey ? 'Re-enroll Device Passkey' : 'Enroll Device Passkey (WebAuthn)'}
                  </button>
                  {hasPin && (
                    <button
                      type="button"
                      onClick={handleDisableLock}
                      className="px-3.5 py-2 rounded-xl bg-red-950/40 hover:bg-red-950/60 border border-red-500/30 text-red-200 text-xs font-semibold"
                    >
                      Clear App Lock
                    </button>
                  )}
                </div>

                {pinMsg && (
                  <p className={`text-xs ${pinMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {pinMsg.text}
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === 'admin' && isVerifiedAdmin && (
            <Suspense fallback={<div className="text-xs text-slate-400 py-6">Loading Admin Console...</div>}>
              <AdminDashboard language={language} />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
};
