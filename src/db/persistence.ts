import { getDb } from "./index.js";
import { createReviewRepository, hashCode } from "./reviewRepository.js";
import type { ReviewRecord } from "./reviewRepository.js";

// ─── Persistence facade ──────────────────────────────────────────────────────
//
// Handler calls this single function. Internally it:
//   1. Saves the review record
//   2. Logs usage data
//   3. Wraps both in a transaction (atomic)
//   4. Never throws — returns success/failure
// ─────────────────────────────────────────────────────────────────────────────

export interface PersistenceResult {
    ok: boolean;
    error?: string;
}

export function recordReview(record: ReviewRecord): PersistenceResult {
    try {
        const db = getDb();
        const repo = createReviewRepository(db);

        // Transaction: both writes succeed or both roll back
        db.transaction(() => {
            repo.saveReview(record);

            // Only log usage for successful reviews with token data
            if (
                record.status === "success" &&
                record.inputTokens != null &&
                record.outputTokens != null
            ) {
                repo.logUsage({
                    clientIp: record.clientIp,
                    inputTokens: record.inputTokens,
                    outputTokens: record.outputTokens,
                    durationMs: record.durationMs,
                });
            }
        });

        return { ok: true };
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Unknown persistence error";
        return { ok: false, error: message };
    }
}

export function getCachedReview(code: string, language?: string, level?: string): unknown | null {
    try {
        const db = getDb();
        const repo = createReviewRepository(db);
        const hash = hashCode(code, language, level);
        const record = repo.getSuccessfulReviewByHash(hash);
        if (record && record.result) {
            return JSON.parse(record.result);
        }
        return null;
    } catch {
        return null;
    }
}
