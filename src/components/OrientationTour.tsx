import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface OrientationTourProps {
  language: "en" | "sw";
  onClose: () => void;
}

interface TourStep {
  icon: string;
  titleEn: string;
  titleSw: string;
  descriptionEn: string;
  descriptionSw: string;
  tipEn: string;
  tipSw: string;
  colorName: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    icon: 'fa-brain',
    titleEn: 'Welcome to TutorNode',
    titleSw: 'Karibu TutorNode',
    descriptionEn: 'Step into your AI classroom! TutorNode is an interactive virtual learning environment led by Mwalimu Bora, a bilingual AI instructor designed to teach concepts step by step.',
    descriptionSw: 'Ingia kwenye darasa lako la AI! TutorNode ni mazingira ya masomo yanayoongozwa na Mwalimu Bora, mwalimu mahiri wa AI anayefundisha hatua kwa hatua.',
    tipEn: 'Type any topic in the central intake deck to start a new lesson.',
    tipSw: 'Andika mada yoyote kwenye kisanduku cha kuanzia ili kuanza somo jipya.',
    colorName: 'blue'
  },
  {
    icon: 'fa-chalkboard',
    titleEn: 'Interactive Smartboard',
    titleSw: 'Ubao Janja Maingiliano',
    descriptionEn: 'The core of your lesson is visually constructed onto the Interactive Smartboard. You can watch dynamic schematic videos, read real-time technical documentation, and select or highlight any portion of the board to raise your hand and ask class questions instantly.',
    descriptionSw: 'Maudhui makuu ya somo lako yanapangwa kwa urahisi kwenye Ubao Janja Maingiliano. Unaweza kutazama video thabiti za kiufundi, kusoma maelezo ya kina, na kuchagua au kuteua sehemu yoyote ya ubao ili kuinua mkono na kuuliza maswali hapo hapo.',
    tipEn: 'Highlight complex terms to get an instant educator breakdown.',
    tipSw: 'Chagua maneno magumu ili kupata ufafanuzi wa papo hapo kutoka kwa mwalimu.',
    colorName: 'cyan'
  },
  {
    icon: 'fa-volume-up',
    titleEn: 'Bilingual Voice Interface',
    titleSw: 'Kiolesura cha Sauti Kirafiki',
    descriptionEn: 'Classrooms aren\'t silent! Mwalimu Bora delivers lessons through real-time text-to-speech synthesis. Switch seamlessly between English and Swahili using the toggle on the top right deck. Tap play, pause, or skip forward to manage class delivery at your own pace.',
    descriptionSw: 'Darasa haliwezi kuwa kimya! Mwalimu Bora anawasilisha masomo kupitia teknolojia ya kisasa ya sauti (text-to-speech). Badilisha lugha kati ya Kiingereza na Kiswahili ukitumia kitufe kilicho juu kulia. Cheza au pumzisha sauti kujifunza kwa kasi yako.',
    tipEn: 'Audio voices are designed to fallback offline securely if connectivity changes.',
    tipSw: 'Sauti za sauti zimeundwa kufanya kazi vizuri hata mtandao ukiwa chini.',
    colorName: 'purple'
  },
  {
    icon: 'fa-graduation-cap',
    titleEn: 'Neural Checkpoint Quizzes',
    titleSw: 'Mitihani ya Kupima Ufahamu',
    descriptionEn: 'Ready to benchmark your intelligence? Upon finishing a lecture, Mwalimu Bora designs a custom 4-question Conceptual Checkpoint Quiz dynamically extracted from your whiteboard text. Answer choices using keys [1] to [4] and hit [Enter] for a lightning-fast evaluation!',
    descriptionSw: 'Upo tayari kupima uelewa wako? Baada ya kukamilisha somo, Mwalimu Bora anajiandaa kukutengenezea mtihani maalum wa maswali manne uliotokana na maelezo ya ubao wako. Jibu ukitumia vitufe [1] hadi [4] na ubonyeze [Enter] kupata matokeo ya haraka!',
    tipEn: 'Each answer details a teacher commentary explaining the underlying theory.',
    tipSw: 'Kila jibu lina maelezo ya mwalimu yanayofafanua nadharia husika.',
    colorName: 'emerald'
  },
  {
    icon: 'fa-box-archive',
    titleEn: 'Archives & Technical Manuals',
    titleSw: 'Kumbukumbu na Mwongozo',
    descriptionEn: 'Your continuous learning is fully backed up. Access the Archives view to revisit past synchronized lessons. You can also export current whiteboard lectures into beautifully organized, engineering-standard PDFs for persistent study and review.',
    descriptionSw: 'Masomo yako yote yanahifadhiwa kikamilifu. Ingia kwenye kichupo cha Archives ili kupitia upya masomo yaliyopita. Pia, unaweza kupakua somo la sasa kama faili la PDF lenye muundo mzuri wa kiufundi kwa ajili ya usomaji wa baadaye.',
    tipEn: 'Synchronized archives are stored locally to prevent cloud dependency drops.',
    tipSw: 'Kumbukumbu zote zinahifadhiwa vizuri mwilini hapa ili kuzuia matatizo ya mtandao.',
    colorName: 'amber'
  }
];

export const OrientationTour: React.FC<OrientationTourProps> = ({ language, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const step = TOUR_STEPS[currentStep];
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  // Visual highlights representing the simulated component UI per step
  const renderSimulatedVisual = () => {
    switch (currentStep) {
      case 0: // Intake deck
        return (
          <div className="w-full bg-slate-950/50 border border-white/5 rounded-2xl p-4 flex flex-col gap-3 font-mono text-[10px]">
            <div className="flex items-center justify-between text-slate-500 pb-2 border-b border-white/5">
              <span>[CORE_INTAKE_MODULE]</span>
              <span className="text-blue-400">STATUS: READY</span>
            </div>
            <div className="relative">
              <input 
                disabled 
                placeholder={language === 'sw' ? 'Mfano: Jinsi Quantum Computing Inavyofanya Kazi...' : 'e.g., How Quantum Computing Works...'}
                className="w-full bg-slate-900 border border-blue-500/30 rounded-xl px-4 py-3 text-white/50"
              />
              <button className="absolute right-2 top-2 px-3 py-1 bg-blue-600 rounded-lg text-white font-bold uppercase tracking-widest text-[8px]">
                {language === 'sw' ? 'FUNDISHA' : 'STUDY'}
              </button>
            </div>
          </div>
        );
      case 1: // Smartboard
        return (
          <div className="w-full bg-slate-950/50 border border-white/5 rounded-2xl p-4 flex flex-col gap-2 font-mono text-[10px]">
            <div className="flex items-center justify-between text-slate-500 pb-2 border-b border-white/5">
              <span>[SMARTBOARD_DIAGRAM]</span>
              <span className="text-cyan-400">ACTIVE: SHALOW_GRID</span>
            </div>
            <div className="border border-white/10 rounded-xl h-24 relative overflow-hidden flex items-center justify-center bg-slate-900/60 font-serif text-slate-400 italic">
              <div className="absolute inset-0 bg-gradient-to-t from-cyan-950/20 to-transparent"></div>
              <div className="absolute top-2 left-2 flex gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
              </div>
              <div className="text-center px-4">
                <span className="text-cyan-300 font-mono text-[9px] block mb-1">INTERACTIVE SEGMENT</span>
                {language === 'sw' ? '"Mawimbi ya mwendo thabiti..."' : '"High frequency gravitational fields..."'}
              </div>
            </div>
          </div>
        );
      case 2: // Voice Playout
        return (
          <div className="w-full bg-slate-950/50 border border-white/5 rounded-2xl p-4 flex flex-col gap-3 font-mono text-[10px]">
            <div className="flex items-center justify-between text-slate-500 pb-2 border-b border-white/5">
              <span>[VOICE_SYNTHESIS_VOX]</span>
              <span className="text-purple-400">100Hz SPEECH WAVE</span>
            </div>
            <div className="flex items-center gap-3">
              <button className="w-8 h-8 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <i className="fas fa-play"></i>
              </button>
              <div className="flex-1 flex items-end gap-1 h-8 px-2 bg-slate-900/80 rounded-xl border border-white/5">
                <div className="w-1 bg-purple-500 rounded h-1/2 animate-pulse"></div>
                <div className="w-1 bg-purple-500 rounded h-3/4 animate-pulse"></div>
                <div className="w-1 bg-purple-500 rounded h-1/3 animate-pulse"></div>
                <div className="w-1 bg-purple-500 rounded h-4/5 animate-pulse"></div>
                <div className="w-1 bg-purple-500 rounded h-1/4 animate-pulse"></div>
                <div className="w-1 bg-purple-500 rounded h-2/3 animate-pulse"></div>
              </div>
              <span className="text-[8px] bg-slate-900 px-2 py-1 rounded text-slate-400">
                {language === 'sw' ? 'KISWAHILI AMILIFU' : 'ENGLISH VOICE'}
              </span>
            </div>
          </div>
        );
      case 3: // Quiz checkpoint
        return (
          <div className="w-full bg-slate-950/50 border border-white/5 rounded-2xl p-4 flex flex-col gap-2 font-mono text-[10px]">
            <div className="flex items-center justify-between text-slate-500 pb-2 border-b border-white/5">
              <span>[NEURAL_CHECKPOINT]</span>
              <span className="text-emerald-400">HOTKEYS: ACTIVE</span>
            </div>
            <div className="space-y-1.5 font-sans">
              <div className="flex items-center gap-2 p-2 bg-slate-900/60 border border-white/5 rounded-xl text-slate-300">
                <kbd className="bg-slate-800 px-1 rounded text-white font-mono text-[8px]">Key 1</kbd>
                <span className="text-[10px]">{language === 'sw' ? 'Chaguo Lililo Sahihi Kabisa' : 'Perfect Theoretical Choice'}</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-900/20 border border-white/5 opacity-50 rounded-xl text-slate-500">
                <kbd className="bg-slate-800 px-1 rounded text-slate-400 font-mono text-[8px]">Key 2</kbd>
                <span className="text-[10px]">{language === 'sw' ? 'Chaguo lisilo sahihi sana' : 'Partially incorrect choice'}</span>
              </div>
            </div>
          </div>
        );
      case 4: // History & PDF Archive
        return (
          <div className="w-full bg-slate-950/50 border border-white/5 rounded-2xl p-4 flex flex-col gap-2 font-mono text-[10px]">
            <div className="flex items-center justify-between text-slate-500 pb-2 border-b border-white/5">
              <span>[LOCAL_ARCHIVE_EXPORTER]</span>
              <span className="text-amber-400">FILE_ENGINE: READY</span>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 p-3 bg-slate-900/60 border border-white/5 rounded-xl flex items-center justify-between">
                <span>{language === 'sw' ? 'Pakua Maelezo kama PDF' : 'Download Lesson Notes'}</span>
                <i className="fas fa-file-pdf text-amber-500 text-sm"></i>
              </div>
              <div className="p-3 bg-slate-900/40 border border-white/5 rounded-xl flex items-center justify-center">
                <i className="fas fa-clock-rotate-left text-slate-400"></i>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // Color mapper based on the steps setup
  const getColorClasses = () => {
    switch(step.colorName) {
      case 'cyan': return { text: 'text-cyan-400', border: 'border-cyan-500/20', bgGlow: 'via-cyan-600', button: 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-900/20', buttonLight: 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300' };
      case 'purple': return { text: 'text-purple-400', border: 'border-purple-500/20', bgGlow: 'via-purple-600', button: 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/20', buttonLight: 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300' };
      case 'emerald': return { text: 'text-emerald-400', border: 'border-emerald-500/20', bgGlow: 'via-emerald-600', button: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20', buttonLight: 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300' };
      case 'amber': return { text: 'text-amber-400', border: 'border-amber-500/20', bgGlow: 'via-amber-600', button: 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/20', buttonLight: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300' };
      default: return { text: 'text-blue-400', border: 'border-blue-500/20', bgGlow: 'via-blue-600', button: 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20', buttonLight: 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-300' };
    }
  };

  const colors = getColorClasses();

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 30 }}
        className={`relative w-full max-w-xl bg-slate-900 border ${colors.border} rounded-[2.5rem] shadow-2xl p-6 md:p-8 flex flex-col overflow-hidden max-h-[90vh]`}
      >
        {/* Animated Top Sync Glow */}
        <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent ${colors.bgGlow} to-transparent opacity-70 transition-all duration-300`}></div>

        {/* Dynamic ambient spot glow */}
        <div className="absolute top-20 right-20 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full pointer-events-none"></div>
        <div className="absolute bottom-20 left-10 w-32 h-32 bg-purple-500/5 blur-3xl rounded-full pointer-events-none"></div>

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2 bg-slate-950/60 border ${colors.border} rounded-xl ${colors.text} transition-colors duration-300`}>
              <i className={`fas ${step.icon} text-sm`}></i>
            </div>
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {language === 'sw' ? 'Mwongozo wa Kuanza TutorNode' : 'TutorNode Platform Guide'}
              </h3>
              <p className="text-xs font-bold text-white leading-none mt-1">
                {language === 'sw' ? 'Jifunze Jinsi ya Kutumia' : 'Platform Orientation Guide'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1 custom-scrollbar">
          {/* Progress Indicators */}
          <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-widest text-slate-500">
            <span>
              {language === 'sw' ? `Hatua ${currentStep + 1} kati ya ${TOUR_STEPS.length}` : `Step ${currentStep + 1} of ${TOUR_STEPS.length}`}
            </span>
            <div className="flex gap-1.5">
              {TOUR_STEPS.map((_, idx) => (
                <button
                  key={`progress-tour-${idx}`}
                  onClick={() => setCurrentStep(idx)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    idx === currentStep
                      ? `${colors.text} bg-current w-4`
                      : idx < currentStep
                      ? 'bg-blue-500/45'
                      : 'bg-slate-800'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Stepped Slide animations */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              {/* Title & Desc */}
              <div className="space-y-2">
                <h4 className={`text-xl font-extrabold ${colors.text} tracking-tight transition-colors duration-300`}>
                  {language === 'sw' ? step.titleSw : step.titleEn}
                </h4>
                <p className="text-slate-300 text-xs md:text-sm leading-relaxed font-sans font-normal">
                  {language === 'sw' ? step.descriptionSw : step.descriptionEn}
                </p>
              </div>

              {/* Graphical simulation visual */}
              <div className="pt-2">
                {renderSimulatedVisual()}
              </div>

              {/* Expert Tip card */}
              <div className="p-4 bg-slate-950/40 rounded-2xl border border-white/5 flex gap-3 items-start">
                <div className={`p-1.5 rounded-lg ${colors.buttonLight} text-2xs`}>
                  <i className="fas fa-lightbulb"></i>
                </div>
                <div>
                  <h5 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                    {language === 'sw' ? 'Ushauri mkuu' : 'Key Educator Tip'}
                  </h5>
                  <p className="text-[10px] text-slate-400 leading-normal font-sans">
                    {language === 'sw' ? step.tipSw : step.tipEn}
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer Navigation Action bar */}
        <div className="flex items-center justify-between mt-8 border-t border-white/5 pt-5">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-white disabled:opacity-30 disabled:hover:text-slate-500 transition-colors text-[10px] uppercase font-black tracking-wider"
          >
            <i className="fas fa-arrow-left text-[8px]"></i>
            <span>{language === 'sw' ? 'Rudi' : 'Back'}</span>
          </button>

          <button
            onClick={handleNext}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-black text-[10px] uppercase tracking-wider text-center transition-all ${colors.button} active:scale-95`}
          >
            <span>
              {isLastStep 
                ? (language === 'sw' ? 'Kamilisha Maelekezo' : 'Start Learning Now') 
                : (language === 'sw' ? 'Endelea' : 'Continue')}
            </span>
            <i className={`fas ${isLastStep ? 'fa-sign-in-alt' : 'fa-arrow-right'} text-[8px]`}></i>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
