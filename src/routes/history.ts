import { Router, Request, Response } from "express";
import { getDb } from "../db/index.js";
import { createReviewRepository } from "../db/reviewRepository.js";

// ─── Client IP extraction ────────────────────────────────────────────────────

function getClientIp(req: Request): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
        return forwarded.split(",")[0].trim();
    }
    return req.socket.remoteAddress ?? "unknown";
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const historyRouter = Router();

// GET / — list all reviews for this client
historyRouter.get("/", (req: Request, res: Response): void => {
    const ip = getClientIp(req);
    const db = getDb();
    const repo = createReviewRepository(db);
    const rows = repo.getReviewsByClientIp(ip);

    // Parse result JSON strings back to objects
    const data = rows.map((r) => ({
        ...r,
        result: r.result ? JSON.parse(r.result) : null,
    }));

    res.status(200).json({ success: true, data });
});

// GET /:id — fetch a single review
historyRouter.get("/:id", (req: Request, res: Response): void => {
    const ip = getClientIp(req);
    const db = getDb();
    const repo = createReviewRepository(db);
    const reviewId = req.params.id as string;
    const row = repo.getReviewByIdAndIp(reviewId, ip);

    if (!row) {
        res.status(404).json({
            success: false,
            error: { code: "NOT_FOUND", message: "Review not found." },
        });
        return;
    }

    const data = {
        ...row,
        result: row.result ? JSON.parse(row.result) : null,
    };

    res.status(200).json({ success: true, data });
});

// DELETE /:id — delete a review
historyRouter.delete("/:id", (req: Request, res: Response): void => {
    const ip = getClientIp(req);
    const db = getDb();
    const repo = createReviewRepository(db);
    const reviewId = req.params.id as string;
    const deleted = repo.deleteReviewByIdAndIp(reviewId, ip);

    if (!deleted) {
        res.status(404).json({
            success: false,
            error: { code: "NOT_FOUND", message: "Review not found." },
        });
        return;
    }

    res.status(200).json({ success: true, message: "Review deleted." });
});
