import { Router } from "express";
import { AiServiceError, generateWithGemini, Type } from "../aiClient.js";
import { requireAuth, rateLimit, validateAllowedBlobUrl, AuthedRequest } from "../auth.js";
import {
  cleanSpeechDuplications,
  getExamRevisionPrompt,
  getStudyLevelDirective,
  getTrackFocusDirective,
  selectTeachingTechnique,
} from "../pedagogy.js";

const router = Router();

const ALLOWED_FILE_MIMES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

async function resolveFilePart(fileData: { data?: string; mimeType?: string } | null | undefined, blobUrl?: string) {
  if (blobUrl && typeof blobUrl === "string") {
    const safeUrl = validateAllowedBlobUrl(blobUrl);
    const resp = await fetch(safeUrl.toString());
    if (!resp.ok) {
      throw new AiServiceError(400, "BLOB_FETCH_FAILED", "Could not retrieve uploaded document from storage.");
    }
    const contentType = (resp.headers.get("content-type") || "application/pdf").split(";")[0].trim();
    if (!ALLOWED_FILE_MIMES.has(contentType)) {
      throw new AiServiceError(400, "UNSUPPORTED_FILE_TYPE", `Unsupported document MIME type: ${contentType}`);
    }
    const arrayBuffer = await resp.arrayBuffer();
    if (arrayBuffer.byteLength > 15 * 1024 * 1024) {
      throw new AiServiceError(413, "FILE_TOO_LARGE", "Document exceeds 15MB maximum analysis limit.");
    }
    return {
      inlineData: {
        mimeType: contentType,
        data: Buffer.from(arrayBuffer).toString("base64"),
      },
    };
  }

  if (fileData?.data && fileData?.mimeType) {
    if (!ALLOWED_FILE_MIMES.has(fileData.mimeType)) {
      throw new AiServiceError(400, "UNSUPPORTED_FILE_TYPE", `Unsupported file type: ${fileData.mimeType}`);
    }
    if (typeof fileData.data !== "string" || fileData.data.length > 5_500_000) {
      throw new AiServiceError(413, "PAYLOAD_TOO_LARGE", "Uploaded file exceeds serverless request limit. Use smaller file or Blob storage.");
    }
    return {
      inlineData: {
        mimeType: fileData.mimeType,
        data: fileData.data,
      },
    };
  }

  return null;
}

router.post(
  "/generate-lesson-synthesis",
  requireAuth,
  rateLimit({ name: "lesson-synthesis", windowMs: 60_000, max: 12 }),
  async (req: AuthedRequest, res, next) => {
    try {
      const {
        input,
        subject,
        topic,
        educationLevel,
        learningObjectives,
        preferredLength,
        additionalInstructions,
        language = "en",
        classTrack = "Business",
        studyLevel,
        intelLevel = "Standard",
        teacherName = "Mwalimu Bora",
        teacherAppearance = "an experienced academic instructor",
        fileData,
        blobUrl,
        isExamRevision = false,
        syllabusContext,
        classTargetDuration = 15,
        teachingTechniqueId,
      } = req.body || {};

      const effectiveTopic = String(topic || input || "").trim();
      if (!effectiveTopic || effectiveTopic.length > 1200) {
        res.status(400).json({ error: "Please provide a valid topic (1-1200 characters).", code: "INVALID_INPUT" });
        return;
      }

      const effectiveLevel = String(educationLevel || studyLevel || "Undergraduate");
      const lengthMap: Record<string, number> = {
        short: 4,
        standard: 6,
        deep: 8,
      };
      const targetSlides =
        lengthMap[String(preferredLength || "").toLowerCase()] ||
        Math.min(8, Math.max(4, Math.round(Number(classTargetDuration || 15) / 3)));

      const technique = selectTeachingTechnique(teachingTechniqueId);
      const parts: Array<Record<string, unknown>> = [];

      const resolvedFilePart = await resolveFilePart(fileData, blobUrl);
      if (resolvedFilePart) {
        parts.push(resolvedFilePart);
      }

      const langLabel = language === "sw" ? "SWAHILI" : "ENGLISH";
      let prompt = "";

      if (isExamRevision) {
        prompt = getExamRevisionPrompt({
          input: effectiveTopic,
          language,
          targetSlides,
          teacherName,
          studyLevel: effectiveLevel,
          classTrack,
          technique,
          additionalInstructions: typeof additionalInstructions === "string" ? additionalInstructions.slice(0, 800) : undefined,
        });
      } else {
        const subjectLine = subject ? `SUBJECT AREA: ${String(subject).slice(0, 160)}\n` : "";
        const objectivesLine = learningObjectives ? `TARGET LEARNING OBJECTIVES: ${String(learningObjectives).slice(0, 500)}\n` : "";
        const extraLine = additionalInstructions ? `ADDITIONAL INSTRUCTIONS: ${String(additionalInstructions).slice(0, 800)}\n` : "";
        const syllabusLine = syllabusContext
          ? `SYLLABUS CONTEXT: Course "${syllabusContext.syllabusTitle || ""}", Chapter "${syllabusContext.chapterTitle || ""}", Topic "${syllabusContext.topicTitle || ""}" — ${syllabusContext.topicDescription || ""}\n`
          : "";
        const fileDirective = resolvedFilePart
          ? "REFERENCE DOCUMENT ATTACHED: Ground the lesson directly in the attached material without fabricating facts outside it.\n"
          : "";

        prompt = `You are "${teacherName}", the lead instructor at TutorNode.
Create a complete, structured, high-clarity interactive lesson on: "${effectiveTopic}".
${subjectLine}${objectivesLine}${extraLine}${syllabusLine}${fileDirective}
OUTPUT LANGUAGE: ${langLabel}
TARGET SLIDES: ${targetSlides}
${getStudyLevelDirective(effectiveLevel)}
${getTrackFocusDirective(classTrack)}
${technique.promptDirective}

REQUIREMENTS:
1. Build exactly ${targetSlides} progressive teaching segments ("segments"):
   - "content": Clean Markdown whiteboard notes for that slide (headings, formulas with units, worked steps, bullet takeaways).
   - "speech": Natural, encouraging 2nd-person spoken explanation (140-220 words per slide) ending with a quick check-for-understanding question. Only Slide 1 introduces "${teacherName}" and TutorNode.
   - "diagram_svg_code": Valid, self-contained animated <svg viewBox="0 0 600 400" ...> schematic illustrating THAT slide's specific concept or mechanism (each slide must have its own relevant diagram).
   - "diagram_title": Concise diagram caption for that slide.
2. Also populate "structuredLesson" with clean academic sections:
   - "title", "introduction", "learningObjectives" (array), "coreExplanations" (array of headings/explanations), "workedExamples" (array), "keyDefinitions" (array of {term, definition}), "practiceActivities" (array), "summary", "revisionQuestions" (array).

Respond ONLY with valid JSON matching the schema.`;
      }

      parts.push({ text: prompt });

      const { response } = await generateWithGemini({
        contents: parts,
        thinkingLevel: intelLevel === "100% Omni-Intelligence" ? "medium" : "low",
        timeoutMs: 42000,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            segments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  content: { type: Type.STRING },
                  speech: { type: Type.STRING },
                  diagram_svg_code: { type: Type.STRING },
                  diagram_title: { type: Type.STRING },
                },
                required: ["content", "speech"],
              },
            },
            structuredLesson: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                introduction: { type: Type.STRING },
                learningObjectives: { type: Type.ARRAY, items: { type: Type.STRING } },
                coreExplanations: { type: Type.ARRAY, items: { type: Type.STRING } },
                workedExamples: { type: Type.ARRAY, items: { type: Type.STRING } },
                keyDefinitions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      term: { type: Type.STRING },
                      definition: { type: Type.STRING },
                    },
                    required: ["term", "definition"],
                  },
                },
                practiceActivities: { type: Type.ARRAY, items: { type: Type.STRING } },
                summary: { type: Type.STRING },
                revisionQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["title", "introduction", "learningObjectives", "coreExplanations", "summary", "revisionQuestions"],
            },
            visual_diagram_prompt: { type: Type.STRING },
            diagram_svg_code: { type: Type.STRING },
            video_scene: { type: Type.STRING },
            video_keyword: { type: Type.STRING },
            status: { type: Type.STRING },
          },
          required: ["segments", "structuredLesson", "visual_diagram_prompt", "diagram_svg_code", "video_scene", "video_keyword", "status"],
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      if (!Array.isArray(parsed.segments) || parsed.segments.length === 0) {
        throw new AiServiceError(502, "EMPTY_AI_RESPONSE", "AI returned an incomplete lesson structure. Please retry.");
      }

      parsed.segments = cleanSpeechDuplications(parsed.segments, language, teacherName, effectiveTopic);
      if (!parsed.diagram_svg_code && parsed.segments[0]?.diagram_svg_code) {
        parsed.diagram_svg_code = parsed.segments[0].diagram_svg_code;
      }
      parsed.video_scene =
        parsed.video_scene ||
        `Modern instructional presentation by ${teacherName} (${teacherAppearance}) explaining ${effectiveTopic} on a crisp interactive smartboard.`;

      res.json({
        ...parsed,
        teachingTechnique: {
          id: technique.id,
          name: technique.name,
          subtitle: technique.subtitle,
          icon: technique.icon,
          color: technique.color,
          badgeBg: technique.badgeBg,
          description: technique.description,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
