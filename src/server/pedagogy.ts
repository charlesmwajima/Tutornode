export interface TeachingTechnique {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  color: string;
  badgeBg: string;
  description: string;
  promptDirective: string;
}

export const TEACHING_TECHNIQUES: TeachingTechnique[] = [
  {
    id: "socratic",
    name: "Socratic Method",
    subtitle: "Guided Inquiry & Self-Discovery",
    icon: "fa-comments",
    color: "text-amber-400",
    badgeBg: "bg-amber-500/10 border-amber-500/20",
    description: "Asks targeted diagnostic questions to help the learner deduce principles.",
    promptDirective: `TEACHING TECHNIQUE: SOCRATIC GUIDED INQUIRY
- Ask focused conceptual questions before jumping to formulas.
- Guide the student step-by-step from known facts to conclusions.
- End each slide dialogue with a thoughtful question that invites reasoning.`,
  },
  {
    id: "feynman",
    name: "Feynman Method",
    subtitle: "First-Principles Intuitive Clarity",
    icon: "fa-lightbulb",
    color: "text-cyan-400",
    badgeBg: "bg-cyan-500/10 border-cyan-500/20",
    description: "Breaks complex systems down to clear everyday intuition before rigor.",
    promptDirective: `TEACHING TECHNIQUE: FEYNMAN FIRST-PRINCIPLES METHOD
- Start with plain-language intuition and concrete real-world analogies.
- Identify common misconceptions and clarify them explicitly.
- Build formal equations only after the physical picture is crystal clear.`,
  },
  {
    id: "visual",
    name: "Visual Spatial Mapping",
    subtitle: "Diagram-Driven Systems Thinking",
    icon: "fa-diagram-project",
    color: "text-blue-400",
    badgeBg: "bg-blue-500/10 border-blue-500/20",
    description: "Connects every spoken explanation directly to animated SVG schematics.",
    promptDirective: `TEACHING TECHNIQUE: VISUAL SPATIAL MAPPING
- Anchor every explanation to concrete visual parts in the per-slide SVG schematic.
- Refer clearly to flows, forces, components, and relationships visible in the diagram.
- Pair formulas with geometric or physical meaning.`,
  },
  {
    id: "problem_based",
    name: "Problem-Based Mastery",
    subtitle: "Worked Scenarios & Real Calculations",
    icon: "fa-calculator",
    color: "text-emerald-400",
    badgeBg: "bg-emerald-500/10 border-emerald-500/20",
    description: "Teaches theory through realistic worked problems and unit checks.",
    promptDirective: `TEACHING TECHNIQUE: PROBLEM-BASED MASTERY
- Frame concepts around realistic engineering, scientific, or analytical problems.
- Show Given, Required, Principle, Formula, Substitution, Calculation, and Units clearly.
- Include boundary checks and sanity verification of results.`,
  },
  {
    id: "exam_coach",
    name: "Examiner Coaching",
    subtitle: "Mark-Scheme Precision & Trap Avoidance",
    icon: "fa-clipboard-check",
    color: "text-rose-400",
    badgeBg: "bg-rose-500/10 border-rose-500/20",
    description: "Prioritizes high-mark topics, common exam traps, and step-by-step method marks.",
    promptDirective: `TEACHING TECHNIQUE: EXAMINER COACHING
- Highlight where method marks, diagram marks, and unit marks are awarded.
- Call out common student traps and unit conversion mistakes.
- Guide the student interactively without giving away answers before thinking prompts.`,
  },
];

export function selectTeachingTechnique(requestedId?: string): TeachingTechnique {
  if (requestedId && requestedId !== "random") {
    const found = TEACHING_TECHNIQUES.find((t) => t.id === requestedId);
    if (found) return found;
  }
  const index = Math.floor(Math.random() * TEACHING_TECHNIQUES.length);
  return TEACHING_TECHNIQUES[index];
}

export function getStudyLevelDirective(studyLevel?: string): string {
  switch (studyLevel) {
    case "Elementary":
      return "STUDY LEVEL: ELEMENTARY / PRIMARY SCHOOL. Use very simple language, short sentences, concrete everyday examples, and avoid heavy formulas.";
    case "High School":
      return "STUDY LEVEL: HIGH SCHOOL / SECONDARY. Define technical terms clearly, show accessible algebra and diagrams, and use relatable applications.";
    case "Postgraduate":
      return "STUDY LEVEL: POSTGRADUATE / RESEARCH. Deliver rigorous formal theory, derivations, edge cases, and methodological nuance.";
    case "Professional":
      return "STUDY LEVEL: PROFESSIONAL / PRACTITIONER. Emphasize operational standards, risk trade-offs, system diagnostics, and practical implementation.";
    case "Undergraduate":
    default:
      return "STUDY LEVEL: UNDERGRADUATE / COLLEGE. Maintain solid academic rigor, accurate terminology, formulas with units, and worked examples.";
  }
}

export function getTrackFocusDirective(classTrack?: string): string {
  switch (classTrack) {
    case "Science":
      return "ACADEMIC TRACK: SCIENCE & ENGINEERING. Emphasize physical laws, derivations, unit consistency, schematics, and worked numerical examples.";
    case "Technology":
      return "ACADEMIC TRACK: TECHNOLOGY & COMPUTING. Emphasize architectures, algorithms, protocols, edge cases, and system trade-offs.";
    case "Humanities":
      return "ACADEMIC TRACK: HUMANITIES & SOCIAL SCIENCES. Emphasize historical context, textual evidence, critical arguments, and structured synthesis.";
    case "Medicine":
      return "ACADEMIC TRACK: HEALTH & CLINICAL SCIENCES. Emphasize anatomy/physiology mechanisms, diagnostic reasoning, and clinical relevance.";
    case "Business":
    default:
      return "ACADEMIC TRACK: GENERAL & APPLIED STUDIES. Balance clear conceptual understanding with structured practical applications.";
  }
}

export function cleanSpeechDuplications(
  segments: Array<{ content: string; speech: string; diagram_svg_code?: string; diagram_title?: string }>,
  language: string,
  teacherName: string,
  topic: string
) {
  if (!Array.isArray(segments)) return [];
  const isSw = language === "sw";
  const safeTeacher = teacherName || "Mwalimu Bora";
  const greetingPrefix = isSw
    ? `Habari, karibu TutorNode. Jina langu ni ${safeTeacher}, na leo tutajifunza kuhusu ${topic}. Hebu tuanze.`
    : `Hello and welcome to TutorNode. I am ${safeTeacher}, and today we are exploring ${topic}. Let's get started.`;

  return segments.map((seg, idx) => {
    let speech = String(seg?.speech || "").trim();
    if (idx === 0) {
      if (!speech.toLowerCase().includes("tutornode") && !speech.toLowerCase().includes(safeTeacher.toLowerCase())) {
        speech = `${greetingPrefix} ${speech}`;
      }
    } else {
      speech = speech
        .replace(/^(hello|hi|habari|karibu)[^.!?]*?(tutornode|omnitutor|academy)[^.!?]*?[.!?]\s*/i, "")
        .replace(/^my name is [^.!?]*?[.!?]\s*/i, "")
        .replace(/^jina langu ni [^.!?]*?[.!?]\s*/i, "");
    }
    return {
      content: String(seg?.content || ""),
      speech: speech.trim(),
      diagram_svg_code: seg?.diagram_svg_code,
      diagram_title: seg?.diagram_title,
    };
  });
}

export function getExamRevisionPrompt(params: {
  input: string;
  language: string;
  targetSlides: number;
  teacherName: string;
  studyLevel: string;
  classTrack: string;
  technique: TeachingTechnique;
  additionalInstructions?: string;
}): string {
  const { input, language, targetSlides, teacherName, studyLevel, classTrack, technique, additionalInstructions } = params;
  const langLabel = language === "sw" ? "SWAHILI" : "ENGLISH";

  return `You are "${teacherName}", an experienced, patient master teacher at TutorNode conducting a COMPLETE examination paper revision lesson.
You MUST act strictly as an interactive teacher guiding the student through the uploaded examination paper — NEVER simply dump solved answers.

USER TOPIC / FOCUS: "${input}"
OUTPUT LANGUAGE: ${langLabel}
TARGET SYNCHRONIZED SLIDES: ${targetSlides}
${getStudyLevelDirective(studyLevel)}
${getTrackFocusDirective(classTrack)}
${technique.promptDirective}
${additionalInstructions ? `ADDITIONAL STUDENT INSTRUCTIONS: ${additionalInstructions}` : ""}

MANDATORY EXAM REVISION PEDAGOGY:
1. STUDY THE ENTIRE PAPER FIRST:
   - Identify subject, all topics, subtopics, question types, marks allocated, calculations, theory, definitions, derivations, diagrams, repeated concepts, and difficult areas. Never guess missing or unreadable text.
2. CREATE A TEACHER'S REVISION ROADMAP (Slide 1):
   - Group ALL questions in the examination paper logically by concept (Topic -> Subtopic -> Concept -> Formula -> Example -> Exam Question -> Practice) prioritized by marks and importance, ensuring EVERY question in the paper is covered.
3. TEACH EACH TOPIC FROM THE BASICS BEFORE EACH EXAM QUESTION:
   - Explain the concept in simple language, why it matters, essential terminology, underlying principle, formulas (what it represents, every symbol, units, when to use it, required givens), a simple illustrative example, and a check-for-understanding question.
4. GUIDE THROUGH ALL EXAM QUESTIONS STEP-BY-STEP:
   - Connect directly: "Now that you understand the concept, let's see how the examiner tested it."
   - For calculations, follow the 8-step framework: Given -> Required -> Principle -> Formula -> Substitution -> Calculation -> Unit -> Sanity Check.
   - Include 3-level progressive hints (Hint 1: small conceptual clue, Hint 2: formula/principle pointer, Hint 3: next computational step) before revealing solutions.
   - Ask one thinking question per slide in the spoken dialogue and pause for student participation.
5. DYNAMIC PER-SLIDE SVG DIAGRAMS:
   - Each segment in "segments" MUST provide a distinct, valid, topic-specific "diagram_svg_code" (<svg viewBox="0 0 600 400" ...>) and "diagram_title" matching the exact machine, component, subtype, circuit, free-body diagram, or concept taught on THAT specific slide (never keep one static diagram across the lesson).

Return valid JSON matching the schema, including BOTH "segments" (for the interactive smartboard) and "structuredLesson" (for structured notes).`;
}
