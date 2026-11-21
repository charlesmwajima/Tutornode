import { Router } from "express";
import { AiServiceError, generateWithGemini, Type } from "../aiClient.js";
import { requireAuth, rateLimit, AuthedRequest } from "../auth.js";
import { getStudyLevelDirective } from "../pedagogy.js";

const router = Router();

router.post(
  "/generate-quiz",
  requireAuth,
  rateLimit({ name: "generate-quiz", windowMs: 60_000, max: 15 }),
  async (req: AuthedRequest, res, next) => {
    try {
      const {
        whiteboardNotes,
        language = "en",
        topic = "Lesson Assessment",
        studyLevel = "Undergraduate",
        intelLevel = "Standard",
        questionCount = 5,
      } = req.body || {};

      const notes = String(whiteboardNotes || "").trim();
      if (!notes) {
        res.status(400).json({ error: "Lesson notes are required to generate a quiz.", code: "INVALID_INPUT" });
        return;
      }

      const count = Math.min(8, Math.max(3, Number(questionCount) || 5));
      const langLabel = language === "sw" ? "SWAHILI" : "ENGLISH";

      const prompt = `You are "Mwalimu Bora", lead assessor at TutorNode.
Design a balanced assessment of ${count} questions directly grounded in the lesson notes below.

TOPIC: "${String(topic).slice(0, 240)}"
${getStudyLevelDirective(studyLevel)}
LANGUAGE: ${langLabel}

REQUIREMENTS:
- Include ${Math.max(2, count - 1)} multiple-choice questions (type: "mcq", 4 distinct options, "correctAnswer" must match one option verbatim) and 1 short-answer conceptual/application question (type: "short_answer", options: [], "correctAnswer" is the model ideal answer, "acceptedKeywords" lists 3-5 key concepts expected in a strong student response).
- Every question MUST include a clear "explanation" teaching why the answer is right and addressing common mistakes.
- Ground all questions strictly in the provided lesson material.

LESSON NOTES:
---
${notes.slice(0, 12000)}
---

Respond ONLY with valid JSON matching the schema.`;

      const { response } = await generateWithGemini({
        contents: prompt,
        thinkingLevel: intelLevel === "100% Omni-Intelligence" ? "medium" : "low",
        timeoutMs: 25000,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctAnswer: { type: Type.STRING },
                  acceptedKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                  explanation: { type: Type.STRING },
                },
                required: ["type", "question", "options", "correctAnswer", "explanation"],
              },
            },
          },
          required: ["questions"],
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        throw new AiServiceError(502, "EMPTY_AI_RESPONSE", "AI did not return quiz questions.");
      }

      res.json(parsed);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/grade-short-answer",
  requireAuth,
  rateLimit({ name: "grade-short-answer", windowMs: 60_000, max: 25 }),
  async (req: AuthedRequest, res, next) => {
    try {
      const { question, studentAnswer, modelAnswer, acceptedKeywords = [], language = "en" } = req.body || {};

      const cleanAnswer = String(studentAnswer || "").trim();
      if (!question || !cleanAnswer || !modelAnswer) {
        res.status(400).json({ error: "Question, student answer, and reference answer are required.", code: "INVALID_INPUT" });
        return;
      }

      const langLabel = language === "sw" ? "SWAHILI" : "ENGLISH";
      const prompt = `Evaluate this student's short-answer response fairly as an experienced teacher.
LANGUAGE FOR FEEDBACK: ${langLabel}

QUESTION: ${String(question).slice(0, 1000)}
MODEL REFERENCE ANSWER: ${String(modelAnswer).slice(0, 1500)}
KEY CONCEPTS EXPECTED: ${Array.isArray(acceptedKeywords) ? acceptedKeywords.join(", ") : ""}
STUDENT ANSWER: ${cleanAnswer.slice(0, 2000)}

Return JSON with:
- "isCorrect": boolean (true if the student demonstrates accurate core understanding even with different wording)
- "score": number (1 for accurate/sufficient, 0.5 for partially correct, 0 for incorrect)
- "feedback": constructive 2-3 sentence explanation praising correct reasoning and identifying any missing element.`;

      const { response } = await generateWithGemini({
        contents: prompt,
        preferFast: true,
        timeoutMs: 15000,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isCorrect: { type: Type.BOOLEAN },
            score: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
          },
          required: ["isCorrect", "score", "feedback"],
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      res.json(parsed);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
