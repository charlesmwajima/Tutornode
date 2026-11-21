import type { Request, Response, NextFunction } from "express";
import { getApps, getApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import path from "path";

export const ADMIN_EMAIL = "charlesmwajima@gmail.com";

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

export interface AuthedRequest extends Request {
  authUser?: AuthenticatedUser;
}

function loadProjectId(): string {
  const candidates = [
    path.resolve(process.cwd(), "firebase-applet-config.json"),
    new URL("../../firebase-applet-config.json", import.meta.url).pathname,
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const parsed = JSON.parse(fs.readFileSync(candidate, "utf-8"));
        if (parsed?.projectId && parsed.projectId !== "remixed-project-id") {
          return parsed.projectId;
        }
      }
    } catch {
      // Ignore parse errors and try fallback
    }
  }
  return process.env.FIREBASE_PROJECT_ID || "bwai-pwani-charles";
}

function getFirebaseAdminAuth() {
  const projectId = loadProjectId();
  const app = getApps().length ? getApp() : initializeApp({ projectId });
  return getAuth(app);
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) {
      res.status(401).json({
        error: "Authentication required. Please sign in to access TutorNode AI services.",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    const token = match[1].trim();
    const adminAuth = getFirebaseAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);

    req.authUser = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: Boolean(decoded.email_verified),
    };
    next();
  } catch (err: unknown) {
    const authErr = err as { code?: string; message?: string };
    console.warn("[Auth] Token verification failed:", authErr?.code || authErr?.message || err);
    res.status(401).json({
      error: "Your session token is invalid or expired. Please sign in again.",
      code: "INVALID_TOKEN",
    });
  }
}

export async function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  await requireAuth(req, res, () => {
    if (
      !req.authUser ||
      req.authUser.email !== ADMIN_EMAIL ||
      !req.authUser.emailVerified
    ) {
      res.status(403).json({
        error: "Verified administrator privileges are required for this operation.",
        code: "ADMIN_REQUIRED",
      });
      return;
    }
    next();
  });
}

// Sliding-window in-memory rate limiter (best-effort per instance; prevents tight loops & bursts)
const rateBuckets = new Map<string, number[]>();

export function rateLimit(options: { windowMs: number; max: number; name: string }) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const identity = req.authUser?.uid || req.ip || "unknown";
    const key = `${options.name}:${identity}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;

    const existing = rateBuckets.get(key) || [];
    const recent = existing.filter((ts) => ts > cutoff);

    if (recent.length >= options.max) {
      res.status(429).json({
        error: "Too many requests in a short window. Please pause a few seconds and retry.",
        code: "RATE_LIMIT_EXCEEDED",
      });
      return;
    }

    recent.push(now);
    rateBuckets.set(key, recent);

    if (rateBuckets.size > 5000) {
      const oldestKey = rateBuckets.keys().next().value;
      if (oldestKey) rateBuckets.delete(oldestKey);
    }

    next();
  };
}

export function validateAllowedBlobUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid document storage URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS storage URLs are permitted.");
  }

  const host = parsed.hostname.toLowerCase();
  const isVercelBlob =
    host.endsWith(".public.blob.vercel-storage.com") ||
    host.endsWith(".blob.vercel-storage.com");

  if (!isVercelBlob) {
    throw new Error("Document URL must originate from authorized Vercel Blob storage.");
  }

  return parsed;
}
