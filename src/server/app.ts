import express, { Request, Response, NextFunction } from "express";
import { AiServiceError, isAiConfigured } from "./aiClient.js";
import lessonRouter from "./routes/lesson.js";
import qaRouter from "./routes/qa.js";
import quizRouter from "./routes/quiz.js";
import syllabusRouter from "./routes/syllabus.js";
import documentRouter from "./routes/document.js";
import videoRouter from "./routes/video.js";
import adminRouter from "./routes/admin.js";

export function createApiApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  app.use(express.json({ limit: "6mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      platform: "TutorNode",
      runtime: process.env.VERCEL ? "vercel-serverless" : "local-express",
      aiConfigured: isAiConfigured(),
      blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api", lessonRouter);
  app.use("/api", qaRouter);
  app.use("/api", quizRouter);
  app.use("/api", syllabusRouter);
  app.use("/api", documentRouter);
  app.use("/api", videoRouter);
  app.use("/api", adminRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API endpoint not found.", code: "NOT_FOUND" });
  });

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    void next;
    if (res.headersSent) return;

    if (err instanceof AiServiceError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }

    const errObj = err as { type?: string; status?: number; message?: string };

    if (errObj?.type === "entity.too.large") {
      res.status(413).json({
        error: "Request payload is too large for serverless execution (max 4.5MB).",
        code: "PAYLOAD_TOO_LARGE",
      });
      return;
    }

    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: "Malformed JSON request body.", code: "BAD_JSON" });
      return;
    }

    console.error("[TutorNode API Error]", errObj?.message || err);
    res.status(errObj?.status || 500).json({
      error: "An unexpected server error occurred. Please try again.",
      code: "INTERNAL_ERROR",
    });
  });

  return app;
}

const app = createApiApp();
export default app;
