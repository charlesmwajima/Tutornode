import { Router } from "express";
import { AiServiceError, generateWithGemini, Type } from "../aiClient.js";
import { requireAuth, rateLimit, AuthedRequest } from "../auth.js";
import { getStudyLevelDirective } from "../pedagogy.js";

const router = Router();

const syllabusResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    modules: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          units: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                topics: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      subtopics: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                    },
                    required: ["title", "description", "subtopics"],
                  },
                },
              },
              required: ["title", "topics"],
            },
          },
        },
        required: ["title", "units"],
      },
    },
  },
  required: ["title", "description", "modules"],
};

router.post(
  "/generate-syllabus",
  requireAuth,
  rateLimit({ name: "generate-syllabus", windowMs: 60_000, max: 10 }),
  async (req: AuthedRequest, res, next) => {
    try {
      const { subject, language = "en", studyLevel = "Undergraduate" } = req.body || {};
      const cleanSubject = String(subject || "").trim();
      if (!cleanSubject || cleanSubject.length > 300) {
        res.status(400).json({ error: "Please provide a valid course subject (1-300 characters).", code: "INVALID_INPUT" });
        return;
      }

      const langLabel = language === "sw" ? "SWAHILI" : "ENGLISH";
      const prompt = `You are a senior curriculum designer at TutorNode.
Create a comprehensive, logically sequenced coursework syllabus for: "${cleanSubject}".
${getStudyLevelDirective(studyLevel)}
OUTPUT LANGUAGE: ${langLabel}

Organize into 2-3 clear Modules, each with 2-4 Units, each Unit containing 2-4 Topics, and each Topic containing a 1-sentence description plus 3-4 concise subtopics.
Respond ONLY with valid JSON matching the schema.`;

      const { response } = await generateWithGemini({
        contents: prompt,
        thinkingLevel: "low",
        timeoutMs: 28000,
        responseMimeType: "application/json",
        responseSchema: syllabusResponseSchema,
      });

      const parsed = JSON.parse(response.text || "{}");
      if (!Array.isArray(parsed.modules) || parsed.modules.length === 0) {
        throw new AiServiceError(502, "EMPTY_AI_RESPONSE", "AI did not return syllabus modules.");
      }

      res.json(parsed);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/generate-syllabus-from-file",
  requireAuth,
  rateLimit({ name: "generate-syllabus-file", windowMs: 60_000, max: 8 }),
  async (req: AuthedRequest, res, next) => {
    try {
      const { fileData, language = "en", studyLevel = "Undergraduate" } = req.body || {};
      if (!fileData?.data || !fileData?.mimeType) {
        res.status(400).json({ error: "Uploaded syllabus file data and MIME type are required.", code: "INVALID_INPUT" });
        return;
      }
      if (!["application/pdf", "text/plain", "text/markdown", "text/csv"].includes(fileData.mimeType)) {
        res.status(400).json({ error: "Only PDF, TXT, MD, or CSV syllabus files are supported.", code: "UNSUPPORTED_FILE_TYPE" });
        return;
      }
      if (typeof fileData.data !== "string" || fileData.data.length > 5_500_000) {
        res.status(413).json({ error: "File exceeds serverless request size limit (4MB).", code: "PAYLOAD_TOO_LARGE" });
        return;
      }

      const langLabel = language === "sw" ? "SWAHILI" : "ENGLISH";
      const { response } = await generateWithGemini({
        contents: [
          {
            inlineData: {
              mimeType: fileData.mimeType,
              data: fileData.data,
            },
          },
          {
            text: `Extract the complete structured curriculum from this uploaded document into modules, units, topics, concise 1-sentence descriptions, and 2-4 short subtopics per topic.
${getStudyLevelDirective(studyLevel)}
Do not fabricate units missing from the document. Output in ${langLabel} as valid JSON matching the schema.`,
          },
        ],
        thinkingLevel: "low",
        timeoutMs: 36000,
        responseMimeType: "application/json",
        responseSchema: syllabusResponseSchema,
      });

      const parsed = JSON.parse(response.text || "{}");
      if (!Array.isArray(parsed.modules) || parsed.modules.length === 0) {
        throw new AiServiceError(502, "EMPTY_AI_RESPONSE", "Could not extract syllabus structure from file.");
      }

      res.json(parsed);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
