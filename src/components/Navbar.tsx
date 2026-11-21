import React, { useState } from 'react';
import {
  GraduationCap,
  BookOpen,
  FileSearch,
  ListChecks,
  Archive,
  Settings,
  MessageSquarePlus,
  LogOut,
  LogIn,
  Menu,
  X,
  Volume2,
  VolumeX,
  HelpCircle,
} from 'lucide-react';

export type WorkspaceView = 'board' | 'curriculum' | 'documents' | 'syllabus' | 'history';

interface NavbarProps {
  activeView: WorkspaceView;
  onChangeView: (view: WorkspaceView) => void;
  language: 'en' | 'sw';
  onToggleLanguage: () => void;
  user: { uid: string; email?: string | null; displayName?: string | null } | null;
  isAmbientActive: boolean;
  onToggleAmbient: () => void;
  onOpenSettings: () => void;
  onOpenFeedback: () => void;
  onOpenOrientation: () => void;
  onLogout: () => void;
  onRequestAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  onChangeView,
  language,
  onToggleLanguage,
  user,
  isAmbientActive,
  onToggleAmbient,
  onOpenSettings,
  onOpenFeedback,
  onOpenOrientation,
  onLogout,
  onRequestAuth,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{ id: WorkspaceView; labelEn: string; labelSw: string; icon: React.ReactNode }> = [
    { id: 'board', labelEn: 'Classroom', labelSw: 'Darasa', icon: <GraduationCap size={15} /> },
    { id: 'documents', labelEn: 'Documents', labelSw: 'Nyaraka', icon: <FileSearch size={15} /> },
    { id: 'curriculum', labelEn: 'Curriculum', labelSw: 'Mtaala', icon: <BookOpen size={15} /> },
    { id: 'syllabus', labelEn: 'Syllabus', labelSw: 'Muhtasari', icon: <ListChecks size={15} /> },
    { id: 'history', labelEn: 'Archive', labelSw: 'Kumbukumbu', icon: <Archive size={15} /> },
  ];

  const handleSelectView = (view: WorkspaceView) => {
    onChangeView(view);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-950/90 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* Left: Brand */}
        <button
          type="button"
          onClick={() => handleSelectView('board')}
          className="flex items-center gap-2.5 text-left shrink-0"
        >
          <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <GraduationCap size={18} />
          </div>
          <span className="text-base font-extrabold tracking-tight text-white">
            Tutor<span className="text-blue-400">Node</span>
          </span>
        </button>

        {/* Center: Primary Navigation */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/80 border border-white/10 p-1 rounded-2xl">
          {navItems.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectView(item.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.icon}
                <span>{language === 'sw' ? item.labelSw : item.labelEn}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleLanguage}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-white/10 hover:border-white/25 text-xs font-bold text-slate-200"
            title="Switch Language"
          >
            {language === 'sw' ? 'SW' : 'EN'}
          </button>

          <button
            type="button"
            onClick={onToggleAmbient}
            aria-label={isAmbientActive ? 'Mute study ambience' : 'Play study ambience'}
            className={`hidden sm:flex p-2 rounded-xl border transition-colors ${
              isAmbientActive
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
            }`}
            title="Study Ambience"
          >
            {isAmbientActive ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

          <button
            type="button"
            onClick={onOpenOrientation}
            aria-label="Platform guide"
            className="hidden sm:flex p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-300 hover:text-white"
            title="How to Use TutorNode"
          >
            <HelpCircle size={15} />
          </button>

          <button
            type="button"
            onClick={onOpenFeedback}
            aria-label="Send feedback"
            className="hidden sm:flex p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-300 hover:text-white"
            title="Feedback"
          >
            <MessageSquarePlus size={15} />
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-300 hover:text-white"
            title="Settings"
          >
            <Settings size={15} />
          </button>

          {user ? (
            <button
              type="button"
              onClick={onLogout}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-red-950/50 border border-white/10 hover:border-red-500/30 text-xs font-semibold text-slate-300 hover:text-red-200 transition-colors"
              title={user.email || 'Sign Out'}
            >
              <LogOut size={13} />
              <span>Sign Out</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onRequestAuth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white"
            >
              <LogIn size={13} />
              <span>Sign In</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            className="md:hidden p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-200"
          >
            {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-slate-950 px-3 py-3 space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            {navItems.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectView(item.id)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    active ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-300'
                  }`}
                >
                  {item.icon}
                  <span>{language === 'sw' ? item.labelSw : item.labelEn}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/10 gap-2">
            <button
              type="button"
              onClick={() => {
                onOpenFeedback();
                setMobileMenuOpen(false);
              }}
              className="flex-1 py-2 rounded-xl bg-slate-900 text-xs font-semibold text-slate-300 flex items-center justify-center gap-1.5"
            >
              <MessageSquarePlus size={13} /> Feedback
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenOrientation();
                setMobileMenuOpen(false);
              }}
              className="flex-1 py-2 rounded-xl bg-slate-900 text-xs font-semibold text-slate-300 flex items-center justify-center gap-1.5"
            >
              <HelpCircle size={13} /> Guide
            </button>
            {user && (
              <button
                type="button"
                onClick={onLogout}
                className="flex-1 py-2 rounded-xl bg-red-950/40 text-xs font-semibold text-red-200 flex items-center justify-center gap-1.5"
              >
                <LogOut size={13} /> Sign Out
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
