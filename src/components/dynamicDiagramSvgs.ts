// Dynamic procedural high-fidelity academic SVG diagram generator
// Generates topic-synchronized, animated, and annotated technical diagrams with rich interactive pins

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

export interface DiagramConfig {
  svg: string;
  title: string;
  category: string;
  labels: DiagramLabel[];
}

export function getSlideSynchronizedDiagram(topic: string, isSw: boolean = false): DiagramConfig {
  const t = (topic || '').toLowerCase();

  // 1. MULTI-PLATE CLUTCH / WET CLUTCH / CLUTCH PACK
  if (
    (t.includes('multi') && t.includes('plate')) ||
    (t.includes('multi-plate')) ||
    (t.includes('wet') && t.includes('clutch')) ||
    (t.includes('clutch pack'))
  ) {
    const labels: DiagramLabel[] = [
      {
        id: 'clutch_basket',
        title: isSw ? 'Kikapu cha Nje cha Klaz (Outer Clutch Basket)' : 'Outer Clutch Basket (Driving Housing)',
        category: isSw ? 'Mpokea Mzunguko wa Injini' : 'Input Driving Structure',
        xPercent: 24,
        yPercent: 28,
        icon: 'fa-box',
        color: 'from-amber-500 to-orange-600',
        description: isSw
          ? 'Kikapu cha nje cha metali kinachozungushwa moja kwa moja na gia kuu ya injini (crankshaft primary gear). Kina mifereji ya ndani inayobeba sahani za msuguano.'
          : 'The cylindrical outer housing driven directly by the engine primary reduction gear. It features internal axial splines that positively engage the driving friction plates.',
        functionText: isSw
          ? 'Kupokea mzunguko wote wa injini na kuusambaza kwenye sahani zote za msuguano kwa pamoja.'
          : 'Transfers engine torque into the multi-disc pack across peripheral spline teeth with minimal backlash.',
        formulaOrRule: 'Primary Gear Ratio: i_p = N_crank / N_basket',
        realWorldApplication: isSw ? 'Hupatikana kwenye kila injini ya pikipiki na magari ya mashindano.' : 'Standard in all motorcycle wet clutch systems and automatic transmission planetary packs.'
      },
      {
        id: 'driving_friction_plates',
        title: isSw ? 'Sahani za Msuguano (Driving Friction Plates)' : 'Driving Friction Plates (Friction Discs)',
        category: isSw ? 'Sahani za Nje zenye Msuguano' : 'Outer Splined Active Friction Layer',
        xPercent: 44,
        yPercent: 32,
        icon: 'fa-layer-group',
        color: 'from-emerald-500 to-teal-600',
        description: isSw
          ? 'Sahani za chuma zenye tabaka la msuguano (friction material) pande zote mbili. Zina meno ya nje yanayoingia kwenye kikapu cha nje.'
          : 'Multi-layer composite discs bonded on both contact faces with high-friction organic, Kevlar, or sintered bronze lining. Outer tabs mesh into the clutch basket.',
        functionText: isSw
          ? 'Kusugua na kubana sahani za chuma (steel plates) ili kupitisha torque kwa usalama bila kuteleza.'
          : 'Generates frictional shear stress against interleaved steel plates to transmit cumulative torque.',
        formulaOrRule: 'Active Contact Surfaces: n = n₁ + n₂ - 1',
        realWorldApplication: isSw ? 'Huwezesha kupitisha torque kubwa sana katika eneo dogo lenye kipenyo kifupi.' : 'Allows compact high-torque transmission in restricted engine casing spaces.'
      },
      {
        id: 'driven_steel_plates',
        title: isSw ? 'Sahani za Chuma (Driven Steel Plates)' : 'Driven Steel Plates (Smooth Plates)',
        category: isSw ? 'Sahani za Ndani za Chuma' : 'Inner Splined Reaction Steel Discs',
        xPercent: 54,
        yPercent: 68,
        icon: 'fa-circle-dot',
        color: 'from-cyan-500 to-blue-600',
        description: isSw
          ? 'Sahani za chuma kigumu zilizonyooka vizuri zenye meno ya ndani yanayoingia kwenye kitovu cha ndani (inner hub).'
          : 'Precision-ground, hardened alloy steel discs with internal teeth splined directly onto the central clutch hub.',
        functionText: isSw
          ? 'Kupokea nguvu ya msuguano kutoka kwenye friction plates na kuielekeza moja kwa moja kwenye shafu ya gia.'
          : 'Receives frictional grip from adjacent friction plates and transmits combined torque to the transmission input shaft.',
        formulaOrRule: 'Total Multi-Plate Torque: T = n · μ · W · R_m',
        realWorldApplication: isSw ? 'Hupitisha nguvu kwenye gearbox ya pikipiki na mashine za viwandani.' : 'Transfers full tractive torque into motorcycle and heavy industrial gearboxes.'
      },
      {
        id: 'inner_clutch_hub',
        title: isSw ? 'Kitovu cha Ndani (Inner Clutch Hub)' : 'Inner Clutch Hub (Driven Output)',
        category: isSw ? 'Shafu ya Kuingia Gia' : 'Gearbox Input Shaft Coupling',
        xPercent: 46,
        yPercent: 52,
        icon: 'fa-cog',
        color: 'from-blue-600 to-indigo-700',
        description: isSw
          ? 'Kitovu cha kati kilichounganishwa moja kwa moja na shafu kuu ya sanduku la gia (transmission mainshaft).'
          : 'The central splined aluminum/steel core coupled directly to the transmission input shaft via splines.',
        functionText: isSw
          ? 'Kukusanya nguvu zote za sahani za chuma na kuziingiza kwenye mfumo wa gia kuelekea kwenye magurudumu.'
          : 'Directs accumulated mechanical power to the vehicle drive wheels through gearbox gear ratios.',
        formulaOrRule: 'Torsional Stress: τ = (T · r) / J',
        realWorldApplication: isSw ? 'Huzungusha gia zote za mwendo wa gari au pikipiki.' : 'Drives gearbox cluster gears and final chain/shaft drives.'
      },
      {
        id: 'oil_lubrication',
        title: isSw ? 'Mafuta ya Kupooza (Wet Bath Oil Flow)' : 'Wet Bath Lubrication & Cooling Oil',
        category: isSw ? 'Upoezaji wa Kimiminika' : 'Thermal Dissipation & Damping',
        xPercent: 78,
        yPercent: 38,
        icon: 'fa-droplet',
        color: 'from-sky-400 to-cyan-500',
        description: isSw
          ? 'Mtiririko wa mafuta safi ya injini yanayopita katikati ya sahani zote ili kupunguza joto kali, kuzuia kuchakaa, na kuwezesha mkamatio kuwa laini sana.'
          : 'Continuous oil circulation that lubricates plate surfaces, prevents thermal glazing, and dampens engagement shocks.',
        functionText: isSw
          ? 'Kufyonza joto la msuguano na kurefusha maisha ya sahani mara 5 zaidi ya klaz kavu.'
          : 'Dissipates high heat fluxes and enables progressive, feather-smooth clutch modulation.',
        formulaOrRule: 'Heat Flux Dissipation: Q = m_dot · C_p · ΔT',
        realWorldApplication: isSw ? 'Inalinda klaz ya pikipiki isichomeke hata dereva akipanda milima mikali kwa gia ndogo.' : 'Prevents clutch plate burnout under heavy stop-and-go city traffic and off-road riding.'
      }
    ];

    return {
      title: isSw ? 'Klaz ya Sahani Nyingi (Multi-Plate Wet Clutch)' : 'Multi-Plate Clutch Pack Assembly',
      category: isSw ? 'Uhandisi wa Magari na Pikipiki' : 'Motorcycle & Racing Powertrain',
      labels,
      svg: `<svg viewBox="0 0 500 340" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <defs>
          <linearGradient id="outerBasketGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#f59e0b"/>
            <stop offset="100%" stop-color="#b45309"/>
          </linearGradient>
          <linearGradient id="innerHubGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#3b82f6"/>
            <stop offset="100%" stop-color="#1d4ed8"/>
          </linearGradient>
        </defs>

        <rect width="500" height="340" fill="#090d16" rx="16"/>

        <!-- Centerline -->
        <line x1="20" y1="170" x2="480" y2="170" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.6"/>

        <!-- Outer Clutch Basket (Connected to Engine Input) -->
        <path d="M 60 70 L 140 70 L 140 90 L 320 90 L 320 60 L 340 60 L 340 100 L 120 100 L 120 240 L 340 240 L 340 280 L 320 280 L 320 250 L 140 250 L 140 270 L 60 270 Z" fill="url(#outerBasketGrad)" stroke="#f59e0b" stroke-width="1.5" opacity="0.85"/>
        <text x="100" y="55" fill="#fcd34d" font-size="11" font-family="sans-serif" font-weight="900">OUTER CLUTCH BASKET</text>
        <text x="100" y="295" fill="#fbbf24" font-size="9" font-family="monospace">Input from Engine Gear</text>

        <!-- Inner Clutch Hub (Splined to Gearbox Mainshaft) -->
        <rect x="150" y="130" width="160" height="80" fill="url(#innerHubGrad)" rx="6" stroke="#60a5fa" stroke-width="1.5"/>
        <text x="230" y="175" fill="#ffffff" font-size="11" text-anchor="middle" font-family="sans-serif" font-weight="bold">INNER CLUTCH HUB</text>
        <text x="230" y="195" fill="#bfdbfe" font-size="9" text-anchor="middle" font-family="monospace">Splined to Gearbox</text>

        <!-- Alternating Plates Stack (Multi-Plate Pack) -->
        <!-- Driving Friction Plates (Green - Splined to Outer Basket) -->
        <g fill="#10b981" stroke="#34d399" stroke-width="1">
          <rect x="170" y="80" width="8" height="60" rx="1"/>
          <rect x="170" y="200" width="8" height="60" rx="1"/>
          <rect x="200" y="80" width="8" height="60" rx="1"/>
          <rect x="200" y="200" width="8" height="60" rx="1"/>
          <rect x="230" y="80" width="8" height="60" rx="1"/>
          <rect x="230" y="200" width="8" height="60" rx="1"/>
          <rect x="260" y="80" width="8" height="60" rx="1"/>
          <rect x="260" y="200" width="8" height="60" rx="1"/>
          <rect x="290" y="80" width="8" height="60" rx="1"/>
          <rect x="290" y="200" width="8" height="60" rx="1"/>
        </g>

        <!-- Driven Steel Plates (Cyan - Splined to Inner Hub) -->
        <g fill="#06b6d4" stroke="#67e8f9" stroke-width="1">
          <rect x="185" y="100" width="8" height="60" rx="1"/>
          <rect x="185" y="180" width="8" height="60" rx="1"/>
          <rect x="215" y="100" width="8" height="60" rx="1"/>
          <rect x="215" y="180" width="8" height="60" rx="1"/>
          <rect x="245" y="100" width="8" height="60" rx="1"/>
          <rect x="245" y="180" width="8" height="60" rx="1"/>
          <rect x="275" y="100" width="8" height="60" rx="1"/>
          <rect x="275" y="180" width="8" height="60" rx="1"/>
        </g>

        <!-- Lubrication / Oil Flow Drops (Wet Clutch) -->
        <g fill="#38bdf8" opacity="0.75">
          <circle cx="178" cy="110" r="2.5"><animate attributeName="cy" values="100;130;100" dur="2s" repeatCount="infinity"/></circle>
          <circle cx="208" cy="120" r="2.5"><animate attributeName="cy" values="105;135;105" dur="1.8s" repeatCount="infinity"/></circle>
          <circle cx="238" cy="115" r="2.5"><animate attributeName="cy" values="100;130;100" dur="2.2s" repeatCount="infinity"/></circle>
          <circle cx="268" cy="125" r="2.5"><animate attributeName="cy" values="110;140;110" dur="1.9s" repeatCount="infinity"/></circle>
        </g>

        <!-- Compression Pressure Springs -->
        <g stroke="#ec4899" stroke-width="3">
          <path d="M 310 100 L 330 100 L 330 110 L 315 110 L 330 120 L 315 120 L 330 130"/>
          <path d="M 310 210 L 330 210 L 330 220 L 315 220 L 330 230 L 315 230 L 330 240"/>
          <text x="340" y="120" fill="#f472b6" font-size="9" font-family="sans-serif" font-weight="bold">Clutch Springs</text>
        </g>

        <!-- Labels and Legend -->
        <rect x="355" y="180" width="135" height="145" fill="#0f172a" rx="8" stroke="#3b82f6" stroke-width="1.2"/>
        <text x="365" y="200" fill="#60a5fa" font-size="10" font-family="sans-serif" font-weight="bold">MULTI-PLATE FORMULA:</text>
        <text x="365" y="220" fill="#38bdf8" font-size="11" font-family="monospace" font-weight="bold">T = n · μ · W · R_m</text>
        <text x="365" y="240" fill="#34d399" font-size="9" font-family="sans-serif">■ Driving Plates: n₁</text>
        <text x="365" y="258" fill="#22d3ee" font-size="9" font-family="sans-serif">■ Driven Plates: n₂</text>
        <text x="365" y="278" fill="#fde047" font-size="9" font-family="monospace">Total Surfaces:</text>
        <text x="365" y="295" fill="#fde047" font-size="11" font-family="monospace" font-weight="bold">n = n₁ + n₂ - 1</text>
        <text x="365" y="315" fill="#94a3b8" font-size="8" font-family="sans-serif">High Compact Torque</text>
      </svg>`
    };
  }

  // 2. CONE CLUTCH
  if (t.includes('cone') && t.includes('clutch')) {
    const labels: DiagramLabel[] = [
      {
        id: 'female_cone',
        title: isSw ? 'Koni ya Kike (Female Cone Cup)' : 'Female Cone Cup (Flywheel Rim)',
        category: isSw ? 'Sehemu ya Kuendesha' : 'Driving Tapered Member',
        xPercent: 24,
        yPercent: 32,
        icon: 'fa-circle-notch',
        color: 'from-amber-500 to-orange-600',
        description: isSw
          ? 'Sehemu ya nje ya koni iliyoundwa moja kwa moja kwenye flywheel ya injini. Ina tundu lenye mteremko maalum wa pembe alpha (12° hadi 15°).'
          : 'The internal conical recess machined directly into the engine flywheel, providing a rigid mating contact surface at semi-cone angle α.',
        functionText: isSw
          ? 'Kupokea koni ya kiume na kutoa mgandamizo mkubwa wa msuguano kupitia umbo lake la kabari.'
          : 'Provides the high-normal-force wedge cavity to lock the driven male cone with minimal slip.',
        formulaOrRule: 'Semi-cone angle α: 12° ≤ α ≤ 15°',
        realWorldApplication: isSw ? 'Hupatikana kwenye winch za meli na mifumo ya zamani ya magari.' : 'Used in heavy marine winches, racing gearboxes, and manual synchromesh hubs.'
      },
      {
        id: 'male_cone',
        title: isSw ? 'Koni ya Kiume (Male Cone)' : 'Male Cone (Sliding Member)',
        category: isSw ? 'Sehemu Inayoendeshwa' : 'Driven Splined Sliding Unit',
        xPercent: 62,
        yPercent: 35,
        icon: 'fa-shield',
        color: 'from-blue-500 to-indigo-600',
        description: isSw
          ? 'Koni ya chuma inayoteleza kwenye shafu yenye mifereji (splined shaft). Ina tabaka la msuguano kwenye mteremko wake wote.'
          : 'The tapered sliding cone splined to the transmission input shaft, lined on its conical face with high-friction friction lining.',
        functionText: isSw
          ? 'Kubana ndani ya female cone wakati spring inaposukuma mbele ili kuunganisha mzunguko.'
          : 'Engages into female cup cavity under spring preload, multiplying clamping pressure across cone taper.',
        formulaOrRule: 'Normal Clamping Force: R_n = W / sin(α)',
        realWorldApplication: isSw ? 'Huunganisha na kutenganisha nguvu za mitambo mikubwa.' : 'Core operational principle in low-speed, high-torque industrial machinery.'
      },
      {
        id: 'cone_angle_alpha',
        title: isSw ? 'Pembe ya Koni: α (Semi-Cone Angle)' : 'Semi-Cone Angle α (Wedging Angle)',
        category: isSw ? 'Jiometria ya Msuguano' : 'Geometric Wedging Multiplier',
        xPercent: 43,
        yPercent: 24,
        icon: 'fa-ruler-combined',
        color: 'from-cyan-400 to-teal-500',
        description: isSw
          ? 'Pembe ya mteremko wa koni (kawaida nyuzi 12° hadi 15°). Pembe hii inazidisha nguvu ya mgandamizo mara 4 hadi 5 zaidi ya nguvu ya kawaida ya spring!'
          : 'The acute angle α between the cone contact surface and the central rotational axis, creating intense normal force multiplication.',
        functionText: isSw
          ? 'Kuzidisha nguvu ya kawaida $R_n$ ili klaz isiteleze hata kwa kutumia spring ndogo tu.'
          : 'Multiplies effective normal reaction force: $R_n = W / \\sin(\\alpha)$, dramatically boosting torque capacity.',
        formulaOrRule: 'Wedging Factor: 1 / sin(α) ≈ 4x to 5x Force Multiplication',
        realWorldApplication: isSw ? 'Kama pembe ikiwa ndogo zaidi ya 12°, klaz itagoma kuachia (self-locking trap).' : 'If α < 12°, self-locking occurs and the clutch cannot disengage.'
      },
      {
        id: 'axial_spring_force',
        title: isSw ? 'Nguvu ya Mhimili wa Spring: W' : 'Axial Spring Preload Force (W)',
        category: isSw ? 'Nguvu ya Msukumo' : 'Axial Clamping Vector',
        xPercent: 78,
        yPercent: 50,
        icon: 'fa-arrow-left',
        color: 'from-rose-500 to-red-600',
        description: isSw
          ? 'Nguvu ya msukumo inayotolewa na spring kubwa ya kati inayosukuma male cone ndani ya female cone.'
          : 'The central axial preload supplied by the helical compression spring, pushing the male cone into the female cup.',
        functionText: isSw
          ? 'Kudumisha mgandamizo thabiti wakati dereva anapoachia pedali ya klaz.'
          : 'Maintains continuous torque coupling until the release mechanism pulls the male cone backwards.',
        formulaOrRule: 'Torque Capacity: T = (μ · W · R_m) / sin(α)',
        realWorldApplication: isSw ? 'Nguvu ndogo ya spring inatosha kubeba mzigo mkubwa sana.' : 'Permits small, lightweight spring assemblies while carrying heavy torque loads.'
      }
    ];

    return {
      title: isSw ? 'Klaz ya Koniki (Cone Friction Clutch)' : 'Cone Clutch Wedging Mechanics & Geometry',
      category: isSw ? 'Uhandisi wa Mitambo' : 'Mechanical Power Transmission',
      labels,
      svg: `<svg viewBox="0 0 500 340" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <defs>
          <linearGradient id="femaleConeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#ea580c"/>
            <stop offset="100%" stop-color="#9a3412"/>
          </linearGradient>
          <linearGradient id="maleConeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#3b82f6"/>
            <stop offset="100%" stop-color="#1e40af"/>
          </linearGradient>
        </defs>

        <rect width="500" height="340" fill="#090d16" rx="16"/>

        <!-- Centerline Axis -->
        <line x1="30" y1="170" x2="470" y2="170" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="8,4" opacity="0.6"/>

        <!-- Female Cone (Flywheel Cup - Driving Member) -->
        <path d="M 60 70 L 160 70 L 220 110 L 220 150 L 140 150 L 140 190 L 220 190 L 220 230 L 160 270 L 60 270 Z" fill="url(#femaleConeGrad)" stroke="#f97316" stroke-width="1.5"/>
        <text x="110" y="55" fill="#fdba74" font-size="11" font-family="sans-serif" font-weight="900">FEMALE CONE (CUP)</text>
        <text x="110" y="295" fill="#fed7aa" font-size="9" font-family="monospace">Driving Shaft Input</text>

        <!-- Male Cone (Sliding Cup - Driven Member) -->
        <path d="M 210 112 L 270 70 L 320 70 L 320 150 L 250 150 L 250 190 L 320 190 L 320 270 L 270 270 L 210 228 Z" fill="url(#maleConeGrad)" stroke="#60a5fa" stroke-width="1.5"/>
        <text x="300" y="55" fill="#93c5fd" font-size="11" font-family="sans-serif" font-weight="900">MALE CONE</text>

        <!-- Friction Lining on Tapered Conical Face (Yellow) -->
        <line x1="162" y1="71" x2="221" y2="111" stroke="#fde047" stroke-width="4" stroke-linecap="round"/>
        <line x1="162" y1="269" x2="221" y2="229" stroke="#fde047" stroke-width="4" stroke-linecap="round"/>
        <text x="210" y="90" fill="#fde047" font-size="9" font-family="sans-serif" font-weight="bold">Friction Lining</text>

        <!-- Semi-Cone Angle Alpha (α = 12° to 15°) -->
        <path d="M 160 70 L 230 70" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3,3"/>
        <path d="M 190 70 A 30 30 0 0 1 205 85" fill="none" stroke="#22d3ee" stroke-width="2"/>
        <text x="215" y="80" fill="#22d3ee" font-size="12" font-family="sans-serif" font-weight="bold">α</text>
        <text x="225" y="70" fill="#a5f3fc" font-size="8" font-family="monospace">Cone Angle (12°-15°)</text>

        <!-- Axial Load Force Vector W -->
        <g stroke="#f43f5e" stroke-width="2.5">
          <line x1="370" y1="170" x2="330" y2="170"/>
          <polygon points="325,170 335,165 335,175" fill="#f43f5e"/>
          <text x="350" y="160" fill="#fb7185" font-size="11" font-family="sans-serif" font-weight="bold">Axial Force (W)</text>
        </g>

        <!-- Normal Reaction Force Vector Rn (Multiplied Normal Force) -->
        <g stroke="#10b981" stroke-width="2">
          <line x1="190" y1="91" x2="165" y2="55"/>
          <polygon points="160,48 162,59 171,53" fill="#10b981"/>
          <text x="125" y="40" fill="#34d399" font-size="10" font-family="sans-serif" font-weight="bold">R_n = W / sin(α)</text>
        </g>

        <!-- Helical Compression Spring -->
        <g stroke="#ec4899" stroke-width="3">
          <path d="M 330 155 L 360 155 L 360 165 L 345 165 L 360 175 L 345 175 L 360 185"/>
        </g>

        <!-- Formula and Mechanical Advantage Box -->
        <rect x="290" y="225" width="195" height="95" fill="#0f172a" rx="8" stroke="#3b82f6" stroke-width="1.2"/>
        <text x="300" y="245" fill="#60a5fa" font-size="10" font-family="sans-serif" font-weight="bold">CONE CLUTCH TORQUE:</text>
        <text x="300" y="268" fill="#38bdf8" font-size="13" font-family="monospace" font-weight="bold">T = (μ · W · R_m) / sin(α)</text>
        <text x="300" y="288" fill="#fde047" font-size="9" font-family="monospace">Wedging Factor: 1/sin(α) ≈ 4-5x</text>
        <text x="300" y="305" fill="#cbd5e1" font-size="8" font-family="sans-serif">Massive torque from small axial force!</text>
      </svg>`
    };
  }

  // 3. CENTRIFUGAL CLUTCH
  if (t.includes('centrifugal') && t.includes('clutch')) {
    const labels: DiagramLabel[] = [
      {
        id: 'central_spider',
        title: isSw ? 'Buibui ya Kuendesha (Central Driving Spider)' : 'Central Driving Spider (Engine Hub)',
        category: isSw ? 'Chanzo cha Mzunguko' : 'Direct Crankshaft Drive Hub',
        xPercent: 42,
        yPercent: 50,
        icon: 'fa-dharmachakra',
        color: 'from-amber-400 to-yellow-600',
        description: isSw
          ? 'Kitovu cha kati kilichounganishwa moja kwa moja kwenye crankshaft ya injini. Kina mikono minne inayobeba viatu vya msuguano.'
          : 'The central drive hub keyed to the engine crankshaft that guides the 4 radially expanding friction shoes.',
        functionText: isSw
          ? 'Kuzungusha viatu vya msuguano kwa kasi ile ile ya injini.'
          : 'Transmits engine angular velocity directly to the shoe assembly.',
        formulaOrRule: 'Angular Velocity: ω = (2π · N) / 60 rad/s',
        realWorldApplication: isSw ? 'Hupatikana kwenye misumeno ya miti (chainsaws), moped na go-karts.' : 'Universal in chainsaws, scooters, go-karts, and lawnmowers.'
      },
      {
        id: 'expanding_shoes',
        title: isSw ? 'Viatu vya Msuguano (Centrifugal Shoes)' : 'Radially Expanding Friction Shoes',
        category: isSw ? 'Mwili wa Msuguano' : 'Centrifugal Dynamic Mass Elements',
        xPercent: 42,
        yPercent: 27,
        icon: 'fa-shoe-prints',
        color: 'from-emerald-500 to-teal-600',
        description: isSw
          ? 'Viatu vizito vya chuma vyenye tabaka la msuguano vinavyosukumwa nje kwa nguvu ya mtupo (centrifugal force) injini inapoongeza kasi.'
          : 'Heavy metallic shoe masses lined with friction material that translate radially outward under centrifugal acceleration.',
        functionText: isSw
          ? 'Kubana ganda la nje (drum) kwa nguvu kubwa ili kupitisha mzunguko.'
          : 'Exerts normal contact pressure $F_c = m\\omega^2 r_g$ against the outer driven drum to lock the drive.',
        formulaOrRule: 'Centrifugal Force: F_c = m · ω² · r_g',
        realWorldApplication: isSw ? 'Hufanya gari au pikipiki kuanza kutembea mara tu unapokanyaga mafuta (auto-drive).' : 'Enables fully automatic start without requiring a manual clutch lever.'
      },
      {
        id: 'retractor_springs',
        title: isSw ? 'Spring za Kurudisha (Inward Retractor Springs)' : 'Calibrated Retractor Springs',
        category: isSw ? 'Kizuia Mkamatio Mapema' : 'Centrifugal Threshold Springs',
        xPercent: 42,
        yPercent: 40,
        icon: 'fa-minimize',
        color: 'from-rose-500 to-red-600',
        description: isSw
          ? 'Spring zinazovuta viatu kuelekea ndani ili kuzuia klaz isingie wakati injini inapowashwa tu kwa kasi ndogo (idle speed).'
          : 'Precision inward tension springs that hold the shoes retracted until engine speed exceeds threshold $\\omega_e$.',
        functionText: isSw
          ? 'Kuhakikisha chombo hakitembei injini ikiwa inanguruma polepole (idling).'
          : 'Prevents creeping at engine idle; determines exact engagement RPM.',
        formulaOrRule: 'Net Engagement Force: F_net = m·ω²·r_g - F_spring',
        realWorldApplication: isSw ? 'Huwezesha kuwasha msumeno au moped bila magurudumu kuanza kuzunguka mara moja.' : 'Allows engine to idle safely in place without moving the vehicle.'
      },
      {
        id: 'outer_driven_drum',
        title: isSw ? 'Ganda la Nje (Outer Driven Drum)' : 'Outer Driven Drum (Output Rim)',
        category: isSw ? 'Mpokea Mzunguko' : 'Output Transmission Drum',
        xPercent: 62,
        yPercent: 50,
        icon: 'fa-circle-notch',
        color: 'from-cyan-400 to-blue-500',
        description: isSw
          ? 'Ganda la duara la nje lililounganishwa na gia au mnyororo wa kuendesha magurudumu au msumeno.'
          : 'The cylindrical drum connected directly to the output sprocket, pulley, or gearbox driveshaft.',
        functionText: isSw
          ? 'Kupokea nguvu ya msuguano na kuendesha mzigo wa nje mara tu viatu vinapobana.'
          : 'Driven smoothly by shoe friction when $F_{net} > 0$.',
        formulaOrRule: 'Torque Capacity: T = n · μ · (m·ω²·r_g - F_spring) · R',
        realWorldApplication: isSw ? 'Huzungusha mnyororo wa msumeno au magurudumu ya pikipiki ndogo.' : 'Drives the chain/belt in scooters, generators, and outdoor power tools.'
      }
    ];

    return {
      title: isSw ? 'Klaz ya Nguvu ya Mvuto (Centrifugal Clutch)' : 'Centrifugal Clutch Radial Shoe Mechanism',
      category: isSw ? 'Mifumo ya Kiotomatiki' : 'Automatic Mopeds & Chainsaw Powertrain',
      labels,
      svg: `<svg viewBox="0 0 500 340" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <rect width="500" height="340" fill="#090d16" rx="16"/>

        <!-- Outer Driven Drum / Rim (Driven Output) -->
        <circle cx="210" cy="170" r="120" fill="#0f172a" stroke="#0ea5e9" stroke-width="4"/>
        <text x="210" y="40" fill="#38bdf8" font-size="11" text-anchor="middle" font-family="sans-serif" font-weight="900">OUTER DRIVEN DRUM</text>

        <!-- Central Driving Spider (Engine Shaft) -->
        <circle cx="210" cy="170" r="28" fill="#eab308" stroke="#ca8a04" stroke-width="2"/>
        <text x="210" y="174" fill="#000" font-size="10" text-anchor="middle" font-family="sans-serif" font-weight="900">DRIVE</text>

        <!-- 4 Centrifugal Friction Shoes (Radially Expanding) -->
        <!-- Top Shoe -->
        <path d="M 160 90 A 100 100 0 0 1 260 90 L 245 125 A 60 60 0 0 0 175 125 Z" fill="#10b981" stroke="#34d399" stroke-width="2"/>
        <!-- Bottom Shoe -->
        <path d="M 160 250 A 100 100 0 0 0 260 250 L 245 215 A 60 60 0 0 1 175 215 Z" fill="#10b981" stroke="#34d399" stroke-width="2"/>
        <!-- Left Shoe -->
        <path d="M 130 120 A 100 100 0 0 0 130 220 L 165 205 A 60 60 0 0 1 165 135 Z" fill="#10b981" stroke="#34d399" stroke-width="2"/>
        <!-- Right Shoe -->
        <path d="M 290 120 A 100 100 0 0 1 290 220 L 255 205 A 60 60 0 0 0 255 135 Z" fill="#10b981" stroke="#34d399" stroke-width="2"/>

        <!-- Inward Retractor Springs (Opposing Centrifugal Force) -->
        <g stroke="#f43f5e" stroke-width="2.5">
          <line x1="210" y1="125" x2="210" y2="142"/>
          <line x1="210" y1="198" x2="210" y2="215"/>
          <line x1="165" y1="170" x2="182" y2="170"/>
          <line x1="238" y1="170" x2="255" y2="170"/>
        </g>

        <!-- Centrifugal Outward Force Vectors (Fc) -->
        <g stroke="#fde047" stroke-width="2">
          <line x1="210" y1="90" x2="210" y2="60"/>
          <polygon points="210,54 205,64 215,64" fill="#fde047"/>
          <text x="218" y="75" fill="#fde047" font-size="10" font-family="sans-serif" font-weight="bold">F_c = m·ω²·r</text>
        </g>

        <!-- Angular Velocity Rotation Indicator -->
        <path d="M 175 170 A 35 35 0 0 1 210 135" fill="none" stroke="#eab308" stroke-width="2" marker-end="url(#arrow)"/>
        <text x="175" y="150" fill="#eab308" font-size="12" font-family="sans-serif" font-weight="bold">ω</text>

        <!-- Formula and Operational Explanation Box -->
        <rect x="345" y="90" width="145" height="195" fill="#0f172a" rx="8" stroke="#3b82f6" stroke-width="1.2"/>
        <text x="355" y="112" fill="#60a5fa" font-size="10" font-family="sans-serif" font-weight="bold">CENTRIFUGAL LAW:</text>
        <text x="355" y="132" fill="#fde047" font-size="11" font-family="monospace" font-weight="bold">F_c = m · ω² · r_g</text>
        <text x="355" y="152" fill="#f43f5e" font-size="10" font-family="monospace">F_spring = Tension</text>
        <text x="355" y="172" fill="#34d399" font-size="10" font-family="sans-serif" font-weight="bold">Net Clamping Force:</text>
        <text x="355" y="190" fill="#38bdf8" font-size="10" font-family="monospace">F_net = F_c - F_spring</text>
        <text x="355" y="210" fill="#60a5fa" font-size="10" font-family="sans-serif" font-weight="bold">Total Torque:</text>
        <text x="355" y="230" fill="#38bdf8" font-size="11" font-family="monospace" font-weight="bold">T = n · μ · F_net · R</text>
        <text x="355" y="250" fill="#94a3b8" font-size="8" font-family="sans-serif">Engages automatically at operating RPM</text>
      </svg>`
    };
  }

  // 4. HYDRAULIC CLUTCH / FLUID COUPLING
  if (
    (t.includes('hydraulic') && t.includes('clutch')) ||
    (t.includes('fluid') && (t.includes('coupling') || t.includes('clutch') || t.includes('flywheel'))) ||
    (t.includes('torque converter'))
  ) {
    const labels: DiagramLabel[] = [
      {
        id: 'impeller_pump',
        title: isSw ? 'Pampu ya Impeller (Driving Impeller)' : 'Driving Impeller (Fluid Pump)',
        category: isSw ? 'Mzungusho wa Injini' : 'Input Centrifugal Kinetic Driver',
        xPercent: 26,
        yPercent: 32,
        icon: 'fa-fan',
        color: 'from-amber-500 to-orange-600',
        description: isSw
          ? 'Nusu ya kwanza ya chombo kilichofungwa kwenye flywheel ya injini chenye mapanga ya radial yanayorusha mafuta kwa kasi ya juu kuelekea nje.'
          : 'The driving pump half attached to the engine crankshaft whose radial vanes accelerate hydraulic oil centrifugally outward.',
        functionText: isSw
          ? 'Kugeuza nguvu ya injini kuwa nishati ya kasi ya kimiminika (kinetic energy of fluid).'
          : 'Converts mechanical input torque into high-velocity hydraulic kinetic energy $\\frac{1}{2}m v^2$.',
        formulaOrRule: 'Kinetic Energy: E_k = ½ · m · v²',
        realWorldApplication: isSw ? 'Msingi mkuu wa sanduku za gia za kujiendesha (automatic transmissions).' : 'Universal in automatic automotive gearboxes, marine propulsion, and heavy diesel locomotives.'
      },
      {
        id: 'turbine_runner',
        title: isSw ? 'Tabaeni Inayoendeshwa (Driven Turbine)' : 'Driven Turbine (Fluid Runner)',
        category: isSw ? 'Mpokea Nguvu ya Kimiminika' : 'Output Hydrodynamic Receiver',
        xPercent: 62,
        yPercent: 32,
        icon: 'fa-wind',
        color: 'from-blue-500 to-indigo-600',
        description: isSw
          ? 'Nusu ya pili ya chombo iliyounganishwa na shafu ya gearbox. Inapokea mtiririko wa mafuta na kuanza kuzunguka kwa ulaini mkubwa bila msuguano wa metali.'
          : 'The driven runner splined to the transmission input shaft, powered exclusively by the high-momentum fluid vortex from the impeller.',
        functionText: isSw
          ? 'Kugeuza nishati ya kimiminika kurudi kuwa nishati ya mzunguko wa kimekanika kuelekea magurudumuni.'
          : 'Converts hydraulic kinetic momentum back into rotary shaft torque with 0% mechanical surface wear.',
        formulaOrRule: 'Hydrodynamic Power Law: Torque ∝ N² · D⁵',
        realWorldApplication: isSw ? 'Hufanya gari lianze safari kwa ulaini wa asilimia 100 bila mtikisiko wowote.' : 'Provides 100% vibration-free, jerkless automotive takeoffs.'
      },
      {
        id: 'toroidal_fluid_flow',
        title: isSw ? 'Mtiririko wa Mzunguko (Toroidal Fluid Vortex)' : 'Toroidal Vortex Circulation',
        category: isSw ? 'Msafirishaji wa Nishati' : 'Hydrodynamic Coupling Medium',
        xPercent: 44,
        yPercent: 34,
        icon: 'fa-rotate',
        color: 'from-cyan-400 to-teal-500',
        description: isSw
          ? 'Mzunguko wa mafuta yenye presha yanayohama kutoka impeller kwenda turbine na kurudi tena kwa mzunguko wa duara (vortex).'
          : 'The continuous high-pressure circulating fluid loop passing from impeller tip into turbine outer rim.',
        functionText: isSw
          ? 'Kusafirisha torque bila kuwepo kwa mgusano wowote wa moja kwa moja kati ya vyuma viwili.'
          : 'Transfers continuous torque across an airless fluid interface, absorbing all driveline shock loads.',
        formulaOrRule: 'Coupling Slip: S = (N_impeller - N_turbine) / N_impeller',
        realWorldApplication: isSw ? 'Inazuia injini isizime gari linaposimama kwenye taa za barabarani (traffic lights).' : 'Allows vehicle to come to a complete standstill at traffic stops while remaining in gear.'
      }
    ];

    return {
      title: isSw ? 'Klaz ya Kimiminika (Fluid Coupling / Hydraulic Clutch)' : 'Fluid Coupling Hydrodynamic Vanes & Vortex Flow',
      category: isSw ? 'Uhandisi wa Majimaji' : 'Hydrodynamic Fluid Power Transmission',
      labels,
      svg: `<svg viewBox="0 0 500 340" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <rect width="500" height="340" fill="#090d16" rx="16"/>

        <!-- Centerline Axis -->
        <line x1="30" y1="170" x2="470" y2="170" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.6"/>

        <!-- Driving Impeller (Pump - Connected to Engine) -->
        <path d="M 80 70 Q 200 70 200 170 Q 200 270 80 270 L 60 270 L 60 70 Z" fill="#b45309" stroke="#f59e0b" stroke-width="2"/>
        <text x="130" y="55" fill="#fcd34d" font-size="11" text-anchor="middle" font-family="sans-serif" font-weight="900">IMPELLER (PUMP)</text>
        <text x="130" y="295" fill="#fed7aa" font-size="9" text-anchor="middle" font-family="monospace">Input: Engine Driven</text>

        <!-- Driven Turbine (Runner - Connected to Gearbox) -->
        <path d="M 360 70 Q 240 70 240 170 Q 240 270 360 270 L 380 270 L 380 70 Z" fill="#1e40af" stroke="#3b82f6" stroke-width="2"/>
        <text x="310" y="55" fill="#93c5fd" font-size="11" text-anchor="middle" font-family="sans-serif" font-weight="900">TURBINE (RUNNER)</text>
        <text x="310" y="295" fill="#bfdbfe" font-size="9" text-anchor="middle" font-family="monospace">Output: Transmission</text>

        <!-- Impeller Radial Vanes -->
        <line x1="100" y1="100" x2="180" y2="120" stroke="#fbbf24" stroke-width="3"/>
        <line x1="100" y1="240" x2="180" y2="220" stroke="#fbbf24" stroke-width="3"/>

        <!-- Turbine Radial Vanes -->
        <line x1="340" y1="100" x2="260" y2="120" stroke="#60a5fa" stroke-width="3"/>
        <line x1="340" y1="240" x2="260" y2="220" stroke="#60a5fa" stroke-width="3"/>

        <!-- Toroidal Vortex Fluid Circulation (Red / Cyan Fluid Stream) -->
        <ellipse cx="220" cy="115" rx="35" ry="25" fill="none" stroke="#22d3ee" stroke-width="3" stroke-dasharray="6,4"/>
        <ellipse cx="220" cy="225" rx="35" ry="25" fill="none" stroke="#22d3ee" stroke-width="3" stroke-dasharray="6,4"/>
        <text x="220" y="174" fill="#38bdf8" font-size="10" text-anchor="middle" font-family="sans-serif" font-weight="bold">Fluid Vortex</text>

        <!-- Fluid Energy Equation Box -->
        <rect x="360" y="180" width="130" height="95" fill="#0f172a" rx="8" stroke="#3b82f6" stroke-width="1.2"/>
        <text x="370" y="200" fill="#60a5fa" font-size="9" font-family="sans-serif" font-weight="bold">HYDRODYNAMIC LAW:</text>
        <text x="370" y="220" fill="#38bdf8" font-size="10" font-family="monospace" font-weight="bold">Torque ∝ N² · D⁵</text>
        <text x="370" y="240" fill="#fde047" font-size="9" font-family="monospace">Slip S = (N₁ - N₂)/N₁</text>
        <text x="370" y="260" fill="#cbd5e1" font-size="8" font-family="sans-serif">Zero Mechanical Wear</text>
      </svg>`
    };
  }

  // 5. TORQUE CALCULATION / UNIFORM WEAR / UNIFORM PRESSURE
  if (
    (t.includes('torque') && (t.includes('clutch') || t.includes('calculate') || t.includes('formula') || t.includes('wear') || t.includes('pressure'))) ||
    (t.includes('uniform') && (t.includes('wear') || t.includes('pressure')))
  ) {
    const labels: DiagramLabel[] = [
      {
        id: 'annular_disc_radii',
        title: isSw ? 'Vipenyo vya Ndani na Nje: r₁ & r₂' : 'Inner & Outer Radii: r₁ & r₂',
        category: isSw ? 'Vipimo vya Sahani' : 'Annular Friction Geometry',
        xPercent: 28,
        yPercent: 35,
        icon: 'fa-circle-notch',
        color: 'from-emerald-500 to-teal-600',
        description: isSw
          ? 'Kipenyo cha ndani $r_1$ kinawakilisha tundu la kati, na $r_2$ kinawakilisha ukingo wa nje wa sahani ya msuguano.'
          : 'Inner radius $r_1$ and outer radius $r_2$ defining the active annular surface area of the friction facing: $A = \\pi(r_2^2 - r_1^2)$.',
        functionText: isSw
          ? 'Kuamua eneo lote la msuguano linalobana wakati klaz inapofanya kazi.'
          : 'Calculates the contact surface area and integration bounds for torque and axial load.',
        formulaOrRule: 'Annular Area: A = π · (r₂² - r₁²)',
        realWorldApplication: isSw ? 'Hutumika kusanifu vipimo vya klaz ya gari ili isizidi ukubwa wa injini.' : 'Determines maximum envelope diameter and packaging constraints in vehicle design.'
      },
      {
        id: 'elemental_ring',
        title: isSw ? 'Mduara Mdogo: dr (Elemental Ring)' : 'Elemental Ring of Radius r and Width dr',
        category: isSw ? 'Ujumuisho wa Calculus' : 'Differential Calculus Element',
        xPercent: 28,
        yPercent: 65,
        icon: 'fa-chart-pie',
        color: 'from-amber-400 to-yellow-500',
        description: isSw
          ? 'Kipande kidogo sana cha mduara chenye upana wa $dr$ katika umbali wa $r$ kutoka katikati kinachotumika kufanya mlinganyo wa kijumla (integration).'
          : 'A thin differential annular strip of radius $r$ and width $dr$ used as the fundamental calculus integration unit: $dA = 2\\pi r dr$.',
        functionText: isSw
          ? 'Kukokotoa nguvu ndogo ya msuguano $dF$ na torque ndogo $dT = r \\cdot dF$.'
          : 'Enables precise integration of normal force $dW = p \\cdot dA$ and friction torque $dT = \\mu \\cdot r \\cdot dW$.',
        formulaOrRule: 'Elemental Friction Torque: dT = 2π · μ · p · r² · dr',
        realWorldApplication: isSw ? 'Msingi wa kuthibitisha kanuni zote za mitihani ya uhandisi wa mitambo.' : 'Universal exam derivation blueprint in Theory of Machines and Machine Design.'
      },
      {
        id: 'uniform_pressure_theory',
        title: isSw ? 'Nadharia ya Mgandamizo Sawa (Uniform Pressure: p = Const)' : 'Uniform Pressure Theory (New Clutches)',
        category: isSw ? 'Klaz Mpya Kabisa' : 'Zero-Wear Initial State Model',
        xPercent: 78,
        yPercent: 28,
        icon: 'fa-gauge-high',
        color: 'from-blue-500 to-cyan-600',
        description: isSw
          ? 'Inadhani mgandamizo $p$ ni sawa kila mahali kwenye sahani nzima. Hutumika kwa klaz mpya kabisa kabla haijaanza kuchakaa.'
          : 'Assumes normal contact pressure $p$ is uniform across the entire disc. Valid strictly for brand new, unworn friction facings.',
        functionText: isSw
          ? 'Hutoa kipenyo cha wastani $R_m = \\frac{2}{3} \\frac{r_2^3 - r_1^3}{r_2^2 - r_1^2}$.'
          : 'Yields higher initial torque capacity before mechanical wear redistribution takes place.',
        formulaOrRule: 'Mean Radius: R_m = ⅔ · (r₂³ - r₁³) / (r₂² - r₁²)',
        realWorldApplication: isSw ? 'Hutumika kukokotoa nguvu ya klaz siku ya kwanza inapotoka kiwandani.' : 'Used in factory baseline ratings of brand-new clutches.'
      },
      {
        id: 'uniform_wear_theory',
        title: isSw ? 'Nadharia ya Mchakaao Sawa (Uniform Wear: p·r = Const)' : 'Uniform Wear Theory (Standard Used Clutches)',
        category: isSw ? 'Klaz Iliyotumika (Salama)' : 'Long-Term Operating Steady-State',
        xPercent: 78,
        yPercent: 74,
        icon: 'fa-shield-halved',
        color: 'from-emerald-500 to-teal-600',
        description: isSw
          ? 'Inatambua kuwa ukingo wa nje unachakaa haraka kwa sababu ya kasi kubwa ya mzunguko ($p \\cdot r = C$). Ndiyo nadharia sahihi na salama zaidi inayotumika kusanifu mitambo.'
          : 'Recognizes that wear rate is proportional to $p \\cdot v \\propto p \\cdot r = C$. The primary, conservative standard for all practical engineering design.',
        functionText: isSw
          ? 'Hutoa fomula rahisi na salama ya $R_m = \\frac{r_1 + r_2}{2}$ na $T = n \\cdot \\mu \\cdot W \\cdot R_m$.'
          : 'Yields the industry standard arithmetic mean radius $R_m = \\frac{r_1 + r_2}{2}$.',
        formulaOrRule: 'Mean Radius: R_m = (r₁ + r₂) / 2',
        realWorldApplication: isSw ? 'Wahandisi wote hutumia kanuni hii ili kuhakikisha gari litaendelea kupitisha nguvu hata baada ya miaka mingi ya kazi.' : 'Universally mandated in automotive clutch sizing calculations.'
      }
    ];

    return {
      title: isSw ? 'Hesabu ya Nguvu ya Klaz (Torque & Wear Analysis)' : 'Clutch Annular Friction Disc Mathematical Model',
      category: isSw ? 'Hisabati ya Uhandisi' : 'Analytical Friction Mechanics',
      labels,
      svg: `<svg viewBox="0 0 500 340" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <rect width="500" height="340" fill="#090d16" rx="16"/>

        <!-- Annular Friction Disc Surface (Plan View) -->
        <g transform="translate(140, 170)">
          <!-- Outer Radius r2 -->
          <circle cx="0" cy="0" r="110" fill="#047857" stroke="#10b981" stroke-width="2" opacity="0.4"/>
          <!-- Inner Radius r1 (Hole) -->
          <circle cx="0" cy="0" r="50" fill="#090d16" stroke="#10b981" stroke-width="2"/>
          <!-- Elemental Annular Ring of Radius r and width dr -->
          <circle cx="0" cy="0" r="80" fill="none" stroke="#fde047" stroke-width="5" stroke-dasharray="4,2"/>

          <!-- Radius vectors -->
          <line x1="0" y1="0" x2="50" y2="0" stroke="#38bdf8" stroke-width="2"/>
          <text x="25" y="-5" fill="#38bdf8" font-size="11" font-family="monospace" font-weight="bold">r₁</text>

          <line x1="0" y1="0" x2="80" y2="-50" stroke="#fde047" stroke-width="2"/>
          <text x="40" y="-30" fill="#fde047" font-size="11" font-family="monospace" font-weight="bold">r</text>

          <line x1="0" y1="0" x2="110" y2="0" stroke="#ec4899" stroke-width="2"/>
          <text x="90" y="-5" fill="#ec4899" font-size="11" font-family="monospace" font-weight="bold">r₂</text>

          <!-- Elemental Ring Label -->
          <text x="0" y="95" fill="#fde047" font-size="9" text-anchor="middle" font-family="monospace" font-weight="bold">Ring Area: dA = 2π·r·dr</text>
        </g>

        <!-- Right Side: Rigorous Mathematical Derivation Comparison -->
        <rect x="270" y="30" width="215" height="135" fill="#0f172a" rx="8" stroke="#3b82f6" stroke-width="1.5"/>
        <text x="280" y="52" fill="#60a5fa" font-size="11" font-family="sans-serif" font-weight="bold">1. UNIFORM PRESSURE THEORY</text>
        <text x="280" y="70" fill="#94a3b8" font-size="9" font-family="sans-serif">(Applicable to New Clutches: p = Const)</text>
        <text x="280" y="92" fill="#38bdf8" font-size="11" font-family="monospace" font-weight="bold">R_m = ⅔ · (r₂³ - r₁³) / (r₂² - r₁²)</text>
        <text x="280" y="115" fill="#34d399" font-size="11" font-family="monospace" font-weight="bold">W = p · π · (r₂² - r₁²)</text>
        <text x="280" y="138" fill="#fde047" font-size="12" font-family="monospace" font-weight="bold">T = n · μ · W · R_m</text>

        <rect x="270" y="175" width="215" height="135" fill="#0f172a" rx="8" stroke="#10b981" stroke-width="1.5"/>
        <text x="280" y="197" fill="#34d399" font-size="11" font-family="sans-serif" font-weight="bold">2. UNIFORM WEAR THEORY</text>
        <text x="280" y="215" fill="#94a3b8" font-size="9" font-family="sans-serif">(Applicable to Worn Clutches: p·r = Const)</text>
        <text x="280" y="238" fill="#38bdf8" font-size="11" font-family="monospace" font-weight="bold">R_m = (r₁ + r₂) / 2</text>
        <text x="280" y="260" fill="#34d399" font-size="11" font-family="monospace" font-weight="bold">W = 2π · C · (r₂ - r₁)</text>
        <text x="280" y="285" fill="#fde047" font-size="12" font-family="monospace" font-weight="bold">T = n · μ · W · R_m</text>
      </svg>`
    };
  }

  // 6. SINGLE PLATE FRICTION CLUTCH (DEFAULT FOR GENERAL CLUTCHES)
  if (t.includes('clutch') || t.includes('klaz') || t.includes('friction') || t.includes('flywheel')) {
    const labels: DiagramLabel[] = [
      {
        id: 'flywheel',
        title: isSw ? 'Gurudumu la Injini (Flywheel)' : 'Engine Flywheel (Driving Member)',
        category: isSw ? 'Sehemu Kuu ya Kuendesha' : 'Rotational Inertia & Friction Face',
        xPercent: 24,
        yPercent: 48,
        icon: 'fa-compact-disc',
        color: 'from-orange-500 to-amber-600',
        description: isSw
          ? 'Gurudumu zito la chuma lililofungwa moja kwa moja kwenye crankshaft ya injini. Linatoa sehemu kubwa na thabiti ya msuguano kubana sahani ya klaz.'
          : 'Heavy cast-iron flywheel bolted to the crankshaft flange. Stores kinetic energy and acts as the primary driving friction counterface.',
        functionText: isSw
          ? 'Kupokea mzunguko wa injini na kutoa uso thabiti wa kubana clutch disc.'
          : 'Smooths out cyclic engine torque pulses and provides thermal heat sink mass for clutch engagement.',
        formulaOrRule: 'Kinetic Energy: E = ½ · I · ω²',
        realWorldApplication: isSw ? 'Hupatikana kwenye kila gari lenye injini ya mwako wa ndani (ICE).' : 'Universal in internal combustion engine passenger and commercial vehicles.'
      },
      {
        id: 'friction_disc',
        title: isSw ? 'Sahani ya Msuguano (Clutch Friction Disc)' : 'Clutch Friction Disc (Driven Member)',
        category: isSw ? 'Mpokea Nguvu wa Kati' : 'Torsionally Damped Splined Core',
        xPercent: 29,
        yPercent: 25,
        icon: 'fa-circle-dot',
        color: 'from-emerald-400 to-green-600',
        description: isSw
          ? 'Sahani ya chuma yenye tabaka la msuguano pande zote na spring za kufyonza misukosuko (torsional damper springs). Imefungwa kwenye shafu ya gearbox.'
          : 'Driven disc with dual-face organic/ceramic friction linings, cushion marcel springs, and central torsional damper coil springs.',
        functionText: isSw
          ? 'Kupitisha mzunguko kwenda kwenye gearbox na kufyonza mshtuko wakati wa kuingiza gia.'
          : 'Transmits torque to the splined transmission shaft while damping driveline vibration and engine firing pulses.',
        formulaOrRule: 'Torque Formula: T = 2 · μ · W · R_m',
        realWorldApplication: isSw ? 'Huzuia gearbox kupasuka wakati dereva anapoachia klaz ghafla.' : 'Protects transmission gears from catastrophic shock loads during rapid clutch releases.'
      },
      {
        id: 'pressure_plate',
        title: isSw ? 'Sahani ya Mgandamizo (Pressure Plate)' : 'Pressure Plate (Clamping Ring)',
        category: isSw ? 'Mbanaji Mkuu' : 'Axial Normal Force Applicator',
        xPercent: 33,
        yPercent: 48,
        icon: 'fa-compress',
        color: 'from-cyan-400 to-blue-500',
        description: isSw
          ? 'Sahani nzito ya chuma inayobanwa na spring ili kuibana friction disc katikati yake na flywheel.'
          : 'Heavy spring-loaded cast-iron pressure plate that sandwiches the clutch disc against the flywheel face.',
        functionText: isSw
          ? 'Kutoa nguvu ya kawaida (normal force $W$) inayotengeneza msuguano wa kuendesha gari.'
          : 'Applies uniform clamping force $W$ across the friction disc area to prevent slip under full throttle.',
        formulaOrRule: 'Clamping Force: W = ∫ p · dA',
        realWorldApplication: isSw ? 'Kama sahani hii ikipinda, klaz itakuwa inateleza na gari halitakuwa na nguvu.' : 'A warped pressure plate causes clutch chatter, slippage, and lost acceleration.'
      },
      {
        id: 'diaphragm_spring',
        title: isSw ? 'Spring ya Diaphragm (Diaphragm Belleville Spring)' : 'Diaphragm Spring (Belleville Spring)',
        category: isSw ? 'Chanzo cha Nguvu ya Mgandamizo' : 'Non-Linear Force Actuator',
        xPercent: 42,
        yPercent: 32,
        icon: 'fa-sun',
        color: 'from-pink-500 to-rose-600',
        description: isSw
          ? 'Spring ya chuma yenye vidole vingi vya radial inayotoa nguvu thabiti ya kubana sahani bila kuhitaji coil springs nyingi.'
          : 'Conical spring steel disc with radial release fingers. Provides high clamping force when engaged and low pedal effort when depressed.',
        functionText: isSw
          ? 'Kutoa nguvu thabiti ya kubana na kuachia sahani mara moja dereva anapobonyeza pedali ya klaz.'
          : 'Provides non-linear spring characteristics, reducing driver pedal holding effort at stoplights.',
        formulaOrRule: 'Belleville Deflection Equation: P = f(t, h, E, ν)',
        realWorldApplication: isSw ? 'Hufanya pedali ya klaz kuwa nyepesi na laini kwa dereva.' : 'Standard in modern automotive manual clutch covers worldwide.'
      },
      {
        id: 'release_bearing',
        title: isSw ? 'Beringi ya Kuachia (Release / Throwout Bearing)' : 'Release Bearing (Throwout Bearing)',
        category: isSw ? 'Kiunganishi cha Pedali' : 'Actuation Interface Unit',
        xPercent: 48,
        yPercent: 50,
        icon: 'fa-ring',
        color: 'from-indigo-400 to-purple-600',
        description: isSw
          ? 'Beringi maalum inayosukumwa na mfumo wa pedali kugandamiza vidole vya diaphragm spring ili kutenganisha klaz.'
          : 'Thrust ball bearing actuated by the clutch fork/slave cylinder to press the center fingers of the spinning diaphragm spring.',
        functionText: isSw
          ? 'Kusukuma diaphragm spring ili kuondoa mgandamizo kwenye friction disc na kuruhusu kubadilisha gia.'
          : 'Disengages the clutch cleanly during gear shifts by relieving pressure plate clamping load.',
        formulaOrRule: 'Lever Ratio: Ratio = L_pedal / L_fork',
        realWorldApplication: isSw ? 'Inapoharibika, hutoa sauti ya mluzi wakati dereva anapokanyaga klaz.' : 'Faulty throw-out bearings cause characteristic chirping noises when the pedal is pressed.'
      }
    ];

    return {
      title: isSw ? 'Klaz ya Sahani Moja (Single Plate Friction Clutch)' : 'Single Plate Friction Clutch Cross-Section',
      category: isSw ? 'Uhandisi wa Magari' : 'Automotive Transmission Engineering',
      labels,
      svg: `<svg viewBox="0 0 500 340" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <defs>
          <linearGradient id="flywheelGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#ea580c"/>
            <stop offset="100%" stop-color="#9a3412"/>
          </linearGradient>
          <linearGradient id="discGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#10b981"/>
            <stop offset="100%" stop-color="#047857"/>
          </linearGradient>
          <linearGradient id="pressureGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#06b6d4"/>
            <stop offset="100%" stop-color="#0e7490"/>
          </linearGradient>
          <linearGradient id="shaftGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#94a3b8"/>
            <stop offset="50%" stop-color="#cbd5e1"/>
            <stop offset="100%" stop-color="#64748b"/>
          </linearGradient>
        </defs>

        <!-- Background grid -->
        <rect width="500" height="340" fill="#090d16" rx="16"/>

        <!-- Centerline Axis -->
        <line x1="30" y1="170" x2="470" y2="170" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="8,4" opacity="0.6"/>
        <text x="475" y="174" fill="#38bdf8" font-size="10" font-family="monospace">Axis</text>

        <!-- Crankshaft (Engine Input) -->
        <rect x="40" y="152" width="60" height="36" fill="url(#shaftGrad)" rx="3" stroke="#475569" stroke-width="1.5"/>
        <text x="70" y="205" fill="#94a3b8" font-size="9" text-anchor="middle" font-family="sans-serif" font-weight="bold">Crankshaft</text>

        <!-- Engine Flywheel (Driving Member) -->
        <g>
          <rect x="100" y="50" width="30" height="240" fill="url(#flywheelGrad)" rx="4" stroke="#f97316" stroke-width="1.5"/>
          <!-- Friction Face -->
          <rect x="127" y="65" width="4" height="210" fill="#fde047" opacity="0.8"/>
          <text x="115" y="42" fill="#fb923c" font-size="11" text-anchor="middle" font-family="sans-serif" font-weight="900">FLYWHEEL</text>
          <text x="115" y="305" fill="#fdba74" font-size="9" text-anchor="middle" font-family="monospace">Driving Member</text>
        </g>

        <!-- Clutch Friction Disc / Plate (Driven Member) -->
        <g>
          <!-- Friction Linings Top & Bottom -->
          <rect x="135" y="65" width="12" height="90" fill="url(#discGrad)" rx="2" stroke="#34d399" stroke-width="1.5"/>
          <rect x="135" y="185" width="12" height="90" fill="url(#discGrad)" rx="2" stroke="#34d399" stroke-width="1.5"/>
          <!-- Torsional Damper Springs -->
          <circle cx="141" cy="120" r="7" fill="#f59e0b" stroke="#fff" stroke-width="1"/>
          <circle cx="141" cy="220" r="7" fill="#f59e0b" stroke="#fff" stroke-width="1"/>
          <!-- Splined Hub -->
          <rect x="131" y="148" width="20" height="44" fill="#059669" rx="3" stroke="#6ee7b7" stroke-width="1.5"/>
          <line x1="135" y1="155" x2="147" y2="155" stroke="#fff" stroke-width="1"/>
          <line x1="135" y1="170" x2="147" y2="170" stroke="#fff" stroke-width="1"/>
          <line x1="135" y1="185" x2="147" y2="185" stroke="#fff" stroke-width="1"/>
          <text x="141" y="27" fill="#34d399" font-size="11" text-anchor="middle" font-family="sans-serif" font-weight="900">FRICTION DISC</text>
        </g>

        <!-- Pressure Plate (Clamping Member) -->
        <g>
          <rect x="151" y="65" width="22" height="90" fill="url(#pressureGrad)" rx="3" stroke="#22d3ee" stroke-width="1.5"/>
          <rect x="151" y="185" width="22" height="90" fill="url(#pressureGrad)" rx="3" stroke="#22d3ee" stroke-width="1.5"/>
          <text x="162" y="42" fill="#22d3ee" font-size="10" text-anchor="middle" font-family="sans-serif" font-weight="bold">PRESSURE</text>
          <text x="162" y="52" fill="#22d3ee" font-size="10" text-anchor="middle" font-family="sans-serif" font-weight="bold">PLATE</text>
        </g>

        <!-- Diaphragm Spring (Belleville Spring) -->
        <g stroke="#ec4899" stroke-width="3" stroke-linecap="round">
          <line x1="175" y1="75" x2="220" y2="145"/>
          <line x1="175" y1="265" x2="220" y2="195"/>
          <!-- Pivot rings -->
          <circle cx="195" cy="110" r="4" fill="#ec4899" stroke="#fff" stroke-width="1"/>
          <circle cx="195" cy="230" r="4" fill="#ec4899" stroke="#fff" stroke-width="1"/>
          <text x="210" y="90" fill="#f472b6" font-size="9" text-anchor="start" font-family="sans-serif" font-weight="bold">Diaphragm Spring</text>
        </g>

        <!-- Release Bearing (Throwout Bearing) -->
        <g>
          <rect x="225" y="145" width="24" height="50" fill="#6366f1" rx="4" stroke="#a5b4fc" stroke-width="1.5"/>
          <circle cx="237" cy="170" r="5" fill="#fff"/>
          <path d="M260 170 L285 170" stroke="#f43f5e" stroke-width="2" marker-end="url(#arrow)"/>
          <text x="237" y="136" fill="#a5b4fc" font-size="9" text-anchor="middle" font-family="sans-serif" font-weight="bold">Release Bearing</text>
          <text x="237" y="210" fill="#cbd5e1" font-size="8" text-anchor="middle" font-family="monospace">Clutch Pedal</text>
        </g>

        <!-- Transmission Splined Input Shaft -->
        <rect x="151" y="156" width="220" height="28" fill="url(#shaftGrad)" rx="2" stroke="#475569" stroke-width="1.5"/>
        <text x="310" y="198" fill="#e2e8f0" font-size="10" text-anchor="middle" font-family="sans-serif" font-weight="bold">Transmission Splined Shaft</text>

        <!-- Clamping Force Vectors (W) -->
        <g stroke="#eab308" stroke-width="2">
          <line x1="190" y1="95" x2="160" y2="95"/>
          <polygon points="156,95 164,91 164,99" fill="#eab308"/>
          <line x1="190" y1="245" x2="160" y2="245"/>
          <polygon points="156,245 164,241 164,249" fill="#eab308"/>
          <text x="180" y="115" fill="#fde047" font-size="9" font-family="monospace" font-weight="bold">Axial Load (W)</text>
        </g>

        <!-- Torque Transmission Formula Box -->
        <rect x="300" y="240" width="185" height="75" fill="#0f172a" rx="8" stroke="#3b82f6" stroke-width="1.5"/>
        <text x="310" y="258" fill="#60a5fa" font-size="10" font-family="sans-serif" font-weight="bold">SINGLE PLATE TORQUE:</text>
        <text x="310" y="278" fill="#38bdf8" font-size="12" font-family="monospace" font-weight="bold">T = n · μ · W · R_m</text>
        <text x="310" y="296" fill="#94a3b8" font-size="9" font-family="monospace">n = 2 (Two friction surfaces)</text>
      </svg>`
    };
  }

  // 7. DEFAULT ACADEMIC DIAGRAM
  return {
    title: isSw ? `Mchoro wa Kiufundi: ${topic.slice(0, 30)}` : `Technical Analytical Schematic: ${topic.slice(0, 30)}`,
    category: isSw ? 'Muundo wa Taaluma' : 'Masterclass Technical Blueprint',
    labels: [
      {
        id: 'core_node',
        title: isSw ? 'Kiini cha Mada' : 'Primary Functional Node',
        category: isSw ? 'Dhana Kuu' : 'Core Theoretical Parameter',
        xPercent: 50,
        yPercent: 50,
        icon: 'fa-bullseye',
        color: 'from-blue-500 to-indigo-600',
        description: isSw
          ? 'Kipengele kikuu cha kiufundi kinachounganisha vigezo vya somo hili.'
          : 'The central operational nexus representing the primary theoretical principle of this lesson slide.',
        functionText: isSw
          ? 'Kuunganisha nguvu za kuingia na matokeo ya utendaji.'
          : 'Coordinates input boundary conditions into governed output responses.',
        formulaOrRule: 'System Law: Σ Inputs = Σ Outputs + Rate of Change',
        realWorldApplication: isSw ? 'Inatumika katika uhandisi na sayansi ya vitendo.' : 'Directly applied in engineering design and scientific measurement.'
      }
    ],
    svg: `<svg viewBox="0 0 500 340" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <linearGradient id="nodeGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#3b82f6"/>
          <stop offset="100%" stop-color="#1d4ed8"/>
        </linearGradient>
      </defs>
      <rect width="500" height="340" fill="#090d16" rx="16"/>
      <circle cx="250" cy="170" r="55" fill="url(#nodeGrad1)" stroke="#60a5fa" stroke-width="2"/>
      <text x="250" y="165" fill="#ffffff" font-size="12" text-anchor="middle" font-family="sans-serif" font-weight="bold">CORE</text>
      <text x="250" y="182" fill="#bfdbfe" font-size="10" text-anchor="middle" font-family="monospace">PRINCIPLE</text>
      <rect x="50" y="135" width="100" height="70" fill="#0f172a" rx="8" stroke="#3b82f6" stroke-width="1.5"/>
      <text x="100" y="165" fill="#60a5fa" font-size="11" text-anchor="middle" font-family="sans-serif" font-weight="bold">INPUT</text>
      <text x="100" y="185" fill="#94a3b8" font-size="9" text-anchor="middle" font-family="monospace">Variables</text>
      <rect x="350" y="135" width="100" height="70" fill="#0f172a" rx="8" stroke="#10b981" stroke-width="1.5"/>
      <text x="400" y="165" fill="#34d399" font-size="11" text-anchor="middle" font-family="sans-serif" font-weight="bold">OUTPUT</text>
      <text x="400" y="185" fill="#94a3b8" font-size="9" text-anchor="middle" font-family="monospace">Results</text>
      <path d="M 150 170 L 195 170" stroke="#38bdf8" stroke-width="3" stroke-dasharray="4,4"/>
      <path d="M 305 170 L 350 170" stroke="#34d399" stroke-width="3" stroke-dasharray="4,4"/>
    </svg>`
  };
}
