import type { IncomingMessage, ServerResponse } from "http";
import type { Request, Response } from "express";
import app from "../server.ts";

export const config = {
  api: {
    bodyParser: false,
  },
};

type VercelCompatRequest = IncomingMessage & {
  originalUrl?: string;
  body?: unknown;
  _body?: boolean;
};

export function restoreOriginalApiUrl(rawUrl: string | undefined): string {
  if (!rawUrl) {
    return "/api";
  }

  const parsed = new URL(rawUrl, "http://localhost");
  const rewrittenPath = parsed.searchParams.get("__path");

  if (rewrittenPath !== null) {
    parsed.searchParams.delete("__path");
    const normalizedSubpath = rewrittenPath.replace(/^\/+/, "");
    const pathname = normalizedSubpath ? `/api/${normalizedSubpath}` : "/api";
    const remainingQuery = parsed.searchParams.toString();
    return remainingQuery ? `${pathname}?${remainingQuery}` : pathname;
  }

  return rawUrl;
}

export default function handler(req: VercelCompatRequest, res: ServerResponse) {
  const restoredUrl = restoreOriginalApiUrl(req.url);
  req.url = restoredUrl;
  if (typeof req.originalUrl === "string") {
    req.originalUrl = restoredUrl;
  }

  // If Vercel's runtime already consumed the stream and pre-parsed req.body,
  // mark _body so express.json() preserves it instead of re-reading an ended stream.
  if (req.body !== undefined && req.readableEnded) {
    req._body = true;
  }

  return app(req as unknown as Request, res as unknown as Response);
}
