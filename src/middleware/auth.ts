import type { Request, Response, NextFunction } from "express";
import { getDb } from "../db/index.js";
import { createAuthRepository } from "../db/authRepository.js";

// ─── Auth middleware ─────────────────────────────────────────────────────────
//
// Extracts API key from:
//   Authorization: Bearer <key>
//
// Returns 401 if missing, malformed, or invalid.
// ─────────────────────────────────────────────────────────────────────────────

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Invalid API key." },
        });
        return;
    }

    const rawKey = authHeader.slice(7).trim();

    if (!rawKey) {
        res.status(401).json({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Invalid API key." },
        });
        return;
    }

    const db = getDb();
    const auth = createAuthRepository(db);

    if (!auth.validateApiKey(rawKey)) {
        res.status(401).json({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Invalid API key." },
        });
        return;
    }

    next();
}
