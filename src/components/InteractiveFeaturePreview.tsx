import React, { useState } from "react";
import { motion } from "motion/react";

interface FieldSpec {
  type: "text" | "number" | "select" | "range" | "checkbox" | "radio";
  name: string;
  label: string;
  placeholder?: string;
  defaultValue: string;
  options?: string[];
}

interface InteractivePreviewData {
  previewType: string;
  title: string;
  description: string;
  interactiveLabel: string;
  successMessage: string;
  fields: FieldSpec[];
  mockDataOrder?: string[];
}

interface InteractiveFeaturePreviewProps {
  interactivePreview: InteractivePreviewData;
  language: string;
}

export const InteractiveFeaturePreview: React.FC<InteractiveFeaturePreviewProps> = ({
  interactivePreview,
  language,
}) => {
  const [formValues, setFormValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    interactivePreview.fields.forEach((field) => {
      initial[field.name] = field.defaultValue;
    });
    return initial;
  });

  const [testCompleted, setTestCompleted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [accentSpeaking, setAccentSpeaking] = useState(false);

  const handleInputChange = (fieldName: string, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const handleRunSimulation = () => {
    setIsProcessing(true);
    setTestCompleted(false);

    // Dynamic processing delay for realistic feel
    setTimeout(() => {
      setIsProcessing(false);
      setTestCompleted(true);
    }, 1200);
  };

  const handleTriggerSpeech = () => {
    const speechText =
      language === "sw"
        ? "Karibu sana kwenye mfumo ulioboreshwa wa ubao wetu! Ujenzi umekamilika kikamilifu."
        : "Interactive system feedback loop completed successfully.";

    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(speechText);
      utterance.lang = language === "sw" ? "sw-TZ" : "en-US";
      utterance.rate = 0.95;
      utterance.onstart = () => setAccentSpeaking(true);
      utterance.onend = () => setAccentSpeaking(false);
      utterance.onerror = () => setAccentSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } else {
      setAccentSpeaking(true);
      setTimeout(() => setAccentSpeaking(false), 2000);
    }
  };

  return (
    <div className="space-y-6 text-left" id="feature-preview-panel">
      {/* Visual Simulation Wireframe representation */}
      <div className="bg-slate-900 rounded-2xl border border-indigo-500/15 p-5 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>

        {/* Dynamic header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping"></span>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-indigo-400 font-bold">
              {language === "sw" ? "Onyesho la Ukiri (Active Sandbox Preview)" : "Active Real-Time Simulation Workspace"}
            </span>
          </div>

          <span className="bg-slate-950 px-2 py-0.5 rounded text-[8px] font-mono text-slate-500 uppercase border border-white/5 font-semibold">
            Mode: {interactivePreview.previewType || "universal"}
          </span>
        </div>

        {/* Info card */}
        <div className="space-y-1 mb-4">
          <h4 className="text-xs font-black text-white uppercase tracking-wider font-sans">
            {interactivePreview.title}
          </h4>
          <p className="text-[11px] text-slate-400 leading-normal font-sans">
            {interactivePreview.description}
          </p>
        </div>

        {/* Fields and interactive elements */}
        <div className="bg-slate-950 p-4 rounded-xl border border-white/5 space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {interactivePreview.fields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest pl-1">
                  {field.label}
                </label>

                {field.type === "select" ? (
                  <select
                    value={formValues[field.name] || ""}
                    onChange={(e) => handleInputChange(field.name, e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 p-2.5 text-xs text-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 select-styled cursor-pointer"
                  >
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : field.type === "range" ? (
                  <div className="space-y-1">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={formValues[field.name] || "50"}
                      onChange={(e) => handleInputChange(field.name, e.target.value)}
                      className="w-full accent-indigo-500 bg-slate-800 rounded h-1 cursor-ew-resize"
                    />
                    <div className="flex justify-between text-[8px] font-mono text-slate-600">
                      <span>MIN (0)</span>
                      <span className="text-indigo-400 font-bold">CURRENT: {formValues[field.name]}%</span>
                      <span>MAX (100)</span>
                    </div>
                  </div>
                ) : field.type === "checkbox" ? (
                  <label className="flex items-center gap-2 bg-slate-900 p-2.5 rounded-lg border border-white/10 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formValues[field.name] === "true"}
                      onChange={(e) => handleInputChange(field.name, e.target.checked ? "true" : "false")}
                      className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-white/10 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-xs text-slate-300 font-bold">
                      {language === "sw" ? "Wezesha urekebishaji huu" : "Toggle check trigger"}
                    </span>
                  </label>
                ) : (
                  <input
                    type="text"
                    value={formValues[field.name] || ""}
                    onChange={(e) => handleInputChange(field.name, e.target.value)}
                    placeholder={field.placeholder || "Enter value..."}
                    className="w-full bg-slate-900 border border-white/10 p-2.5 text-xs text-white rounded-lg focus:outline-none focus:border-indigo-500 placeholder-slate-600"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Action Trigger Button */}
          <div className="pt-2">
            <button
              onClick={handleRunSimulation}
              disabled={isProcessing}
              className={`w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/20 text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${isProcessing ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {isProcessing ? (
                <>
                  <i className="fas fa-circle-notch animate-spin"></i>
                  {language === "sw" ? "Mchakato Unapakia..." : "Fusing Logical Simulation Parameters..."}
                </>
              ) : (
                <>
                  <i className="fas fa-microchip"></i>
                  {interactivePreview.interactiveLabel}
                </>
              )}
            </button>
          </div>

          {/* Speech option for audio synthesis cases */}
          {interactivePreview.previewType === "swahili" && (
            <button
              onClick={handleTriggerSpeech}
              className={`w-full py-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-black uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2 transition-all ${accentSpeaking ? "animate-pulse" : ""}`}
            >
              <i className="fas fa-volume-high"></i>
              {accentSpeaking ? (language === "sw" ? "Sauti Inatolewa..." : "Speaking Voiceover...") : (language === "sw" ? "Majaribio ya Tamko (Audio)" : "Simulate Swahili Voiceover Synthesis")}
            </button>
          )}
        </div>

        {/* Telemetry Output Log Results */}
        {testCompleted && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 space-y-2 relative"
          >
            {/* Success indicators */}
            <div className="flex items-center gap-2">
              <i className="fas fa-circle-check text-xs"></i>
              <span className="text-xs font-bold font-sans">{interactivePreview.successMessage}</span>
            </div>

            {/* Variable display values matching student intent */}
            <div className="text-[10px] font-mono text-slate-300 border-t border-emerald-500/15 pt-2 mt-2 space-y-1">
              <span className="text-[8px] font-mono uppercase tracking-wider text-slate-500 block mb-1">
                Processed Configuration Values:
              </span>
              {Object.entries(formValues).map(([key, val]) => (
                <div key={key} className="flex justify-between">
                  <span>VARIABLE.{key.toUpperCase()}:</span>
                  <span className="text-white font-bold">{val}</span>
                </div>
              ))}
            </div>

            {/* General mock telemetry logs */}
            {interactivePreview.mockDataOrder && interactivePreview.mockDataOrder.length > 0 && (
              <div className="text-[9px] font-mono text-slate-500 pt-1.5 space-y-0.5">
                {interactivePreview.mockDataOrder.map((logLine, idx) => (
                  <p key={idx} className="flex gap-1.5">
                    <span className="text-indigo-400 select-none">&gt;</span>
                    {logLine}
                  </p>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Visual Component Preview (What the app looks like) */}
      <div className="bg-slate-950 border border-white/5 rounded-2xl p-5 space-y-4">
        <h5 className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block font-extrabold pb-2 border-b border-white/5">
          {language === "sw" ? "PREVIEW: Jinsi mradi utakavyoonekana" : "APP INTEGRATION WIREFRAME MOCKUP"}
        </h5>

        <div className="bg-slate-900 rounded-xl border border-white/5 p-4 space-y-3 relative overflow-hidden">
          {/* Mock Student Dashboard section upgraded with our features */}
          <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
            <span>Student App Simulation Viewport</span>
            <span className="text-emerald-400 flex items-center gap-1 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              LIVE_UPGRADE
            </span>
          </div>

          <div className="p-3 bg-slate-950 border border-white/10 rounded-lg space-y-2">
            <h6 className="text-xs font-black text-indigo-300 flex items-center gap-1.5">
              <i className="fas fa-atom text-[10px] text-indigo-400"></i>
              {interactivePreview.title}
            </h6>
            <p className="text-[10px] text-slate-400 leading-normal">
              {language === "sw"
                ? "Programu hii imeboreshwa sasa kwa masomo na maingiliano ya mwanafunzi kulingana na muundo mkuu."
                : "Active upgrade module operates smoothly in alignment with curriculum guidelines."}
            </p>

            <div className="pt-1.5 flex flex-wrap gap-2">
              <span className="text-[8px] font-mono bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20">
                ACTIVE
              </span>
              <span className="text-[8px] font-mono bg-sky-500/10 text-sky-300 px-2 py-0.5 rounded border border-sky-500/20">
                AI_LOCATED
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
