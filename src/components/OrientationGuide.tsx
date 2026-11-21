import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Tv, 
  Brain, 
  BookOpen, 
  Volume2, 
  ArrowRight, 
  ArrowLeft, 
  X, 
  ChevronRight, 
  GraduationCap,
  FileCheck,
  CheckCircle2
} from 'lucide-react';

interface OrientationGuideProps {
  language: 'en' | 'sw';
  accentColor?: string;
  onClose: () => void;
}

interface StepData {
  id: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: {
    en: string;
    sw: string;
  };
  subtitle: {
    en: string;
    sw: string;
  };
  description: {
    en: string;
    sw: string;
  };
  points: {
    en: string[];
    sw: string[];
  };
  tip: {
    en: string;
    sw: string;
  };
}

export const OrientationGuide: React.FC<OrientationGuideProps> = ({
  language,
  accentColor = '#2563eb',
  onClose
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps: StepData[] = [
    {
      id: "welcome",
      icon: <GraduationCap size={32} />,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-400",
      title: {
        en: "Welcome to OmniTutor",
        sw: "Karibu kwenye OmniTutor"
      },
      subtitle: {
        en: "Neural AI Academy & Virtual Classroom Portal",
        sw: "Chuo Kikuu cha AI ya Neural & Darasa la Mtandaoni"
      },
      description: {
        en: "Let's align your mental frequencies. Step into the next generation of academic synchronization under the expert guidance of Mwalimu Bora, your adaptive AI tutor.",
        sw: "Hebu tuoanishe mawimbi yako ya akili. Ingia katika kizazi kijacho cha elimu na mafunzo amilifu chini ya mwongozo wa Mwalimu Bora, mwalimu wako wa AI."
      },
      points: {
        en: [
          "Human-like synthetic speech and animated delivery",
          "Dynamic interactive whiteboard updates as ideas unfold",
          "Comprehensive course syllabi generated in real time"
        ],
        sw: [
          "Sauti halisi ya kibinadamu na matamshi yenye hisia",
          "Mabadiliko ya papo hapo ya ubao wakati mwalimu anaeleza",
          "Mitaala ya masomo mapana inayojengwa kwa sekunde chache"
        ]
      },
      tip: {
        en: "You can change accents, voices, and intelligence depths anytime in the system configuration.",
        sw: "Unaweza kubadilisha lafudhi, sauti, na kina cha akili wakati wowote kwenye mipangilio ya mfumo."
      }
    },
    {
      id: "smartboard",
      icon: <Tv size={32} />,
      iconBg: "bg-cyan-500/10",
      iconColor: "text-cyan-400",
      title: {
        en: "Interactive Smartboard",
        sw: "Ubao Amilifu wa Smartboard"
      },
      subtitle: {
        en: "Technical Visualization & Rich Whiteboard Note Engine",
        sw: "Michoro ya Kitaalamu na Muhtasari wa Maandishi"
      },
      description: {
        en: "While Mwalimu Bora lectures, technical points and code syntax populate the live board. You can pause, read, and deep-dive at your own study pace.",
        sw: "Wakati Mwalimu Bora anaelekeza, pointi za kitaalamu na mifumo ya nambari hujaza ubao. Unaweza kusimamisha, kusoma, na kujifunza kwa kasi yako mwenyewe."
      },
      points: {
        en: [
          "Raise your hand by clicking 'Ask Mwalimu' for follow-up questions",
          "Highlight any text on the board to query specific concepts",
          "Toggle cinematic mode for immersive distraction-free focus"
        ],
        sw: [
          "Inua mkono wako kwa kubofya 'Ask Mwalimu' kuuliza maswali zaidi",
          "Weka alama kwenye maandishi yoyote ubaoni kuuliza maswali maalum",
          "Washa mfumo wa sinema (cinematic) kwa masomo bila usumbufu"
        ]
      },
      tip: {
        en: "Simply draw your cursor across whiteboard text to trigger the contextual Neural Assistant dialogue.",
        sw: "Pitisha tu mshale wa panya kwenye maandishi ya ubao ili kuanzisha mazungumzo na Msaidizi wa AI."
      }
    },
    {
      id: "assessment",
      icon: <Brain size={32} />,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-400",
      title: {
        en: "Interactive Checkpoints",
        sw: "Vituo vya Kujipima Amilifu"
      },
      subtitle: {
        en: "AI-Generated Concept Alignment Evaluation",
        sw: "Upimaji wa Uelewa unaotengenezwa na AI"
      },
      description: {
        en: "Test your mental integration immediately after a lecture. OmniTutor reviews current whiteboard notes and designs an interactive, custom-targeted assessment.",
        sw: "Pima uelewa wako mara baada ya muhadhara kumalizika. OmniTutor inapitia maelezo ya ubao na kukutengenezea mtihani maalum wa kujitathmini."
      },
      points: {
        en: [
          "Adaptive multiple-choice formats with instant feedback",
          "Full conceptual explanations and educational breakdowns",
          "Comprehensive key-bound controls for seamless selection"
        ],
        sw: [
          "Muundo wa maswali ya kuchagua yenye mabadiliko ya papo hapo",
          "Ufafanuzi kamili wa kiakili na ushauri wa kielimu",
          "Vidhibiti rahisi vya kibodi kufanya mtihani bila panya"
        ]
      },
      tip: {
        en: "Press keys '1', '2', '3', or '4' to pick your choice, and tap 'Enter' to submit your answer or transition!",
        sw: "Bonyeza funguo za '1', '2', '3', au '4' kuchagua jibu, kisha bofya 'Enter' kuwasilisha au kuendelea!"
      }
    },
    {
      id: "curriculum",
      icon: <BookOpen size={32} />,
      iconBg: "bg-indigo-500/10",
      iconColor: "text-indigo-400",
      title: {
        en: "Neural Curriculum Planner",
        sw: "Mpangaji Mtaala wa Neural"
      },
      subtitle: {
        en: "Structuring Syllabus Objectives and Progress Logs",
        sw: "Kupanga Malengo ya Mfumo na Rekodi za Maendeleo"
      },
      description: {
        en: "Build full step-by-step academic modules. From quantum mechanics to business strategy, the system architectures logical, structured syllabus chapters to ensure systematic expertise.",
        sw: "Jenga moduli kamili za masomo hatua kwa hatua. Kuanzia sayansi ya kwanta hadi mikakati ya biashara, mfumo unapanga mtaala wenye mtiririko mzuri."
      },
      points: {
        en: [
          "Customize total chapters and focus limits per course",
          "Set target skill levels (Foundational, Proficiency, Advanced)",
          "Track completion indicators and mastery ratios"
        ],
        sw: [
          "Panga idadi ya sura na maeneo ya kuzingatia kwa kila somo",
          "Weka viwango vya malengo ya kuelewa (Msingi, Ustadi, Utafiti)",
          "Fuatilia viashiria vya ukamilishaji na uwiano wa umahiri"
        ]
      },
      tip: {
        en: "Select customized lesson tracks from the left sidebar to change your active sequence.",
        sw: "Chagua njia za masomo zilizoboreshwa kutoka upande wa kushoto kubadilisha mfuatano wa somo lako."
      }
    },
    {
      id: "system",
      icon: <Volume2 size={32} />,
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-400",
      title: {
        en: "Voice Control & Export",
        sw: "Udhibiti wa Sauti na Upakuaji"
      },
      subtitle: {
        en: "Vocal Synthesizers, Offline Cache, and Documentation",
        sw: "Uzalishaji wa Sauti, Kumbukumbu za Ndani, na PDF"
      },
      description: {
        en: "Take complete control of your workspace interfaces. Tune auditory parameters to synthesize the ultimate studying environment.",
        sw: "Chukua udhibiti kamili wa mazingira yako ya kujisomea. Rekebisha vigezo vya sauti ili upate utulivu bora zaidi."
      },
      points: {
        en: [
          "Switch speech synthesis voices (supports English & Swahili engines)",
          "Download whiteboard summaries as beautifully-formatted PDF manuals",
          "Activate ambient sounds for background cognitive relaxation"
        ],
        sw: [
          "Badili sauti za uzalishaji wa usemi (inajumuisha Kiswahili na Kiingereza)",
          "Pakua muhtasari mzima wa ubao kama kitabu cha PDF cha kitaalamu",
          "Washa sauti tulivu za asili (ambient) kukuongezea utulivu wa akili"
        ]
      },
      tip: {
        en: "All lessons are automatically secured inside your local offline history database whenever internet status falters.",
        sw: "Masomo yote yanauhifadhiwa kiotomatiki kwenye hifadhi ya ndani pindi mtandao unaposumbua."
      }
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleAddOrientationSeen();
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleAddOrientationSeen = () => {
    const userId = localStorage.getItem('omnitutor_last_user_id') || 'guest';
    localStorage.setItem(`omnitutor_orientation_seen_${userId}`, 'true');
  };

  const step = steps[currentStep];

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 30 }}
        className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-[2.5rem] shadow-2xl p-6 md:p-10 flex flex-col overflow-hidden max-h-[92vh]"
      >
        {/* Animated Glow Border */}
        <div 
          className="absolute top-0 left-0 w-full h-1.5 transition-all duration-500" 
          style={{ 
            background: `linear-gradient(to_right, transparent, ${accentColor}, transparent)`,
            opacity: 0.7 
          }}
        ></div>

        {/* Top Header bar with Skip button */}
        <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-6 md:mb-8 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="text-blue-500 animate-pulse" size={16} />
            <span className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-blue-400">
              {language === 'sw' ? 'MWELEKEO WA MFUMO' : 'SYSTEM ARCHITECT TOUR'}
            </span>
          </div>
          <button
            onClick={() => {
              handleAddOrientationSeen();
              onClose();
            }}
            className="text-xs font-bold text-slate-500 hover:text-white uppercase tracking-widest flex items-center gap-1 transition-colors"
          >
            <span>{language === 'sw' ? 'Ruka' : 'Skip'}</span>
            <X size={14} />
          </button>
        </div>

        {/* Main Content Carousel Section */}
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 md:space-y-8"
            >
              {/* Illustrated Header */}
              <div className="flex items-start gap-4 md:gap-6">
                <div className={`p-4 ${step.iconBg} border border-white/10 rounded-2xl ${step.iconColor} shrink-0 shadow-inner`}>
                  {step.icon}
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white leading-tight">
                    {language === 'sw' ? step.title.sw : step.title.en}
                  </h2>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                    {language === 'sw' ? step.subtitle.sw : step.subtitle.en}
                  </p>
                </div>
              </div>

              {/* Step Description paragraph */}
              <p className="text-slate-300 text-sm md:text-base leading-relaxed font-sans font-medium">
                {language === 'sw' ? step.description.sw : step.description.en}
              </p>

              {/* Core assertions / feature points highlights */}
              <div className="space-y-3.5 bg-slate-950/45 p-5 md:p-6 rounded-2xl border border-white/5">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                  {language === 'sw' ? 'VIPENGELE VYA MSINGI' : 'CORE ASSERTIONS'}
                </h4>
                {(language === 'sw' ? step.points.sw : step.points.en).map((point, index) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    key={`point-${index}`} 
                    className="flex items-start gap-3 text-xs md:text-sm text-slate-200"
                  >
                    <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                    <span>{point}</span>
                  </motion.div>
                ))}
              </div>

              {/* Custom micro tip callout */}
              <div className="flex gap-3 bg-blue-500/5 hover:bg-blue-500/10 transition-colors p-4 rounded-2xl border border-blue-500/15">
                <div className="p-1 text-blue-400 shrink-0">
                  <Sparkles size={16} />
                </div>
                <div className="space-y-0.5">
                  <h5 className="text-[10px] font-mono font-black text-blue-400 uppercase tracking-widest">
                    {language === 'sw' ? 'DOKEZO PINI' : 'TACTICAL ADVICE'}
                  </h5>
                  <p className="text-slate-400 text-[11px] md:text-xs leading-relaxed font-serif">
                    {language === 'sw' ? step.tip.sw : step.tip.en}
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer controls & slide pagination indicator */}
        <div className="pt-6 border-t border-white/5 mt-6 md:mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
          {/* Step dots */}
          <div className="flex items-center gap-1.5 order-2 sm:order-1">
            {steps.map((_, index) => (
              <button
                key={`dot-${index}`}
                onClick={() => setCurrentStep(index)}
                aria-label={`Go to step ${index + 1}`}
                className={`w-2 h-2 rounded-full transition-all duration-350 ${
                  index === currentStep 
                    ? 'w-6 bg-blue-500' 
                    : index < currentStep 
                    ? 'bg-blue-400/40' 
                    : 'bg-slate-800 hover:bg-slate-700'
                }`}
              />
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end order-1 sm:order-2">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="px-5 py-3 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all"
              >
                <ArrowLeft size={12} />
                <span>{language === 'sw' ? 'Nyuma' : 'Back'}</span>
              </button>
            )}

            <button
              onClick={handleNext}
              style={{ 
                backgroundColor: currentStep === steps.length - 1 ? 'rgb(16, 185, 129)' : accentColor,
                boxShadow: `0 4px 14px ${currentStep === steps.length - 1 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(37, 99, 235, 0.25)'}`
              }}
              className="px-6 py-3 rounded-xl text-white font-black text-[10px] uppercase tracking-[0.15em] flex items-center gap-2 transition-all hover:brightness-110 active:scale-95 ml-auto text-center justify-center min-w-[120px]"
            >
              <span>{currentStep === steps.length - 1 ? (language === 'sw' ? 'Bofya Maliza' : 'Initialize Classroom') : (language === 'sw' ? 'Endelea' : 'Next Checkpoint')}</span>
              {currentStep === steps.length - 1 ? <FileCheck size={12} /> : <ArrowRight size={12} />}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
