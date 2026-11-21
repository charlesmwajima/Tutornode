import { Router } from "express";
import { AiServiceError, generateWithGemini } from "../aiClient.js";
import { requireAuth, rateLimit, AuthedRequest } from "../auth.js";
import { getStudyLevelDirective, selectTeachingTechnique } from "../pedagogy.js";

const router = Router();

router.post(
  "/qa-lesson",
  requireAuth,
  rateLimit({ name: "qa-lesson", windowMs: 60_000, max: 25 }),
  async (req: AuthedRequest, res, next) => {
    try {
      const {
        currentTopic = "General Study",
        currentSegment,
        language = "en",
        messages = [],
        userMessage,
        intelLevel = "Standard",
        studyLevel = "Undergraduate",
        teachingTechniqueId,
      } = req.body || {};

      const cleanUserMessage = String(userMessage || "").trim();
      if (!cleanUserMessage || cleanUserMessage.length > 4000) {
        res.status(400).json({ error: "Please enter a valid question (1-4000 characters).", code: "INVALID_INPUT" });
        return;
      }

      const technique = selectTeachingTechnique(teachingTechniqueId);
      const langLabel = language === "sw" ? "SWAHILI" : "ENGLISH";

      const systemInstruction = `You are "Mwalimu Bora", an encouraging, knowledgeable AI tutor at TutorNode.
The student is discussing: "${String(currentTopic).slice(0, 250)}".

ACTIVE LESSON SLIDE CONTEXT:
- Whiteboard Content: ${String(currentSegment?.content || "No active slide").slice(0, 3000)}
- Instructor Notes: ${String(currentSegment?.speech || "No active dialogue").slice(0, 2000)}

${getStudyLevelDirective(studyLevel)}
${technique.promptDirective}

PEDAGOGY RULES:
- Respond directly to what the student just asked using clear step-by-step explanations and concrete examples.
- When the student is working on an exam or calculation question:
  * Guide using the 8-step framework (Given -> Required -> Principle -> Formula -> Substitution -> Calculation -> Unit -> Check).
  * Give progressive hints instead of dumping the entire final answer immediately, unless the student explicitly says they are stuck after trying or asks for the worked solution.
  * When correcting an error, praise the valid steps first, pinpoint the exact mistake, and ask a guiding follow-up question.
- End your response with one clear, friendly check-for-understanding question.
- Write in ${langLabel} using clean Markdown.`;

      const safeHistory = Array.isArray(messages)
        ? messages
            .filter((m: unknown): m is { role?: string; content: string } =>
              Boolean(m && typeof m === "object" && "content" in m && typeof (m as { content?: unknown }).content === "string" && (m as { content: string }).content.trim())
            )
            .slice(-16)
            .map((m) => ({
              role: m.role === "user" ? ("user" as const) : ("model" as const),
              parts: [{ text: m.content.slice(0, 4000) }],
            }))
        : [];

      const rawContents = [...safeHistory, { role: "user" as const, parts: [{ text: cleanUserMessage }] }];
      const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

      for (const item of rawContents) {
        const last = contents[contents.length - 1];
        if (last && last.role === item.role) {
          last.parts[0].text += "\n\n" + item.parts[0].text;
        } else {
          contents.push(item);
        }
      }

      const { response } = await generateWithGemini({
        contents,
        systemInstruction,
        thinkingLevel: intelLevel === "100% Omni-Intelligence" ? "medium" : "low",
        timeoutMs: 22000,
      });

      const text = response.text?.trim();
      if (!text) {
        throw new AiServiceError(502, "EMPTY_AI_RESPONSE", "No response text received from AI tutor.");
      }

      res.json({ text });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
