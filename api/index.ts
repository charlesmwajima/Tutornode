import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Request, Response } from "express";
import app from "../src/server/app.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as unknown as Request, res as unknown as Response);
}
