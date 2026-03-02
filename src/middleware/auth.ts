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

    const db = getDb();
    const auth = createAuthRepository(db);
    const keyId = auth.validateApiKey(rawKey);

    if (!keyId) {
        unauthorized(res);
        return;
    }

    // Attach key ID for downstream use (rate limiting, logging)
    req.headers["x-api-key-id"] = keyId;

    next();
}
