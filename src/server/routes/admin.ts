import { Router } from "express";
import { AiServiceError, generateWithGemini, Type } from "../aiClient.js";
import { requireAdmin, requireAuth, rateLimit, AuthedRequest } from "../auth.js";

const router = Router();

router.post(
  "/analyze-admin-feedbacks",
  requireAdmin,
  rateLimit({ name: "admin-feedback-analysis", windowMs: 60_000, max: 10 }),
  async (req: AuthedRequest, res, next) => {
    try {
      const { feedbacks, language = "en", intelLevel = "Standard" } = req.body || {};
      if (!Array.isArray(feedbacks) || feedbacks.length === 0) {
        res.status(400).json({ error: "At least one feedback entry is required for analysis.", code: "INVALID_INPUT" });
        return;
      }

      const trimmedFeedbacks = feedbacks.slice(0, 100).map((f: Record<string, unknown>) => ({
        topic: String(f?.topic || "General").slice(0, 150),
        quality_score: Number(f?.quality_score || 0),
        relevance_score: Number(f?.relevance_score || 0),
        comments: String(f?.comments || "").slice(0, 1000),
      }));

      const langLabel = language === "sw" ? "SWAHILI" : "ENGLISH";
      const prompt = `Analyze these real student feedback submissions from TutorNode and provide actionable product insights.
LANGUAGE: ${langLabel}

FEEDBACK DATA:
${JSON.stringify(trimmedFeedbacks, null, 2)}

Return strict JSON matching the schema. Do not invent complaints or metrics not grounded in the provided data.`;

      const { response } = await generateWithGemini({
        contents: prompt,
        thinkingLevel: intelLevel === "100% Omni-Intelligence" ? "medium" : "low",
        timeoutMs: 25000,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            sentimentPercentage: { type: Type.INTEGER },
            topRequests: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  request: { type: Type.STRING },
                  priority: { type: Type.STRING },
                  countHint: { type: Type.STRING },
                  reasoning: { type: Type.STRING },
                },
                required: ["request", "priority", "countHint", "reasoning"],
              },
            },
            positiveThemes: { type: Type.ARRAY, items: { type: Type.STRING } },
            painPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            actionableRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["summary", "sentimentPercentage", "topRequests", "positiveThemes", "painPoints", "actionableRecommendations"],
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      if (!parsed.summary) {
        throw new AiServiceError(502, "EMPTY_AI_RESPONSE", "AI feedback analysis returned empty output.");
      }
      res.json(parsed);
    } catch (err) {
      next(err);
    }
  }
);

router.post("/generate-brand", requireAuth, async (_req, res) => {
  const emblemSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <linearGradient id="tnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#0ea5e9"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="48" fill="#0f172a"/>
  <circle cx="128" cy="112" r="56" fill="none" stroke="url(#tnGrad)" stroke-width="8"/>
  <path d="M96 112 L128 84 L160 112 L128 140 Z" fill="url(#tnGrad)" opacity="0.85"/>
  <circle cx="128" cy="112" r="8" fill="#ffffff"/>
  <text x="128" y="208" font-family="system-ui, sans-serif" font-weight="800" font-size="24" fill="#f8fafc" letter-spacing="3" text-anchor="middle">TUTORNODE</text>
</svg>`;
  const base64 = Buffer.from(emblemSvg).toString("base64");
  res.json({ imageUrl: `data:image/svg+xml;base64,${base64}` });
});

export default router;
