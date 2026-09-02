import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import DOMPurify from 'dompurify';
import { getSlideSynchronizedDiagram } from './dynamicDiagramSvgs';

export interface DiagramLabel {
  id: string;
  title: string;
  category: string;
  xPercent: number; // 0 - 100% position on diagram canvas
  yPercent: number; // 0 - 100% position on diagram canvas
  icon?: string;
  color?: string;
  description: string;
  functionText: string;
  formulaOrRule?: string;
  realWorldApplication?: string;
}

interface InteractiveDiagramProps {
  svgCode?: string | null;
  imageUrl?: string | null;
  diagramTitle?: string | null;
  topic?: string;
  language?: 'en' | 'sw';
  isCinematicMode?: boolean;
  onAskMwalimu?: (questionOrContext: string) => void;
}

export const InteractiveDiagram: React.FC<InteractiveDiagramProps> = ({
  svgCode,
  imageUrl,
  diagramTitle,
  topic = '',
  language = 'en',
  isCinematicMode = false,
  onAskMwalimu,
}) => {
  const isSw = language === 'sw';
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeLabelId, setActiveLabelId] = useState<string | null>(null);
  const [hoveredLabelId, setHoveredLabelId] = useState<string | null>(null);
  const [showPins, setShowPins] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  // Synchronized subtopic detection from active slide content
  const synchronizedData = useMemo(() => {
    return getSlideSynchronizedDiagram(topic, isSw);
  }, [topic, isSw]);

  // Determine active SVG code (prefer AI generated slide SVG if valid, otherwise synchronized procedural diagram)
  const effectiveSvg = useMemo(() => {
    if (svgCode && svgCode.includes('<svg')) return svgCode;
    if (synchronizedData?.svg) return synchronizedData.svg;
    return null;
  }, [synchronizedData, svgCode]);

  // Determine active title
  const effectiveTitle = useMemo(() => {
    if (diagramTitle) return diagramTitle;
    if (synchronizedData?.title) return synchronizedData.title;
    return isSw ? 'Mchoro Mwingiliano' : 'Interactive Technical Diagram';
  }, [diagramTitle, synchronizedData, isSw]);

  // Sanitize SVG
  const sanitizedSvg = useMemo(() => {
    if (!effectiveSvg) return null;
    return DOMPurify.sanitize(effectiveSvg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_TAGS: ['animate', 'animateMotion', 'animateTransform', 'path', 'g', 'circle', 'text', 'line', 'polyline', 'polygon', 'rect', 'ellipse', 'defs', 'linearGradient', 'radialGradient', 'stop', 'use', 'filter'],
      ADD_ATTR: ['values', 'dur', 'repeatCount', 'attributeName', 'type', 'transform', 'keyTimes', 'path', 'marker-end', 'stop-color', 'stop-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'viewBox']
    });
  }, [effectiveSvg]);

  // Extract or synthesize interactive labels based on domain recognition and SVG analysis
  const diagramLabels: DiagramLabel[] = useMemo(() => {
    if (synchronizedData?.labels && synchronizedData.labels.length > 0) {
      return synchronizedData.labels;
    }

    const combinedText = `${topic} ${svgCode || ''}`.toLowerCase();
    const labels: DiagramLabel[] = [];

    // 1. SHIP / NAVAL ARCHITECTURE / BLUEPRINT / KEEL / SOLAS
    if (combinedText.includes('ship') || combinedText.includes('naval') || combinedText.includes('mkuku') || combinedText.includes('keel') || combinedText.includes('bulkhead') || combinedText.includes('chombo') || combinedText.includes('meli')) {
      labels.push(
        {
          id: 'keel',
          title: isSw ? 'Mkuku (Keel)' : 'Keel (Mkuku)',
          category: isSw ? 'Uti wa Mgongo wa Chombo' : 'Primary Structural Backbone',
          xPercent: 51,
          yPercent: 73,
          icon: 'fa-anchor',
          color: 'from-rose-500 to-red-600',
          description: isSw
            ? 'Uti wa mgongo mkuu wa chombo unaoanzia mbele hadi nyuma chini kabisa ya ganda la meli. Unatoa uimara mkuu wa kimuundo kuzuia chombo kupinda (sagging na hogging).'
            : 'The longitudinal structural beam extending along the centerline of the ship bottom from stem to stern. It provides maximum section modulus to resist hull girder bending, hogging, and sagging.',
          functionText: isSw
            ? 'Hustahimili nguvu zote za mawimbi ya bahari na kubeba uzito wote wa mashine na mizigo.'
            : 'Distributes hydro-mechanical bending stresses across the vessel and anchors lower framing floors.',
          formulaOrRule: isSw ? 'Kipengele: M = σ × Z (Bending Moment & Section Modulus)' : 'Governing Law: Hull Girder Section Modulus Z = I / y_max',
          realWorldApplication: isSw ? 'Huzuia meli kuvunjika vipande viwili wakati wa dhoruba kali baharini.' : 'Crucial for drydock block support and rough sea sea-keeping integrity.'
        },
        {
          id: 'bulkheads',
          title: isSw ? 'Kuta za Kuzuia Maji (Watertight Bulkheads)' : 'Watertight Bulkheads',
          category: isSw ? 'Gawio la Usalama Baharini' : 'Damage Stability Barriers',
          xPercent: 45,
          yPercent: 48,
          icon: 'fa-shield-halved',
          color: 'from-cyan-500 to-blue-600',
          description: isSw
            ? 'Kuta wima thabiti zenye nguvu zinazogawa chombo katika vyumba vidogo visivyoingiza maji, kuhakikisha maji hayasambai meli inapogongana au kutoboka.'
            : 'Heavy transverse vertical bulkheads that subdivide the hull into isolated watertight compartments, complying strictly with SOLAS probabilistic damage stability criteria.',
          functionText: isSw
            ? 'Kuzuia maji ya mafuriko yasipenye kutoka chumba kimoja kwenda kingine chombo kinapopata hitilafu.'
            : 'Contains progressive flooding within damaged compartments, maintaining vessel buoyancy and reserve freeboard.',
          formulaOrRule: 'SOLAS Regulation II-1 / Floodable Length Curve',
          realWorldApplication: isSw ? 'Inalinda chombo dhidi ya kuzama hata kama chumba kimoja kitajazwa na maji yote ya bahari.' : 'Prevents catastrophic sinking following hull breach or maritime collision.'
        },
        {
          id: 'draft_freeboard',
          title: isSw ? 'Kuzama & Baki ya Juu (Draft & Freeboard)' : 'Draft & Freeboard Metrics',
          category: isSw ? 'Vipimo vya Kuelea & Usalama' : 'Hydrostatic & Buoyancy Metrics',
          xPercent: 77,
          yPercent: 55,
          icon: 'fa-arrows-up-down',
          color: 'from-emerald-500 to-teal-600',
          description: isSw
            ? 'Draft ni kina cha sehemu ya chombo iliyoko ndani ya maji (kutoka mstari wa maji hadi mkuku). Freeboard ni urefu kutoka usawa wa maji hadi deki kuu ya chombo.'
            : 'Draft is the vertical distance from waterline to bottom of the keel (submerged depth). Freeboard is the vertical distance from waterline to freeboard deck (reserve buoyancy).',
          functionText: isSw
            ? 'Draft inasaidia kuepuka kugonga miamba bandarini; Freeboard inahakikisha chombo hakizami kinapopigwa na mawimbi ya juu.'
            : 'Controls maximum navigable port depth and guarantees minimum positive righting lever (GZ) against high swells.',
          formulaOrRule: isSw ? 'Ujazo: V = ∇ / Cb (Archimedes’ Principle of Buoyancy)' : 'Archimedes Buoyancy: Δ = ρ × ∇ (Displacement = Water Density × Submerged Volume)',
          realWorldApplication: isSw ? 'Hutumika kukagua alama za Plimsoll Line kabla ya meli kuanza safari.' : 'Regulates safe cargo loading limits under international Plimsoll load-line conventions.'
        },
        {
          id: 'fore_bow',
          title: isSw ? 'Upinde wa Mbele (Bow / Fore)' : 'Bow / Prow (Fore)',
          category: isSw ? 'Mnyoofu wa Maji' : 'Hydrodynamic Entry Form',
          xPercent: 82,
          yPercent: 36,
          icon: 'fa-compass',
          color: 'from-amber-500 to-orange-600',
          description: isSw
            ? 'Sehemu ya mbele kabisa ya meli iliyoundwa kwa umbo maalum kupasua mawimbi na kupunguza msuguano wa maji wakati chombo kinatembea.'
            : 'The forward prow of the hull engineered with bulbous bow contours to create destructive wave interference, drastically cutting hydrodynamic drag.',
          functionText: isSw
            ? 'Hupunguza matumizi ya mafuta na kuongoza mkondo wa maji kando ya ganda.'
            : 'Minimizes wave-making resistance coefficient (Cw) and dampens heavy pitching motions.',
          formulaOrRule: 'Froude Number: Fn = V / √(g × L)',
          realWorldApplication: isSw ? 'Huongeza kasi ya meli na kuokoa hadi 15% ya gharama za nishati.' : 'Improves fuel economy and heavy weather sea-keeping capabilities.'
        }
      );
    } 
    // 2. BIOLOGY / PHOTOSYNTHESIS / BIOSYNTHESIS
    else if (combinedText.includes('bio') || combinedText.includes('photosynthesis') || combinedText.includes('mmea') || combinedText.includes('chloroplast') || combinedText.includes('sun') || combinedText.includes('co2') || combinedText.includes('o2')) {
      labels.push(
        {
          id: 'sun_energy',
          title: isSw ? 'Mionzi ya Jua (Solar Photon Energy)' : 'Solar Photon Radiance',
          category: isSw ? 'Chanzo cha Nishati' : 'Electromagnetic Input Vector',
          xPercent: 75,
          yPercent: 23,
          icon: 'fa-sun',
          color: 'from-amber-400 to-yellow-500',
          description: isSw
            ? 'Nishati ya mionzi ya jua inayofyonzwa na chembechembe za klorofili (chlorophyll) ndani ya majani ili kuanzisha mchakato wa usanisinuru.'
            : 'High-energy solar photon flux absorbed by photosystems PSI (P700) and PSII (P680) embedded within thylakoid membranes to excite electron chains.',
          functionText: isSw
            ? 'Kuvunja molekuli za maji ($H_2O$) na kuzalisha nishati ya ATP na NADPH.'
            : 'Photolyzes water molecules, driving photophosphorylation and proton gradient creation.',
          formulaOrRule: 'Planck Relation: E = hν = hc / λ',
          realWorldApplication: isSw ? 'Msingi mkuu wa uhai na nishati yote kwenye sayari ya Dunia.' : 'Primary thermodynamic driver of global organic biomass synthesis.'
        },
        {
          id: 'co2_intake',
          title: isSw ? 'Hewa ya Carbon Dioxide ($CO_2$)' : 'Carbon Dioxide ($CO_2$) Ingress',
          category: isSw ? 'Gesi ya Kuingia' : 'Carbon Substrate Subsystem',
          xPercent: 23,
          yPercent: 60,
          icon: 'fa-wind',
          color: 'from-blue-400 to-indigo-500',
          description: isSw
            ? 'Gesi ya kaboni dioksidi inayofyonzwa kutoka angani kupitia vitundu vya majani (stomata) kwa ajili ya mzunguko wa Calvin kuzalisha sukari.'
            : 'Atmospheric carbon dioxide diffusing through stomatal apertures into stroma fluid for enzymatic carbon fixation by RuBisCO.',
          functionText: isSw
            ? 'Kutoa atomu za kaboni zinazounda glukosi na virutubisho vya mmea.'
            : 'Supplies carbon skeletons for 3-PGA formation during the light-independent Calvin cycle.',
          formulaOrRule: 'RuBisCO Catalysis: RuBP (5C) + CO₂ → 2 × 3-PGA (3C)',
          realWorldApplication: isSw ? 'Hupunguza joto duniani kwa kufyonza hewa ya ukaa.' : 'Acts as Earth’s primary atmospheric carbon sequestration sink.'
        },
        {
          id: 'o2_release',
          title: isSw ? 'Hewa Safi ya Oksijeni ($O_2$)' : 'Oxygen ($O_2$) Product Egress',
          category: isSw ? 'Gesi ya Kutoka' : 'Aerobic Byproduct Stream',
          xPercent: 55,
          yPercent: 43,
          icon: 'fa-leaf',
          color: 'from-emerald-400 to-green-600',
          description: isSw
            ? 'Gesi ya oksijeni inayozalishwa baada ya maji kuvunjwa na kisha kutolewa angani kwa ajili ya viumbe hai kupumua.'
            : 'Molecular oxygen produced as a direct byproduct of water oxidation at the oxygen-evolving manganese complex of Photosystem II.',
          functionText: isSw
            ? 'Kutajirisha anga la dunia na hewa safi inayowezesha uhai wa binadamu na wanyama.'
            : 'Diffuses across mesophyll boundaries into atmosphere to maintain atmospheric oxygen balance (~20.95%).',
          formulaOrRule: 'Photolysis Equation: 2H₂O + light → 4H⁺ + 4e⁻ + O₂↑',
          realWorldApplication: isSw ? 'Hutoa hewa safi tunayovuta kila sekunde.' : 'Sustains aerobic cellular respiration across all terrestrial and marine biomes.'
        }
      );
    }
    // 3. PHYSICS / QUANTUM / ATOMIC / BOHR
    else if (combinedText.includes('atom') || combinedText.includes('quantum') || combinedText.includes('physics') || combinedText.includes('orbital') || combinedText.includes('bohr') || combinedText.includes('nucleus')) {
      labels.push(
        {
          id: 'nucleus',
          title: isSw ? 'Kiini cha Atomu (Atomic Nucleus)' : 'Dense Atomic Nucleus',
          category: isSw ? 'Kituo cha Nguvu' : 'Subatomic Core Mass',
          xPercent: 50,
          yPercent: 50,
          icon: 'fa-atom',
          color: 'from-purple-500 to-violet-600',
          description: isSw
            ? 'Kituo chenye nguvu kubwa katikati ya atomu kilichobeba protoni na nutroni zilizoshikiliwa na nguvu kuu ya nyuklia.'
            : 'The ultra-dense central core comprised of positively charged protons and neutral neutrons bound tightly by the residual strong nuclear force.',
          functionText: isSw
            ? 'Kubeba karibu 99.9% ya uzito wote wa atomu na kutoa mvuto wa kielektroniki.'
            : 'Defines atomic number Z, isotope mass, and electrostatic central potential well $V(r) = -Ze^2 / (4\pi\epsilon_0 r)$.',
          formulaOrRule: 'Strong Force Potential: V(r) = -g² / r · e^(-mr)',
          realWorldApplication: isSw ? 'Chanzo cha nguvu za kinyuklia na radiolojia ya kisasa.' : 'Underpins nuclear fusion energy, stellar nucleosynthesis, and medical MRI.'
        },
        {
          id: 'electron_shells',
          title: isSw ? 'Mizunguko ya Elektroni (Quantized Orbitals)' : 'Quantized Orbitals (Shells)',
          category: isSw ? 'Viwango vya Nishati' : 'Discrete Energy Eigenstates',
          xPercent: 68,
          yPercent: 32,
          icon: 'fa-circle-notch',
          color: 'from-cyan-400 to-blue-500',
          description: isSw
            ? 'Mizunguko maalum ambamo elektroni huzunguka bila kutoa mionzi isipokuwa zikiruka kutoka ngazi moja kwenda nyingine.'
            : 'Discrete stationary energy levels where electron wavefunctions maintain stable constructive interference without continuous radiative decay.',
          functionText: isSw
            ? 'Kuamua sifa za kikemikali, mwingiliano wa vifungo, na uzalishaji wa mwanga.'
            : 'Dictates chemical valency, covalent bonding geometry, and characteristic emission spectra.',
          formulaOrRule: 'Bohr Energy Level: E_n = -13.6 eV / n²',
          realWorldApplication: isSw ? 'Huwezesha utengenezaji wa taa za leza (Laser) na semiconductor.' : 'Foundational to laser physics, LEDs, quantum computing, and spectroscopy.'
        }
      );
    }
    // 4. MATHEMATICS / CALCULUS / HARMONIC / LAPLACE / DIFFERENTIAL
    else if (combinedText.includes('math') || combinedText.includes('calculus') || combinedText.includes('harmonic') || combinedText.includes('sin') || combinedText.includes('laplace') || combinedText.includes('differential') || combinedText.includes('transform')) {
      labels.push(
        {
          id: 'time_domain',
          title: isSw ? 'Uwanja wa Muda: f(t)' : 'Time Domain Signal: f(t)',
          category: isSw ? 'Mkao wa Asili' : 'Temporal Dynamics Vector',
          xPercent: 25,
          yPercent: 48,
          icon: 'fa-wave-square',
          color: 'from-blue-500 to-indigo-600',
          description: isSw
            ? 'Mlinganyo au ishara inavyobadilika kulingana na muda unaoendelea. Hutumika kuchambua tabia ya mifumo halisi ya kifizikia.'
            : 'Temporal signal representation describing continuous physical states, differential kinematic rates, and oscillatory behaviors as functions of time $t$.',
          functionText: isSw
            ? 'Kupima kasi, mtetemo, au mkondo wa umeme katika kila sekunde halisi.'
            : 'Captures instantaneous velocities, mechanical vibrations, or transient electrical responses in real time.',
          formulaOrRule: 'Harmonic Motion: y(t) = A·sin(ωt + φ)',
          realWorldApplication: isSw ? 'Uchambuzi wa sauti, mawimbi ya redio, na udhibiti wa mitambo.' : 'Essential for acoustic processing, seismology, and dynamic vehicle suspension.'
        },
        {
          id: 'frequency_transform',
          title: isSw ? 'Ubadilishaji wa Laplace / S-Domain' : 'Laplace s-Domain Mapping',
          category: isSw ? 'Mlinganyo wa Algebra' : 'Algebraic Transform Mapping',
          xPercent: 72,
          yPercent: 48,
          icon: 'fa-project-diagram',
          color: 'from-rose-500 to-pink-600',
          description: isSw
            ? 'Mbinu ya kihisabati inayobadilisha milinganyo migumu ya mikokotoo (differential equations) kuwa milinganyo rahisi ya kialjebra katika uwanja wa frequency (s).'
            : 'Integral transformation mapping calculus differential equations into straightforward algebraic polynomial equations in the complex s-plane ($s = \sigma + j\omega$).',
          functionText: isSw
            ? 'Kutatua milinganyo migumu ya kiufundi kwa urahisi bila ugumu wa mikokotoo mirefu.'
            : 'Simplifies system stability analysis, feedback controller design, and resonance tuning.',
          formulaOrRule: 'Laplace Integral: F(s) = ∫₀^∞ f(t)e^(-st) dt',
          realWorldApplication: isSw ? 'Udhibiti wa ndege (Autopilot), mifumo ya meli, na roboti za viwandani.' : 'Universal foundation of aerospace autopilot, ship dynamic positioning, and DSP.'
        }
      );
    }
    // 5. GEARS / MECHANICAL / CLUTCH / TRANSMISSION
    else if (combinedText.includes('gear') || combinedText.includes('clutch') || combinedText.includes('torque') || combinedText.includes('transmission') || combinedText.includes('pinion') || combinedText.includes('meno')) {
      labels.push(
        {
          id: 'driver_gear',
          title: isSw ? 'Gia ya Kuendesha (Driver Gear)' : 'Input Driver (Pinion Gear)',
          category: isSw ? 'Chanzo cha Nguvu' : 'Kinematic Power Input',
          xPercent: 32,
          yPercent: 45,
          icon: 'fa-cog',
          color: 'from-amber-500 to-orange-600',
          description: isSw
            ? 'Gia kuu iliyounganishwa na injini au mota inayosukuma gia nyingine kwa kuzungusha meno yake.'
            : 'The primary drive gear connected directly to the motor shaft, transferring input torque $T_1$ and angular velocity $\omega_1$.',
          functionText: isSw
            ? 'Kupitisha msukumo wa mzunguko kwenda kwenye gia inayofuata.'
            : 'Injects mechanical work into the gear train across the pitch point pressure angle.',
          formulaOrRule: 'Input Power: P = T₁ · ω₁',
          realWorldApplication: isSw ? 'Hupatikana kwenye sanduku la gia za magari na mashine za viwandani.' : 'Determines initial motor loading and gearbox reduction ratios.'
        },
        {
          id: 'driven_gear',
          title: isSw ? 'Gia Inayoendeshwa (Driven Gear)' : 'Output Driven Gear',
          category: isSw ? 'Mpokea Nguvu & Mzidisha Nguvu' : 'Torque Multiplier Output',
          xPercent: 68,
          yPercent: 45,
          icon: 'fa-cogs',
          color: 'from-blue-500 to-cyan-600',
          description: isSw
            ? 'Gia inayopokea mzunguko. Ikiwa ina meno mengi kuliko ya kwanza, itaongeza nguvu ya msukumo (torque) huku ikipunguza kasi.'
            : 'The secondary driven gear receiving tangential contact force, modulating output torque and rotational speed in accordance with tooth ratio.',
          functionText: isSw
            ? 'Kuzidisha nguvu au kuongeza kasi kulingana na uwiano wa meno ($Z_2 / Z_1$).'
            : 'Delivers multiplied mechanical advantage $MA = Z_2 / Z_1 = T_2 / T_1$.',
          formulaOrRule: 'Gear Ratio: i = N₁ / N₂ = Z₂ / Z₁',
          realWorldApplication: isSw ? 'Huwezesha gari kupanda mlima mkali kwa nguvu kubwa.' : 'Crucial for automotive differentials, cranes, and heavy industrial windlasses.'
        }
      );
    }
    // 6. TRANSPORT / LOGISTICS / MULTIMODAL
    else if (combinedText.includes('transport') || combinedText.includes('usafiri') || combinedText.includes('road') || combinedText.includes('rail') || combinedText.includes('air') || combinedText.includes('water')) {
      labels.push(
        {
          id: 'intermodal_hub',
          title: isSw ? 'Kituo Kikuu cha Makutano (Intermodal Hub)' : 'Central Intermodal Hub',
          category: isSw ? 'Kitovu cha Muunganiko' : 'Multimodal Synchronization Anchor',
          xPercent: 50,
          yPercent: 51,
          icon: 'fa-network-wired',
          color: 'from-indigo-500 to-purple-600',
          description: isSw
            ? 'Kitovu cha kati kinachounganisha njia zote nne za usafiri (Barabara, Reli, Anga na Maji) kuwezesha mizigo kuhamishwa bila kukwama.'
            : 'The centralized logistics node that synchronizes transfer between maritime shipping, rail freight, air cargo, and road distribution networks.',
          functionText: isSw
            ? 'Kupunguza gharama za safari na kuongeza kasi ya ugavi wa bidhaa.'
            : 'Optimizes supply chain throughput and minimizes freight dwell times via container standardization.',
          formulaOrRule: 'Freight Efficiency: Cost / (Ton · km) Index',
          realWorldApplication: isSw ? 'Mfano Bandari ya Dar es Salaam ikiunganishwa na Reli ya SGR.' : 'Exemplified by major smart container transshipment ports and inland dry ports.'
        },
        {
          id: 'road_rail_axis',
          title: isSw ? 'Usafiri wa Nchi Kavu (Road & Rail Axis)' : 'Overland Freight Corridor',
          category: isSw ? 'Njia za Bara' : 'Overland Heavy Transport',
          xPercent: 22,
          yPercent: 32,
          icon: 'fa-truck-fast',
          color: 'from-emerald-500 to-teal-600',
          description: isSw
            ? 'Mchanganyiko wa usafiri wa barabara unaotoa unyumbufu wa kufika mlango kwa mlango, na reli inayobeba mizigo mikubwa kwa gharama nafuu.'
            : 'Complementary pairing of high-flexibility last-mile road haulage with high-capacity, low-energy overland rail freight transport.',
          functionText: isSw
            ? 'Kusambaza bidhaa hadi vijijini na kusafirisha maelfu ya tani kwa wakati mmoja.'
            : 'Handles dense intercity volume with optimal ton-kilometer energy efficiency.',
          formulaOrRule: 'Rolling Resistance: F_r = C_rr · N',
          realWorldApplication: isSw ? 'Usafirishaji wa mizigo ya madini, nafaka na bidhaa za viwandani.' : 'Core backbone of continental supply chains and bulk commodity transit.'
        },
        {
          id: 'maritime_waterway',
          title: isSw ? 'Usafiri wa Majini (Maritime / Waterway)' : 'Maritime Bulk Corridor',
          category: isSw ? 'Usafiri wa Kimataifa' : 'Global Volume Super-Carrier',
          xPercent: 80,
          yPercent: 74,
          icon: 'fa-ship',
          color: 'from-cyan-500 to-blue-600',
          description: isSw
            ? 'Njia ya majini inayobeba zaidi ya 90% ya biashara yote ya ulimwengu kwa gharama ya chini kabisa kwa kila tani moja ya mzigo.'
            : 'The maritime shipping network transporting >90% of international trade with the lowest carbon and monetary cost per ton-kilometer.',
          functionText: isSw
            ? 'Kuvusha makontena makubwa kutoka bara moja kwenda jingine.'
            : 'Enables globalized commerce via ultra-large container vessels and bulk carriers.',
          formulaOrRule: 'Payload Index: Ton · Nautical Miles / Fuel Ton',
          realWorldApplication: isSw ? 'Biashara ya kimataifa ya mafuta, mitambo, na magari.' : 'Powers international macro-economic trade routes across oceans and straits.'
        }
      );
    }

    // Dynamic Label Extractor from custom SVG code if available
    if (svgCode && labels.length < 3) {
      try {
        const textRegex = /<text[^>]*x=["']([^"']+)["'][^>]*y=["']([^"']+)["'][^>]*>([\s\S]*?)<\/text>/gi;
        let match;
        let counter = 1;
        
        // Find viewBox dimensions
        const viewBoxMatch = svgCode.match(/viewBox=["']([0-9\s.-]+)["']/i);
        let vbWidth = 400;
        let vbHeight = 300;
        if (viewBoxMatch && viewBoxMatch[1]) {
          const parts = viewBoxMatch[1].trim().split(/[\s,]+/);
          if (parts.length === 4) {
            vbWidth = parseFloat(parts[2]) || 400;
            vbHeight = parseFloat(parts[3]) || 300;
          }
        }

        while ((match = textRegex.exec(svgCode)) !== null && counter <= 4) {
          const rawX = parseFloat(match[1]) || 0;
          const rawY = parseFloat(match[2]) || 0;
          const cleanText = match[3].replace(/<[^>]+>/g, '').trim();

          if (cleanText && cleanText.length > 1 && !cleanText.includes('SYSTEM:') && !cleanText.includes('BLUEPRINT:')) {
            const xPercent = Math.max(12, Math.min(88, Math.round((rawX / vbWidth) * 100)));
            const yPercent = Math.max(15, Math.min(85, Math.round((rawY / vbHeight) * 100)));

            labels.push({
              id: `svg_node_${counter}`,
              title: cleanText,
              category: isSw ? 'Kipengele Muhimu cha Mchoro' : 'Key Analytical Node',
              xPercent,
              yPercent,
              icon: 'fa-crosshairs',
              color: counter % 2 === 0 ? 'from-blue-500 to-indigo-600' : 'from-emerald-500 to-teal-600',
              description: isSw
                ? `Kipengele hiki cha "${cleanText}" kinawakilisha kanuni na mwelekeo wa mfumo unaofundishwa kwenye mada hii.`
                : `This component "${cleanText}" represents a governing parameter and vital transition state in the active technical schema.`,
              functionText: isSw
                ? 'Hutoa msingi wa kuelewa muunganiko wa vipengele vya mchoro huu.'
                : 'Defines boundary conditions, input variables, and relational transformations within the model.',
              formulaOrRule: isSw ? 'Kanuni Kuu ya Mfumo' : 'Governing Principle: Dynamic State Variable',
              realWorldApplication: isSw ? 'Utekelezaji wa vitendo kwenye taaluma hii.' : 'Applied directly in industrial and laboratory verification.'
            });
            counter++;
          }
        }
      } catch (e) {
        console.warn('Could not parse SVG text elements dynamically', e);
      }
    }

    // Default Fallback if none matched
    if (labels.length === 0) {
      labels.push(
        {
          id: 'core_concept',
          title: isSw ? 'Mhimili Mkuu wa Mada' : 'Primary Structural Axis',
          category: isSw ? 'Nadharia Kuu' : 'Core Theoretical Entity',
          xPercent: 50,
          yPercent: 40,
          icon: 'fa-bullseye',
          color: 'from-blue-500 to-indigo-600',
          description: isSw
            ? 'Kituo kikuu cha mchoro kinachoelezea muunganiko wa dhana za kimsingi katika somo hili.'
            : 'The central schematic focal point illustrating the relational framework and operational mechanics of the lesson.',
          functionText: isSw
            ? 'Kuunganisha viashiria vya nadharia na matokeo ya vitendo.'
            : 'Bridges foundational principles with physical manifestations and empirical data.',
          formulaOrRule: isSw ? 'Mfumo Msingi' : 'Governing Axiom & System Equation',
          realWorldApplication: isSw ? 'Kupima matokeo halisi ya somo hili.' : 'Directly utilized in engineering design and academic analysis.'
        },
        {
          id: 'process_flow',
          title: isSw ? 'Mkondo wa Mabadiliko & Athari' : 'Dynamic Flow & Transformation',
          category: isSw ? 'Mzunguko wa Kazi' : 'Kinematic Energy Transfer',
          xPercent: 75,
          yPercent: 65,
          icon: 'fa-arrow-trend-up',
          color: 'from-emerald-500 to-teal-600',
          description: isSw
            ? 'Mwelekeo unaoonyesha jinsi nishati, mawimbi au taarifa zinavyohama kutoka sehemu moja kwenda nyingine.'
            : 'Illustrates directional vectors, material throughput, energy flux, or informational signals across the system.',
          functionText: isSw
            ? 'Kuelekeza mfuatano wa matukio kwenye mfumo.'
            : 'Maintains conservation of mass, energy, and momentum across boundary limits.',
          formulaOrRule: 'Conservation Law: Σ Inflow = Σ Outflow + Rate of Storage',
          realWorldApplication: isSw ? 'Kudumisha usawa wa mifumo ya kiufundi.' : 'Crucial for real-time equilibrium and diagnostic monitoring.'
        }
      );
    }

    return labels;
  }, [topic, svgCode, isSw]);

  // Selected label object
  const activeLabel = useMemo(() => {
    return diagramLabels.find(l => l.id === activeLabelId) || null;
  }, [diagramLabels, activeLabelId]);

  const hoveredLabel = useMemo(() => {
    return diagramLabels.find(l => l.id === hoveredLabelId) || null;
  }, [diagramLabels, hoveredLabelId]);

  // Audio Speech Synthesis for label details
  const speakLabelDetails = (label: DiagramLabel) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    if (isSpeaking) {
      setIsSpeaking(false);
      return;
    }

    const narration = `${label.title}. ${label.category}. ${label.description} ${label.functionText} ${label.formulaOrRule || ''}`;
    const utterance = new SpeechSynthesisUtterance(narration);
    utterance.lang = isSw ? 'sw-KE' : 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleCopyDetails = (label: DiagramLabel) => {
    const textToCopy = `📌 ${label.title} (${label.category})\n\n• Overview: ${label.description}\n• Function: ${label.functionText}\n${label.formulaOrRule ? `• Rule/Formula: ${label.formulaOrRule}\n` : ''}${label.realWorldApplication ? `• Application: ${label.realWorldApplication}` : ''}`;
    navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleAskTutor = (label: DiagramLabel) => {
    const prompt = isSw
      ? `Mwalimu, naomba unifafanulie kwa undani zaidi kuhusu sehemu ya mchoro inayoitwa "${label.title}" (${label.category}) na jinsi inavyofanya kazi.`
      : `Teacher, please explain in deeper detail how the diagram component "${label.title}" (${label.category}) functions and why it is critical.`;
    if (onAskMwalimu) {
      onAskMwalimu(prompt);
    }
  };

  return (
    <div className="relative w-full flex flex-col gap-3 group/diagram">
      {/* Top Diagram Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-white/10 shadow-lg z-30">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></div>
          <span className="text-[10px] font-black text-blue-300 uppercase tracking-widest font-mono line-clamp-1">
            {effectiveTitle}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[9px] font-bold border border-blue-500/30">
            {diagramLabels.length} {isSw ? 'Lebo' : 'Pins'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Toggle Pins Visibility */}
          <button
            onClick={() => setShowPins(!showPins)}
            className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border flex items-center gap-1.5 ${
              showPins
                ? 'bg-blue-600/30 border-blue-400/50 text-blue-200'
                : 'bg-slate-800/60 border-white/5 text-slate-400 hover:text-white'
            }`}
            title={isSw ? 'Washa/Zima Viashiria vya Lebo' : 'Toggle Hotspot Pins On/Off'}
          >
            <i className={`fas ${showPins ? 'fa-eye' : 'fa-eye-slash'} text-[10px]`}></i>
            <span>{showPins ? (isSw ? 'Viashiria Wazi' : 'Pins ON') : (isSw ? 'Viashiria Vimefichwa' : 'Pins OFF')}</span>
          </button>
        </div>
      </div>

      {/* Main Diagram Canvas with Interactive Hotspot Layer */}
      <div 
        ref={containerRef}
        className={`relative w-full rounded-[2rem] overflow-hidden border ${
          isCinematicMode ? 'border-white/15 bg-blue-950/40' : 'border-emerald-600/20 bg-slate-950/80'
        } shadow-2xl p-4 md:p-6 min-h-[300px] md:min-h-[400px] flex items-center justify-center`}
      >
        {/* Render SVG or Image */}
        {sanitizedSvg ? (
          <div 
            className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-h-[360px] drop-shadow-[0_0_25px_rgba(59,130,246,0.25)] select-none"
            dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
          />
        ) : imageUrl ? (
          <img 
            src={imageUrl} 
            alt="Technical Diagram" 
            className="w-full h-full max-h-[360px] object-contain rounded-xl"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="text-center py-12 text-slate-400 font-mono text-xs">
            <i className="fas fa-diagram-project text-3xl mb-3 text-blue-500 opacity-60"></i>
            <p>{isSw ? 'Mchoro unapakuliwa...' : 'Diagram rendering in progress...'}</p>
          </div>
        )}

        {/* Ambient Grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

        {/* Interactive Hotspot Pins Overlay */}
        {showPins && diagramLabels.map((label, idx) => {
          const isActive = activeLabelId === label.id;
          const isHovered = hoveredLabelId === label.id;

          return (
            <div
              key={label.id}
              style={{
                left: `${label.xPercent}%`,
                top: `${label.yPercent}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className="absolute z-30"
            >
              {/* Pulsing Radar Ring when active or hovered */}
              <motion.div
                animate={{
                  scale: isActive || isHovered ? [1, 1.8, 1] : [1, 1.4, 1],
                  opacity: isActive || isHovered ? [0.8, 0, 0.8] : [0.4, 0, 0.4]
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className={`absolute -inset-2.5 rounded-full bg-gradient-to-r ${label.color || 'from-blue-500 to-indigo-600'} pointer-events-none blur-[1px]`}
              />

              {/* Pin Button */}
              <motion.button
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                onMouseEnter={() => setHoveredLabelId(label.id)}
                onMouseLeave={() => setHoveredLabelId(null)}
                onClick={() => {
                  setActiveLabelId(prev => prev === label.id ? null : label.id);
                }}
                aria-label={`Inspect ${label.title}`}
                className={`relative flex items-center justify-center w-8 h-8 rounded-full border-2 shadow-2xl transition-all ${
                  isActive
                    ? 'bg-white text-slate-950 border-blue-400 shadow-[0_0_20px_rgba(255,255,255,0.8)]'
                    : 'bg-slate-900/90 text-white border-blue-400/80 hover:border-white hover:bg-blue-600'
                }`}
              >
                <i className={`fas ${label.icon || 'fa-crosshairs'} text-xs`}></i>
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-500 rounded-full text-[8px] font-black text-white flex items-center justify-center border border-slate-950">
                  {idx + 1}
                </span>
              </motion.button>

              {/* Hover Quick-Preview Tooltip (When hovered and not pinned) */}
              <AnimatePresence>
                {isHovered && !isActive && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.9 }}
                    className="absolute left-1/2 bottom-full mb-3 -translate-x-1/2 w-64 bg-slate-950/95 backdrop-blur-xl border border-blue-500/40 p-3 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] pointer-events-none z-50 text-left"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[8px] font-mono font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                        {label.category}
                      </span>
                    </div>
                    <h4 className="text-[12px] font-black text-white tracking-wide">
                      {label.title}
                    </h4>
                    <p className="text-[10px] text-slate-300 line-clamp-2 mt-1 leading-relaxed">
                      {label.description}
                    </p>
                    <div className="mt-2 text-[8px] font-mono text-blue-400 flex items-center gap-1">
                      <i className="fas fa-hand-pointer text-[9px] animate-bounce"></i>
                      <span>{isSw ? 'Bonyeza kuona maelezo kamili' : 'Click pin for full deep dive'}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* Floating Hint in bottom right */}
        <div className="absolute bottom-3 right-4 pointer-events-none opacity-60 flex items-center gap-1.5 text-[9px] font-mono text-slate-400">
          <i className="fas fa-mouse-pointer text-[8px]"></i>
          <span>{isSw ? 'Hover/Click lebo kuchambua' : 'Hover or click labels to inspect'}</span>
        </div>
      </div>

      {/* Interactive Label Selection Bar (Legend Pills) */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">
          <i className="fas fa-tags text-blue-400 mr-1.5"></i>
          {isSw ? 'Lebo za Mchoro:' : 'Components:'}
        </span>
        <div className="flex flex-wrap items-center gap-1.5 flex-1">
          {diagramLabels.map((label, idx) => {
            const isSelected = activeLabelId === label.id;
            return (
              <button
                key={label.id}
                onClick={() => setActiveLabelId(prev => prev === label.id ? null : label.id)}
                onMouseEnter={() => setHoveredLabelId(label.id)}
                onMouseLeave={() => setHoveredLabelId(null)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border flex items-center gap-2 ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.5)] scale-105'
                    : 'bg-slate-900/70 border-white/10 text-slate-300 hover:border-blue-400/50 hover:bg-slate-800'
                }`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black ${isSelected ? 'bg-white text-blue-600' : 'bg-blue-500/30 text-blue-300'}`}>
                  {idx + 1}
                </span>
                <span>{label.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Expanded Deep Dive Detail Inspector Card (When a Label is Clicked) */}
      <AnimatePresence>
        {activeLabel && (
          <motion.div
            initial={{ opacity: 0, y: 15, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="overflow-hidden z-40"
          >
            <div className={`p-5 rounded-3xl border ${
              isCinematicMode ? 'bg-gradient-to-br from-blue-950/90 via-slate-900/90 to-blue-900/90 border-blue-500/40' : 'bg-slate-900/95 border-emerald-500/30'
            } shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl relative`}>
              {/* Header */}
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${activeLabel.color || 'from-blue-500 to-indigo-600'} flex items-center justify-center text-white text-base shadow-lg shadow-blue-500/20`}>
                    <i className={`fas ${activeLabel.icon || 'fa-atom'}`}></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                        {activeLabel.category}
                      </span>
                    </div>
                    <h3 className="text-base md:text-lg font-black text-white tracking-tight mt-0.5">
                      {activeLabel.title}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Read Aloud TTS */}
                  <button
                    onClick={() => speakLabelDetails(activeLabel)}
                    className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all ${
                      isSpeaking
                        ? 'bg-emerald-500/30 border-emerald-400 text-emerald-300 animate-pulse'
                        : 'bg-slate-800/80 border-white/10 text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                    title={isSpeaking ? (isSw ? 'Sitisha Sauti' : 'Stop Narration') : (isSw ? 'Sikiliza Maelezo' : 'Listen to Explanation')}
                  >
                    <i className={`fas ${isSpeaking ? 'fa-volume-xmark' : 'fa-volume-high'} text-xs`}></i>
                  </button>

                  {/* Copy Details */}
                  <button
                    onClick={() => handleCopyDetails(activeLabel)}
                    className="w-8 h-8 rounded-xl bg-slate-800/80 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition-all"
                    title={isSw ? 'Nakili Maelezo' : 'Copy Details'}
                  >
                    <i className={`fas ${isCopied ? 'fa-check text-emerald-400' : 'fa-copy'} text-xs`}></i>
                  </button>

                  {/* Close Card */}
                  <button
                    onClick={() => {
                      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                      setIsSpeaking(false);
                      setActiveLabelId(null);
                    }}
                    className="w-8 h-8 rounded-xl bg-slate-800/80 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-500/20 hover:border-red-500/30 transition-all"
                    title={isSw ? 'Funga' : 'Close'}
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </div>
              </div>

              {/* Content Body Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {/* Left: Overview & Function */}
                <div className="space-y-3">
                  <div className="bg-black/30 p-3.5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">
                      <i className="fas fa-info-circle"></i>
                      <span>{isSw ? 'Muhtasari wa Dhana' : 'Concept Overview'}</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed font-sans">
                      {activeLabel.description}
                    </p>
                  </div>

                  <div className="bg-black/30 p-3.5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                      <i className="fas fa-gears"></i>
                      <span>{isSw ? 'Kazi & Utekelezaji' : 'Operational Function'}</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed font-sans">
                      {activeLabel.functionText}
                    </p>
                  </div>
                </div>

                {/* Right: Formulas, Rules & Real-World Application */}
                <div className="space-y-3">
                  {activeLabel.formulaOrRule && (
                    <div className="bg-blue-950/40 p-3.5 rounded-2xl border border-blue-500/20">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-cyan-300 uppercase tracking-wider mb-1">
                        <i className="fas fa-square-root-variable"></i>
                        <span>{isSw ? 'Kanuni / Mlinganyo' : 'Governing Law / Formula'}</span>
                      </div>
                      <div className="p-2 bg-black/50 rounded-xl font-mono text-xs font-bold text-cyan-200 border border-cyan-500/20">
                        {activeLabel.formulaOrRule}
                      </div>
                    </div>
                  )}

                  {activeLabel.realWorldApplication && (
                    <div className="bg-black/30 p-3.5 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                        <i className="fas fa-lightbulb"></i>
                        <span>{isSw ? 'Matumizi ya Ulimwengu Halisi' : 'Real-World Application'}</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed font-sans">
                        {activeLabel.realWorldApplication}
                      </p>
                    </div>
                  )}

                  {/* Ask Tutor Action Button */}
                  <button
                    onClick={() => handleAskTutor(activeLabel)}
                    className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 transition-all active:scale-98"
                  >
                    <i className="fas fa-hand-paper text-sm animate-pulse"></i>
                    <span>{isSw ? `Uliza Mwalimu kuhusu "${activeLabel.title}"` : `Ask Tutor About "${activeLabel.title}"`}</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
