export interface Topic {
  title: string;
  description: string;
  subtopics?: string[];
}

export interface Unit {
  title: string;
  topics: Topic[];
}

export interface Module {
  title: string;
  units: Unit[];
}

export interface Chapter {
  title: string;
  topics: Topic[];
}

export interface Syllabus {
  id?: string;
  title: string;
  description: string;
  modules?: Module[];
  chapters?: Chapter[];
  isLocal?: boolean;
  createdAt?: string;
}

export function ensureSyllabusCompatibility(syllabus: any): any {
  if (!syllabus) return syllabus;
  const result = { ...syllabus };

  // 1. If we have modules, always populate/update chapters from modules to keep them 100% in sync
  if (Array.isArray(result.modules) && result.modules.length > 0) {
    const chapters: any[] = [];
    result.modules.forEach((mod: any) => {
      if (Array.isArray(mod.units)) {
        mod.units.forEach((unit: any) => {
          chapters.push({
            title: `${mod.title} - ${unit.title}`,
            topics: unit.topics || []
          });
        });
      }
    });
    result.chapters = chapters;
  }

  // 2. If we have chapters but not modules, populate modules
  if (Array.isArray(result.chapters) && (!Array.isArray(result.modules) || result.modules.length === 0)) {
    result.modules = [
      {
        title: "Module I: Core Curriculum",
        units: result.chapters.map((ch: any) => ({
          title: ch.title,
          topics: ch.topics || []
        }))
      }
    ];
  }

  return result;
}

export const PRELOADED_SYLLABI: Record<string, Syllabus> = {
  quantum: {
    title: "Quantum State Trapping & Thermals (Mtego wa Kwanta & Mifumo ya Joto)",
    description: "An advanced graduate coursework analyzing dynamic mechanical particle confinement, wave-coherence optimization, and continuous cryogenic dilution refrigeration.",
    modules: [
      {
        title: "Module I: Quantum Trapping (Mtego wa Kwanta)",
        units: [
          {
            title: "Unit 1: Quantum Electro-dynamics & Trapping",
            topics: [
              { 
                title: "Quantum State Superposition Trapping", 
                description: "Learn how to isolate atomic structures in ionized lattices using high-frequency oscillating RF Paul Traps.",
                subtopics: ["Ionized Lattice Mechanics", "RF Paul Trap Oscillations", "Atomic Superposition Preserves", "High-Frequency Confining Potentials"]
              },
              { 
                title: "Coherence Lifetime Tuning", 
                description: "Master thermal and magnetic mitigation vectors to preserve phase coherence coefficients in quantum computing.",
                subtopics: ["Coherence Preservations", "Magnetic Invalidation Mitigation", "Thermal Fluctuation Corrections", "Computing Coherent Alignment"]
              },
              { 
                title: "Lorentz Forces Trapping Co-relations", 
                description: "Map electro-magnetic balance matrix parameters to guarantee perfect sub-nanometer atomic stabilization.",
                subtopics: ["Electro-magnetic Balancing Matrix", "Sub-nanometer Resolution Stabilizer", "Lorentz Force Vectors", "Dynamic Position Compensators"]
              }
            ]
          }
        ]
      },
      {
        title: "Module II: Containment Engineering (Kuzuia Sumaku)",
        units: [
          {
            title: "Unit 1: Electro-magnetic Containment Design",
            topics: [
              { 
                title: "Symmetric Magnetic Bottle Fields", 
                description: "Analyze hexapolar quadrupole configurations inside ultra-high vacuum chamber environments.",
                subtopics: ["Quadrupole Hexapolar Fields", "Symmetric Containment Calculations", "Ultra-High Vacuum Interfacings", "Particle Mirroring Operations"]
              },
              { 
                title: "Vacuum Chamber Enthalpy Matrices", 
                description: "Calculate vacuum containment leak degradation coefficients and molecular gas transport dynamics.",
                subtopics: ["Enthalpy Balance Matrix", "Leak Rates & Outgassing Coefficents", "Molecular Flow Gas Dynamics", "System Pumpdowns Curve Dynamics"]
              },
              { 
                title: "Laser Cooling Doppler Resonances", 
                description: "Tune optical Doppler frequencies to cool trapped particles down to micro-Kelvin theoretical limits.",
                subtopics: ["Optical Doppler Mechanics", "Micro-Kelvin Cooling Limits", "Laser Alignment Configurations", "Scattering Force Dissipation"]
              }
            ]
          }
        ]
      },
      {
        title: "Module III: Cryogenic Systems (Kijoto Chini)",
        units: [
          {
            title: "Unit 1: Low Temperature Cryogenics",
            topics: [
              { 
                title: "Helium-3 / Helium-4 Dilution Refrigeration", 
                description: "Deep dive into phase separation mechanics yielding continuous sub-Millikelvin laboratory operations.",
                subtopics: ["Phase Separation Fluidics", "Continuous Sub-Millikelvin Cooling", "Dilution Mix Dynamics", "Cryostat Flow Management"]
              },
              { 
                title: "Cryostatic Superconducting Shields", 
                description: "Design active superconducting thermal shields to block external radiant heat leakages.",
                subtopics: ["Superconducting Transition Dynamics", "Radiant Heat Blocking", "Cryostatic Chamber Design", "Thermal Drift Compensation"]
              },
              { 
                title: "Entropy Dissipation Sink Mapping", 
                description: "Calculate maximum cooling load rates and thermal transport links across crystal structures.",
                subtopics: ["Cooling Load Dissipation Rates", "Crystal Lattice Transport Links", "Entropy Production Mitigation", "Active Load Buffering"]
              }
            ]
          }
        ]
      }
    ]
  },
  architecture: {
    title: "Neural Hardware & Systems Engineering (Muundo wa Juu wa Kompyuta wa Haraka)",
    description: "A comprehensive syllabus on high-throughput superscalar processor architectures, network-on-chip interconnects, and systolic tensor core acceleration arrays.",
    modules: [
      {
        title: "Module I: Execution Pipelines (Utekelezaji wa Kasi)",
        units: [
          {
            title: "Unit 1: Superscalar Processor Execution",
            topics: [
              { 
                title: "Out-of-Order Pipelines Architecture", 
                description: "Examine reservation stations, reorder buffers, and dynamic instruction scheduling mechanics.",
                subtopics: ["Reservation Stations Mechanics", "Reorder Buffer Execution Tracking", "Dynamic Out-of-Order Pipelines", "Instruction Hazard Resolution"]
              },
              { 
                title: "Register Renaming Matrices", 
                description: "Map architectural registers to deep physical register files to resolve instruction hazard bottlenecks.",
                subtopics: ["Architectural Registry Maps", "Physically Backed Allocation Files", "Resource Stall Resolutions", "Register Renaming Matrices"]
              },
              { 
                title: "Branch Prediction Neural Weights", 
                description: "Model global history registers utilizing perceptron-driven predictive feedback loops.",
                subtopics: ["Global History Core Registers", "Perceptron Multi-Layer Predictor Loops", "Branch History Misprediction Corrections", "Specular Executions Controls"]
              }
            ]
          }
        ]
      },
      {
        title: "Module II: Cache and Interconnects (Mshikamano na Viunganishi)",
        units: [
          {
            title: "Unit 1: NoC Cache Coherence",
            topics: [
              { 
                title: "MESI & MOESI Protocols", 
                description: "Explore state machine invalidation models for distributed multi-socket memory hierarchies.",
                subtopics: ["MESI State Transit Graphs", "MOESI Share-Owner Metrics", "Distributed Memory Invalidation Cycles", "Core Bus Snooping Invalidation"]
              },
              { 
                title: "Directory-Based Coherence Nodes", 
                description: "Scale coordination overhead by mapping message broadcasts into point-to-point directory blocks.",
                subtopics: ["Scaled Overhead Coordination Maps", "Point-to-Point Directory Nodes", "Coherence Broadcast Limitations", "Message Invalidation Routing"]
              },
              { 
                title: "Network-on-Chip (NoC) Routers", 
                description: "Analyze packet-switched routing algorithms, virtual channels, and flow control matrices.",
                subtopics: ["Packet Switched Routing Flows", "Virtual Cache Queue Paths", "Flow Congestions Maps", "Interconnect Topology Layouts"]
              }
            ]
          }
        ]
      },
      {
        title: "Module III: Tensor Acceleration (Pande za Kasi za Neural)",
        units: [
          {
            title: "Unit 1: Tensor Acceleration Arrays",
            topics: [
              { 
                title: "Systolic Arrays Architecture", 
                description: "Trace spatial data flows of matrix multiplications optimizing MAC hardware utilization factors.",
                subtopics: ["Spatial Matrix Data Streams", "MAC Unit Processing Cells", "Processor Interconnect Pipelines", "Memory Bound Bottlenecks"]
              },
              { 
                title: "Tensor Core Dataflow Registers", 
                description: "Design low-latency accumulation registers to guarantee high-throughput FP16 matrix operations.",
                subtopics: ["FP16 Matrix Multiply-Accumulate", "Low-Latency Registry Trees", "High-Throughput Acceleration Datapaths", "Register Loading Schemes"]
              },
              { 
                title: "Hardware-Aware Network Quantization", 
                description: "Optimize inference overhead by mapping floating-point models into low-precision INT8 hardware.",
                subtopics: ["INT8 Hardware Transformations", "Inference Overhead Scaling Plans", "Dynamic Quantization Errors Control", "Precision Loss Recovery"]
              }
            ]
          }
        ]
      }
    ]
  },
  chemistry: {
    title: "Nanotechnology & Materials Science (Kemia Isiyo ya Kioroganiki & Neli-Teknolojia)",
    description: "An intensive overview studying carbon nanotube chemical vapor deposition Growth, coordination complex chelation, and colloidal semiconductor shell bandgaps.",
    modules: [
      {
        title: "Module I: Nanotube Growth (Ujenzi wa Mapipa ya Kaboni)",
        units: [
          {
            title: "Unit 1: Carbon Nanotube Growth Mechanics",
            topics: [
              { 
                title: "Chemical Vapor Deposition (CVD)", 
                description: "Isolate catalytic pyrolysis of hydrocarbons on metal substrate nanostructures.",
                subtopics: ["Catalytic Hydrocarbon Pyrolysis", "Substrate Growth Nucleations", "Thermal Reactor Control Systems", "Vapor Transport Flux Models"]
              },
              { 
                title: "Chirality & Vector Determination", 
                description: "Index rolled graphene sheet coordinates to categorize semiconducting versus metallic behaviors.",
                subtopics: ["Rolled Graphene Coordinate Indices", "Semiconducting vs Metallic Classifications", "Chiral Angle Calculation Mechanics", "Transport Property Predictions"]
              },
              { 
                title: "Defect Mitigation Strategies", 
                description: "Audit mechanical strains and carbon vacancies causing early electrical pathway failures.",
                subtopics: ["Mechanical Strain Calculations", "Carbon Vacancy Repair Diagnostics", "Pathway Integrity Monitoring", "Dynamic Growth Annealing"]
              }
            ]
          }
        ]
      },
      {
        title: "Module II: Coordination and Ligands (Kemia ya Uratibu na Kuunganisha)",
        units: [
          {
            title: "Unit 1: Coordination Complexes & Ligands",
            topics: [
              { 
                title: "Crystal Field Splitting Theory", 
                description: "Calculate energy differences across d-orbital configurations under octahedral crystal fields.",
                subtopics: ["d-orbital Energy Splitting Patterns", "Octahedral Crystal Field Matrix", "Spectrochemical Ligand Ranks", "Transition Wave absorption Spectrum"]
              },
              { 
                title: "Chelation Thermodynamic Splitting", 
                description: "Analyze entropy-driven multi-dentate ligand integrations yielding high structural durability.",
                subtopics: ["Entropy-Driven Enthalpy Balance", "Multi-dentate Ligand Complex Cycles", "Stability Constant Keq Curves", "Chelate Rings Sizes Effects"]
              },
              { 
                title: "Jahn-Teller Enthalpy Distortions", 
                description: "Observe breaking of structural degeneration in high-spin copper and manganese coordination compounds.",
                subtopics: ["Structural Degeneracy Breaking Cycles", "High-Spin Coordination Distortion Rules", "Octahedral Coordination Stretching Vectors", "Spectroscopy Measurements Validations"]
              }
            ]
          }
        ]
      },
      {
        title: "Module III: Colloidal Semiconductor (Semikonda za Koloidi)",
        units: [
          {
            title: "Unit 1: Colloidal Semiconductor Synthesis",
            topics: [
              { 
                title: "Quantum Dot Nucleation", 
                description: "Model the classical LaMer model of seed development and high-temperature crystal growth phase.",
                subtopics: ["LaMer Classical Nucleation Curves", "Seed Dispersion Formations", "High-Temperature Crystal Enlargement Phases", "Precursor Decomposition Control Plans"]
              },
              { 
                title: "Core-Shell Bandgap Confinement", 
                description: "Coat cadmium-selenide cores with zinc-sulfide to isolate exciton recombination zones.",
                subtopics: ["Cadmium-Selenide Core Coatings", "Zinc-Sulfide Shell Deposition Steps", "Exciton Phase Confinement Isolation", "Photoluminescence Efficiency Enhancement Plans"]
              },
              { 
                title: "Ligand Exchange Surface Dynamics", 
                description: "Swap long insulator organic chains to construct conductive solar cell quantum layers.",
                subtopics: ["Surface Ligand Insulator Displacements", "Conductive Nanoparticle Link Chains", "Quantum Layer Charges Transport", "Solution-Phase Exchanges Kinetics"]
              }
            ]
          }
        ]
      }
    ]
  },
  marine: {
    title: "Diploma in Marine Engineering (Mtaala wa Uhandisi wa Meli)",
    description: "The complete, standardized Kenya Maritime Authority (KMA) and KICD TVET curriculum across all three modules covering ship construction, mechanics, electronics, and conventions.",
    modules: [
      {
        title: "Module I: Safe Ship Foundations",
        units: [
          {
            title: "Unit 1: Ship Construction (3.1.0)",
            topics: [
              {
                title: "Introduction to Ship Construction",
                description: "Fundamental terminology, historical evolution, and commercial classifications of vessels in active service.",
                subtopics: ["Terms used in ship construction", "Historical development and evolution of ships", "Types of ships in service", "Design parameters & functional requirements"]
              },
              {
                title: "Ship Dimensions and Form",
                description: "Understanding geometrical dimensions, centerline configurations, perpendicular lengths, and hull form parameters.",
                subtopics: ["Camber and rise of floor", "Tumblehome, flare, and sheer", "Length between perpendiculars (LBP)", "Moulded vs extreme draft", "Block coefficient (Cb) calculations"]
              }
            ]
          },
          {
            title: "Unit 2: Marine Electrical Technology I (4.1.0)",
            topics: [
              {
                title: "Workshop Safety",
                description: "Safety guidelines, workshop regulations, first aid, electric shock rescue, and classes of fires and their matching extinguishers.",
                subtopics: ["Electrical shock rescue procedures", "Classes of fire and suitable extinguishers", "First aid kit and safety manuals", "Personal Protective Equipment (PPE) utilization"]
              }
            ]
          },
          {
            title: "Unit 3: Workshop Technology and Practice (5.1.0)",
            topics: [
              {
                title: "Hand Tools and Bench Work",
                description: "Safe operation, maintenance, and precision application of hand tools in marine workshop environments.",
                subtopics: ["Filing, sawing, and chiseling mechanics", "Measurement and calibration with micrometers", "Thread cutting with taps and dies", "Workshop layout procedures"]
              }
            ]
          },
          {
            title: "Unit 4: General Marine Engineering Knowledge I (6.1.0)",
            topics: [
              {
                title: "Fundamentals of Marine Machinery",
                description: "An overview of shipboard machinery, mechanical power transmissions, and operational principles.",
                subtopics: ["Propulsion shafting configurations", "Auxiliary machinery integrations", "Lubrication and cooling baselines", "Routine engine room watchkeeping duties"]
              }
            ]
          },
          {
            title: "Unit 5: Technical Drawing (7.1.0)",
            topics: [
              {
                title: "Orthographic Projection",
                description: "Drafting first and third angle projections of marine structural and mechanical components.",
                subtopics: ["First vs third angle standards", "Dimensioning conventions", "Isometric to orthographic conversion", "Geometrical construction techniques"]
              }
            ]
          },
          {
            title: "Unit 6: Mathematics I (8.1.0)",
            topics: [
              {
                title: "Algebra & Trigonometry",
                description: "Mathematical problem solving involving algebraic equations, indices, logarithms, and trigonometric identities.",
                subtopics: ["Quadratic equations resolution", "Laws of logarithms & indices", "Trigonometric ratios & graphs", "Application of vectors in navigation"]
              }
            ]
          },
          {
            title: "Unit 7: Communication Skills (9.1.0)",
            topics: [
              {
                title: "Technical Report Writing",
                description: "Developing structured engineering reports, logging operational entries, and formal correspondence.",
                subtopics: ["Structure of engineering logs", "Technical writing style guide", "Preparing maintenance requests", "Effective presentation of data"]
              }
            ]
          },
          {
            title: "Unit 8: Entrepreneurship (10.1.0)",
            topics: [
              {
                title: "Business Identification",
                description: "Evaluating entrepreneurial opportunities, market structures, and local enterprise feasibility.",
                subtopics: ["Characteristics of an entrepreneur", "Assessing business opportunities", "Market analysis basics", "Legal and regulatory frameworks"]
              }
            ]
          },
          {
            title: "Unit 9: Information Communication Technology (ICT) (11.1.0)",
            topics: [
              {
                title: "Computer Hardware & OS",
                description: "Core concepts of computer hardware, software, security baselines, and operating systems.",
                subtopics: ["Desktop & server hardware architectures", "Operating system file systems", "Malware & virus protection vectors", "Network configuration basics"]
              }
            ]
          },
          {
            title: "Unit 10: Motor Engineering Knowledge I (12.1.0)",
            topics: [
              {
                title: "Internal Combustion Engine Principles",
                description: "Operating cycles, thermodynamics, and physical components of 2-stroke and 4-stroke marine diesel engines.",
                subtopics: ["Indicator diagrams & power calculations", "Scavenging and supercharging systems", "Timing gears and camshaft actions", "Crankcase explosion prevention"]
              }
            ]
          },
          {
            title: "Unit 11: Life Skills (13.1.0)",
            topics: [
              {
                title: "Self Awareness & Values",
                description: "Developing self-esteem, setting personal values, understanding peer influence, and active coping mechanisms.",
                subtopics: ["Goal setting & career planning", "Stress and time management", "Empathy & active listening", "Healthy lifestyle practices"]
              }
            ]
          },
          {
            title: "Unit 12: Applied Science (14.1.0)",
            topics: [
              {
                title: "Forces & Motion",
                description: "Fundamental physics concepts including Newton's laws of motion, force vectors, heat energy, and acoustics.",
                subtopics: ["Newton's three laws of motion", "Work, energy, and power metrics", "Properties of matter under heat", "Wave mechanics and sound propagation"]
              }
            ]
          }
        ]
      },
      {
        title: "Module II: Advanced Marine Mechanics",
        units: [
          {
            title: "Unit 1: Applied Mechanics (15.2.0)",
            topics: [
              {
                title: "Statics and Equilibrium",
                description: "Evaluating moments, couples, forces, and stresses in static structural components of ships.",
                subtopics: ["Coplanar forces resolution", "Bending moment & shear force diagrams", "Centroids and second moment of area", "Friction laws and application"]
              }
            ]
          },
          {
            title: "Unit 2: Ship Stability (16.2.0)",
            topics: [
              {
                title: "Displacement and Flotation",
                description: "Archimedes' principles applied to displacement hull designs, density allowances, and hydrostatic scale parameters.",
                subtopics: ["Archimedes flotation principle", "TPC (Tonnes per Centimetre) immersion", "Simpson's first and second rules", "Calculating center of gravity (KG) modifications"]
              }
            ]
          },
          {
            title: "Unit 3: Marine Electrical Technology II (17.2.0)",
            topics: [
              {
                title: "AC Circuit Theory",
                description: "Single-phase and three-phase AC systems, power factors, electrical safety, and marine switchboard routing.",
                subtopics: ["Generation of alternating current", "Star and delta configurations", "Transformer operation principles", "Generator parallel syncing procedures"]
              }
            ]
          },
          {
            title: "Unit 4: General Marine Engineering Knowledge II (18.2.0)",
            topics: [
              {
                title: "Steering Gear & Deck Machinery",
                description: "Hydraulic steering gear mechanisms, anchor windlasses, cargo winches, and auxiliary machinery pipelines.",
                subtopics: ["Hele-Shaw pump steering systems", "Emergency steering requirements", "Deck machinery hydraulic loops", "Bilge and ballast pumping safety"]
              }
            ]
          },
          {
            title: "Unit 5: Thermo Fluids (19.2.0)",
            topics: [
              {
                title: "Fluid Mechanics",
                description: "Fluid properties, pressure measurements, flow rates, and Bernoulli's equation in pipe flows.",
                subtopics: ["Hydrostatic pressure calculations", "Laminar vs turbulent flow", "Bernoulli's energy equation", "Friction losses in piping systems"]
              }
            ]
          },
          {
            title: "Unit 6: Mathematics II (20.2.0)",
            topics: [
              {
                title: "Complex Numbers & Matrices",
                description: "Advanced calculus, matrix algebra, complex numbers, and differential equations applied in engineering.",
                subtopics: ["Argand diagram representations", "Determinants and matrix inverses", "First order differential equations", "Laplace transforms introduction"]
              }
            ]
          },
          {
            title: "Unit 7: Research Methods (21.2.0)",
            topics: [
              {
                title: "Research Design",
                description: "Formulating research hypotheses, literature reviews, data collection instruments, and statistical processing.",
                subtopics: ["Problem statement formulation", "Sampling methodologies", "Quantitative vs qualitative analysis", "Formatting academic citations"]
              }
            ]
          },
          {
            title: "Unit 8: Business Plan (22.2.0)",
            topics: [
              {
                title: "Market Analysis",
                description: "Structuring a complete business plan with executive summaries, marketing setups, and financial viability indexes.",
                subtopics: ["SWOT analysis execution", "Marketing mix (4 Ps)", "Cash flow forecast charts", "Break-even point determinations"]
              }
            ]
          },
          {
            title: "Unit 9: Engineering Drawing and Design (23.2.0)",
            topics: [
              {
                title: "Computer-Aided Design (CAD)",
                description: "Design of marine engine components, assembly drawings, and mechanical tolerances using standard software.",
                subtopics: ["CAD workspace setup and commands", "Drafting coupling and crankshaft components", "Geometric dimensioning & tolerancing", "Sectional assembly layouts"]
              }
            ]
          }
        ]
      },
      {
        title: "Module III: Systems and Regulatory Compliance",
        units: [
          {
            title: "Unit 1: Marine Environment Protection (24.3.0)",
            topics: [
              {
                title: "MARPOL Regulations",
                description: "Analyzing the six annexes of the International Convention for the Prevention of Pollution from Ships.",
                subtopics: ["Annex I: Prevention of oil pollution", "Annex IV: Prevention of sewage pollution", "Annex VI: Prevention of air pollution", "Oily Water Separator (OWS) operation"]
              }
            ]
          },
          {
            title: "Unit 2: Mathematics III (25.3.0)",
            topics: [
              {
                title: "Probability & Statistics",
                description: "Statistical modeling, standard distributions, correlation coefficients, and numerical approximations.",
                subtopics: ["Probability distribution profiles", "Normal and binomial calculations", "Curve fitting and least-squares regression", "Numerical integrations"]
              }
            ]
          },
          {
            title: "Unit 3: Instrumentation and Control Engineering (26.3.0)",
            topics: [
              {
                title: "Sensor Technology & Transducers",
                description: "Measurement of temperature, pressure, level, and flow with pneumatic and electronic transmission loops.",
                subtopics: ["Thermocouples and RTD characteristics", "Pneumatic transmitter operations", "Proportional-Integral-Derivative (PID) tuning", "Automatic fuel-air ratio control"]
              }
            ]
          },
          {
            title: "Unit 4: Motor Engineering Knowledge II (27.3.0)",
            topics: [
              {
                title: "Medium and Slow Speed Diesel Engines",
                description: "Large bore propulsion engines, electronic common-rail fuel injection systems, and indicator card diagnostics.",
                subtopics: ["Common-rail fuel systems", "Combustion anomaly diagnostics", "Engine cylinder liner wear metrics", "Slow speed engine starting air circuits"]
              }
            ]
          },
          {
            title: "Unit 5: Applied Thermodynamics (28.3.0)",
            topics: [
              {
                title: "Gas Turbine Cycles",
                description: "Thermodynamic cycles, air compressors, steam turbine plant dynamics, and refrigeration loops.",
                subtopics: ["Brayton and Rankine cycle dynamics", "Refrigerant properties & Mollier charts", "Steam boiler efficiency tests", "Heat exchanger performance metrics"]
              }
            ]
          },
          {
            title: "Unit 6: Maritime Conventions (29.3.0)",
            topics: [
              {
                title: "SOLAS and STCW Conventions",
                description: "Understanding primary international conventions ensuring safety of life at sea and training standards for seafarers.",
                subtopics: ["SOLAS Subdivision and Stability", "STCW certification requirements", "ISPS vessel security protocols", "Port State Control inspection targets"]
              }
            ]
          },
          {
            title: "Unit 7: Marine Organization And Management (30.3.0)",
            topics: [
              {
                title: "Shipboard Management Structure",
                description: "Managing vessel crew operations, safety management systems, ISM code audits, and human resource allocation.",
                subtopics: ["ISM Code safety objectives", "Bridge and Engine Resource Management", "Shipboard hierarchy & role definitions", "Drill and emergency training audits"]
              }
            ]
          },
          {
            title: "Unit 8: Trade Project (31.3.0)",
            topics: [
              {
                title: "Project Design & Synthesis",
                description: "Proposing, researching, developing, and presenting a practical maritime engineering solution or prototype.",
                subtopics: ["Design specification writing", "Cost analysis and budgeting", "Prototype fabrication and testing", "Technical documentation & defense"]
              }
            ]
          },
          {
            title: "Unit 9: Industrial Attachment (32.3.0)",
            topics: [
              {
                title: "Workplace Integration & Safety",
                description: "Structured practical seagoing or shipyard placement to gain hands-on technical skills and document experience.",
                subtopics: ["Industrial safety and compliance guidelines", "Task logging in training logbooks", "Engine room systems tracing", "Preparing final internship report"]
              }
            ]
          }
        ]
      }
    ]
  }
};

// Auto-run compatibility formatting for PRELOADED_SYLLABI
Object.keys(PRELOADED_SYLLABI).forEach((key) => {
  PRELOADED_SYLLABI[key] = ensureSyllabusCompatibility(PRELOADED_SYLLABI[key]);
});
