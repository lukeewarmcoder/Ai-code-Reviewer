import type { Request, Response, NextFunction } from "express";
import { getDb } from "../db/index.js";
import { createAuthRepository } from "../db/authRepository.js";

// ─── Auth middleware ─────────────────────────────────────────────────────────
//
// Extracts API key from:
//   Authorization: Bearer <key>
//
// On success: attaches key ID to req.headers["x-api-key-id"] for downstream use.
// On failure: returns 401.
// ─────────────────────────────────────────────────────────────────────────────

function unauthorized(res: Response): void {
    res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid API key." },
    });
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        unauthorized(res);
        return;
    }

    const rawKey = authHeader.slice(7).trim();

    if (!rawKey) {
        unauthorized(res);
        return;
    }

    // ─── Internal API Key Bypass (Next.js server-to-server) ──────────────
    if (process.env.INTERNAL_API_KEY && rawKey === process.env.INTERNAL_API_KEY) {
        req.headers["x-api-key-id"] = "internal-nextjs";
        req.headers["x-api-key-plan"] = (req.headers["x-override-plan"] as string) || "FREE";
        next();
        return;
    }
    // ───────────────────────────────────────────────────────────────────

    const db = getDb();
    const auth = createAuthRepository(db);
    const keyInfo = auth.validateApiKey(rawKey);

    if (!keyInfo) {
        unauthorized(res);
        return;
    }

    // Attach key identity for downstream use (rate limiting, logging)
    req.headers["x-api-key-id"] = keyInfo.id;
    req.headers["x-api-key-plan"] = keyInfo.plan;

    next();
}
