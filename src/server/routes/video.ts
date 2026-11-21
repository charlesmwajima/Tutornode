import { Router } from "express";
import { AiServiceError, generateWithGemini, Type } from "../aiClient.js";
import { requireAuth, rateLimit, AuthedRequest } from "../auth.js";

const router = Router();

function formatVttTimestamp(totalSec: number): string {
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = Math.floor(totalSec % 60);
  const ms = Math.round((totalSec - Math.floor(totalSec)) * 1000);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
}

function buildStoryboardFromSegments(
  segments: Array<{ content: string; speech: string; diagram_title?: string }>,
  topic: string
) {
  let cursor = 0;
  const scenes = segments.map((seg, index) => {
    const cleanSpeech = String(seg.speech || seg.content || "").replace(/\s+/g, " ").trim();
    const wordCount = Math.max(12, cleanSpeech.split(" ").filter(Boolean).length);
    const durationSec = Math.min(45, Math.max(8, Math.round((wordCount / 145) * 60)));
    const startSec = cursor;
    cursor += durationSec;

    return {
      index,
      title: seg.diagram_title || `Slide ${index + 1}`,
      boardMarkdown: String(seg.content || ""),
      narration: cleanSpeech,
      startSec,
      endSec: cursor,
      durationSec,
    };
  });

  const vttLines = ["WEBVTT", ""];
  scenes.forEach((s, idx) => {
    vttLines.push(String(idx + 1));
    vttLines.push(`${formatVttTimestamp(s.startSec)} --> ${formatVttTimestamp(s.endSec)}`);
    vttLines.push(s.narration.slice(0, 260));
    vttLines.push("");
  });

  return {
    topic,
    totalDurationSec: cursor,
    scenes,
    webvtt: vttLines.join("\n"),
  };
}

// Vercel-compatible video synthesis: builds a synchronized visual storyboard & WebVTT track
// that the browser VideoSmartboard renders and exports as WebM via Canvas + MediaRecorder.
// Avoids native ffmpeg/canvas binaries and ephemeral local disk storage.
router.post(
  "/generate-lesson",
  requireAuth,
  rateLimit({ name: "video-storyboard", windowMs: 60_000, max: 10 }),
  async (req: AuthedRequest, res, next) => {
    try {
      const { lessonSegments = [], topic = "TutorNode Lesson", language = "en", teacherName = "Mwalimu Bora" } = req.body || {};

      if (!Array.isArray(lessonSegments) || lessonSegments.length === 0) {
        res.status(400).json({ error: "Lesson segments are required to build a video presentation.", code: "INVALID_INPUT" });
        return;
      }

      const limited = lessonSegments.slice(0, 8);
      const storyboard = buildStoryboardFromSegments(limited, String(topic).slice(0, 200));

      // Optionally enrich visual cue headlines via Gemini when configured
      try {
        const { response } = await generateWithGemini({
          contents: `Create concise 1-line visual camera/animation cues for ${limited.length} educational slides on "${topic}" taught by ${teacherName} in ${language === "sw" ? "Swahili" : "English"}. Slide summaries: ${limited
            .map((s: { content?: string }, i: number) => `${i + 1}: ${String(s.content || "").slice(0, 180)}`)
            .join(" | ")}`,
          preferFast: true,
          timeoutMs: 12000,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              cues: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["cues"],
          },
        });
        const parsed = JSON.parse(response.text || "{}");
        if (Array.isArray(parsed.cues)) {
          storyboard.scenes = storyboard.scenes.map((sc, i) => ({
            ...sc,
            visualCue: parsed.cues[i] || `Focus on ${sc.title}`,
          }));
        }
      } catch {
        // Non-fatal: storyboard narration & captions are already complete from lesson segments
      }

      res.json({
        mode: "client-canvas-storyboard",
        status: "completed",
        blobStorageConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
        storyboard,
        notice:
          "Storyboard prepared for live Smartboard playback and local WebM recording in your browser (Vercel serverless runtime does not use local ffmpeg binaries).",
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/generate-video",
  requireAuth,
  rateLimit({ name: "generate-video", windowMs: 60_000, max: 10 }),
  async (req: AuthedRequest, res, next) => {
    try {
      const { prompt } = req.body || {};
      const cleanPrompt = String(prompt || "").trim();
      if (!cleanPrompt) {
        res.status(400).json({ error: "A visual topic or prompt is required.", code: "INVALID_INPUT" });
        return;
      }
      throw new AiServiceError(
        501,
        "VEO_BILLING_REQUIRED",
        "Standalone cloud Veo MP4 generation requires a paid Veo-enabled Gemini key and Vercel Blob storage. Use the Smartboard Video Storyboard & WebM Recorder inside the lesson workspace instead."
      );
    } catch (err) {
      next(err);
    }
  }
);

router.post("/video-job-status", requireAuth, async (_req, res) => {
  res.status(410).json({
    error: "In-memory server video job polling has been retired for Vercel serverless compatibility. Video storyboards are returned synchronously and tracked in Firestore.",
    code: "SERVERLESS_SYNC_MODE",
  });
});

export default router;
