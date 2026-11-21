import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

export { Type, ThinkingLevel };

export const GEMINI_MODELS = {
  PRIMARY: "gemini-4-hydrogen",
  FAST: "gemini-3.1-flash-lite",
} as const;

export class AiServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AiServiceError";
    this.status = status;
    this.code = code;
  }
}

let cachedClient: GoogleGenAI | null = null;
let cachedKey: string | undefined;

export function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new AiServiceError(
      503,
      "MISSING_API_KEY",
      "Gemini AI service is not configured. Set GEMINI_API_KEY in server environment variables."
    );
  }
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    cachedKey = apiKey;
  }
  return cachedClient;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function classifyGeminiError(err: unknown): AiServiceError {
  if (err instanceof AiServiceError) return err;
  const msg = err instanceof Error ? err.message : String(err || "Unknown AI error");
  const upper = msg.toUpperCase();

  if (upper.includes("TIMED OUT") || upper.includes("TIMEOUT") || upper.includes("ABORT")) {
    return new AiServiceError(
      504,
      "AI_TIMEOUT",
      "The AI request took too long to respond. Please try a shorter prompt or retry."
    );
  }
  if (upper.includes("API_KEY_INVALID") || upper.includes("PERMISSION_DENIED") || msg.includes("403")) {
    return new AiServiceError(
      403,
      "AI_KEY_INVALID",
      "The configured Gemini API key was rejected or lacks permission. Please verify GEMINI_API_KEY in server settings."
    );
  }
  if (upper.includes("RESOURCE_EXHAUSTED") || msg.includes("429") || upper.includes("QUOTA")) {
    return new AiServiceError(
      429,
      "RATE_LIMITED",
      "Gemini API rate limit or quota was exceeded. Please wait briefly and try again."
    );
  }
  if (upper.includes("NOT_FOUND") || msg.includes("404")) {
    return new AiServiceError(
      502,
      "MODEL_UNAVAILABLE",
      "The requested Gemini model was unavailable upstream."
    );
  }
  return new AiServiceError(
    502,
    "AI_UPSTREAM_ERROR",
    "Unable to complete AI generation at the moment. Please retry."
  );
}

export interface GenerateOptions {
  contents: unknown;
  systemInstruction?: string;
  responseMimeType?: string;
  responseSchema?: unknown;
  thinkingLevel?: "low" | "medium" | "high";
  timeoutMs?: number;
  preferFast?: boolean;
}

export async function generateWithGemini(options: GenerateOptions) {
  const ai = getAiClient();
  const timeoutMs = options.timeoutMs ?? 28000;

  const modelChain = options.preferFast
    ? [GEMINI_MODELS.FAST, GEMINI_MODELS.PRIMARY]
    : [GEMINI_MODELS.PRIMARY, GEMINI_MODELS.FAST];

  const levelMap: Record<"low" | "medium" | "high", ThinkingLevel> = {
    low: ThinkingLevel.LOW,
    medium: ThinkingLevel.MEDIUM,
    high: ThinkingLevel.HIGH,
  };

  let lastErr: AiServiceError | null = null;

  for (const model of modelChain) {
    const maxAttempts = 2;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const config: Record<string, unknown> = {};
        if (options.systemInstruction) {
          config.systemInstruction = options.systemInstruction;
        }
        if (options.responseMimeType) {
          config.responseMimeType = options.responseMimeType;
        }
        if (options.responseSchema) {
          config.responseSchema = options.responseSchema;
        }

        if (model === GEMINI_MODELS.PRIMARY && options.thinkingLevel) {
          config.thinkingConfig = { thinkingLevel: levelMap[options.thinkingLevel] };
        } else if (model === GEMINI_MODELS.FAST) {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
        }

        const apiPromise = ai.models.generateContent({
          model,
          contents: options.contents as Parameters<typeof ai.models.generateContent>[0]["contents"],
          config: config as Parameters<typeof ai.models.generateContent>[0]["config"],
        });

        let timedOut = false;
        apiPromise.catch(() => {
          if (timedOut) {
            // Absorb late rejection after Promise.race timeout
          }
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            timedOut = true;
            reject(new AiServiceError(504, "AI_TIMEOUT", "Gemini generation timed out"));
          }, timeoutMs);
        });

        const response = await Promise.race([apiPromise, timeoutPromise]);
        return { response, model };
      } catch (err) {
        const classified = classifyGeminiError(err);
        lastErr = classified;

        // Do not retry non-transient auth errors
        if (classified.status === 403 || classified.code === "MISSING_API_KEY") {
          throw classified;
        }

        // Backoff briefly before retry on rate-limit or transient 5xx
        if (attempt === 0 && (classified.status === 429 || classified.status >= 500)) {
          await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
          continue;
        }
        break;
      }
    }
  }

  throw lastErr ?? new AiServiceError(502, "AI_UPSTREAM_ERROR", "AI generation failed.");
}
