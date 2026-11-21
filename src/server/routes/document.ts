import { Router } from "express";
import { put } from "@vercel/blob";
import { AiServiceError, generateWithGemini, Type } from "../aiClient.js";
import { requireAuth, rateLimit, validateAllowedBlobUrl, AuthedRequest } from "../auth.js";

const router = Router();

const ALLOWED_DOC_MIMES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
}

router.post(
  "/upload-document",
  requireAuth,
  rateLimit({ name: "upload-document", windowMs: 60_000, max: 10 }),
  async (req: AuthedRequest, res, next) => {
    try {
      const { fileName, mimeType, base64Data } = req.body || {};
      if (!fileName || !mimeType || !base64Data || typeof base64Data !== "string") {
        res.status(400).json({ error: "fileName, mimeType, and base64Data are required.", code: "INVALID_INPUT" });
        return;
      }

      if (!ALLOWED_DOC_MIMES.has(mimeType)) {
        res.status(400).json({ error: `Unsupported file type: ${mimeType}`, code: "UNSUPPORTED_FILE_TYPE" });
        return;
      }

      const buffer = Buffer.from(base64Data, "base64");
      if (buffer.byteLength === 0 || buffer.byteLength > 4 * 1024 * 1024) {
        res.status(413).json({
          error: "File must be non-empty and under 4MB per request.",
          code: "FILE_TOO_LARGE",
        });
        return;
      }

      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        res.status(501).json({
          error: "Vercel Blob storage is not configured (BLOB_READ_WRITE_TOKEN missing). Small documents can still be analyzed directly inline.",
          code: "BLOB_NOT_CONFIGURED",
        });
        return;
      }

      const safeName = sanitizeFilename(String(fileName));
      const objectPath = `tutornode/${req.authUser!.uid}/${Date.now()}-${safeName}`;
      const blob = await put(objectPath, buffer, {
        access: "public",
        contentType: mimeType,
        addRandomSuffix: true,
      });

      res.json({
        url: blob.url,
        pathname: blob.pathname,
        size: buffer.byteLength,
        mimeType,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/analyze-document",
  requireAuth,
  rateLimit({ name: "analyze-document", windowMs: 60_000, max: 12 }),
  async (req: AuthedRequest, res, next) => {
    try {
      const {
        fileName = "Document",
        fileData,
        blobUrl,
        action = "full",
        language = "en",
        studyLevel = "Undergraduate",
        focusPrompt = "",
      } = req.body || {};

      let inlinePart: { inlineData: { mimeType: string; data: string } } | null = null;

      if (blobUrl && typeof blobUrl === "string") {
        const safeUrl = validateAllowedBlobUrl(blobUrl);
        const resp = await fetch(safeUrl.toString());
        if (!resp.ok) {
          throw new AiServiceError(400, "BLOB_FETCH_FAILED", "Unable to fetch document from Blob storage.");
        }
        const mimeType = (resp.headers.get("content-type") || "application/pdf").split(";")[0].trim();
        if (!ALLOWED_DOC_MIMES.has(mimeType)) {
          throw new AiServiceError(400, "UNSUPPORTED_FILE_TYPE", `Unsupported document MIME type: ${mimeType}`);
        }
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.byteLength > 15 * 1024 * 1024) {
          throw new AiServiceError(413, "FILE_TOO_LARGE", "Document exceeds 15MB maximum analysis limit.");
        }
        inlinePart = { inlineData: { mimeType, data: buf.toString("base64") } };
      } else if (fileData?.data && fileData?.mimeType) {
        if (!ALLOWED_DOC_MIMES.has(fileData.mimeType)) {
          throw new AiServiceError(400, "UNSUPPORTED_FILE_TYPE", `Unsupported file type: ${fileData.mimeType}`);
        }
        if (typeof fileData.data !== "string" || fileData.data.length > 5_500_000) {
          throw new AiServiceError(413, "PAYLOAD_TOO_LARGE", "Document exceeds direct upload size limit (4MB).");
        }
        inlinePart = { inlineData: { mimeType: fileData.mimeType, data: fileData.data } };
      } else {
        res.status(400).json({ error: "Provide an uploaded document or storage URL to analyze.", code: "INVALID_INPUT" });
        return;
      }

      const langLabel = language === "sw" ? "SWAHILI" : "ENGLISH";
      const safeFocus = String(focusPrompt || "").trim().slice(0, 600);

      const prompt = `You are an expert academic analyst at TutorNode.
Analyze the attached document "${String(fileName).slice(0, 150)}" carefully for a ${studyLevel} learner.
PRIMARY REQUESTED ACTION: "${String(action).slice(0, 40)}"
${safeFocus ? `USER FOCUS INSTRUCTION: ${safeFocus}` : ""}
OUTPUT LANGUAGE: ${langLabel}

Strictly rely ONLY on what is present in the document. If a section is unclear or missing, say so honestly instead of guessing.
Produce JSON containing:
1. "title": Clear document title.
2. "summary": Executive summary (2-4 concise paragraphs).
3. "keyConcepts": Array of 5-8 core concepts or facts extracted ({ "heading", "detail" }).
4. "difficultSections": Array of 3-5 dense or technical sections explained simply ({ "section", "explanation", "analogy" }).
5. "studyNotesMarkdown": Clean, well-formatted Markdown study notes ready to read or export.
6. "revisionQuestions": Array of 4-6 practice/revision questions with brief model hints ({ "question", "hint", "keyPoints" }).`;

      const { response } = await generateWithGemini({
        contents: [inlinePart, { text: prompt }],
        thinkingLevel: "low",
        timeoutMs: 38000,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            keyConcepts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  heading: { type: Type.STRING },
                  detail: { type: Type.STRING },
                },
                required: ["heading", "detail"],
              },
            },
            difficultSections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  section: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  analogy: { type: Type.STRING },
                },
                required: ["section", "explanation"],
              },
            },
            studyNotesMarkdown: { type: Type.STRING },
            revisionQuestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  hint: { type: Type.STRING },
                  keyPoints: { type: Type.STRING },
                },
                required: ["question", "hint", "keyPoints"],
              },
            },
          },
          required: ["title", "summary", "keyConcepts", "difficultSections", "studyNotesMarkdown", "revisionQuestions"],
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      if (!parsed.summary || !parsed.studyNotesMarkdown) {
        throw new AiServiceError(502, "EMPTY_AI_RESPONSE", "AI document analysis returned incomplete output.");
      }

      res.json(parsed);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
