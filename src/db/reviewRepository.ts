import { createHash } from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import { reviews, usageLogs } from "./schema.js";
import type { AppDatabase } from "./index.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReviewRecord {
    id: string;
    clientIp: string;
    code: string;            // raw code — hashed before storage, never persisted
    language?: string;
    level?: string;
    status: "success" | "error";
    errorCode?: string;
    result?: unknown;        // AIReviewResult — JSON.stringify before storage
    inputTokens?: number;
    outputTokens?: number;
    durationMs: number;
}

export interface UsageRecord {
    clientIp: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function hashCode(code: string, language?: string, level?: string): string {
    return createHash("sha256").update(`${code}|${language ?? ""}|${level ?? ""}`).digest("hex");
}

// ─── Repository ──────────────────────────────────────────────────────────────

export function createReviewRepository(db: AppDatabase) {
    return {
        saveReview(record: ReviewRecord): void {
            db.insert(reviews)
                .values({
                    id: record.id,
                    clientIp: record.clientIp,
                    codeHash: hashCode(record.code, record.language, record.level),
                    codeLength: record.code.length,
                    language: record.language ?? null,
                    status: record.status,
                    errorCode: record.errorCode ?? null,
                    result: record.result ? JSON.stringify(record.result) : null,
                    inputTokens: record.inputTokens ?? null,
                    outputTokens: record.outputTokens ?? null,
                    durationMs: record.durationMs,
                    createdAt: Date.now(),
                })
                .run();
        },

        logUsage(record: UsageRecord): void {
            db.insert(usageLogs)
                .values({
                    clientIp: record.clientIp,
                    inputTokens: record.inputTokens,
                    outputTokens: record.outputTokens,
                    durationMs: record.durationMs,
                    createdAt: Date.now(),
                })
                .run();
        },

        getReviewById(id: string) {
            return db
                .select()
                .from(reviews)
                .where(eq(reviews.id, id))
                .get() ?? null;
        },

        getSuccessfulReviewByHash(hash: string) {
            return db
                .select()
                .from(reviews)
                .where(and(eq(reviews.codeHash, hash), eq(reviews.status, "success")))
                .get() ?? null;
        },

        getReviewsByClientIp(ip: string) {
            return db
                .select({
                    id: reviews.id,
                    language: reviews.language,
                    status: reviews.status,
                    result: reviews.result,
                    durationMs: reviews.durationMs,
                    createdAt: reviews.createdAt,
                })
                .from(reviews)
                .where(eq(reviews.clientIp, ip))
                .orderBy(desc(reviews.createdAt))
                .all();
        },

        getReviewByIdAndIp(id: string, clientIp: string) {
            return db
                .select()
                .from(reviews)
                .where(and(eq(reviews.id, id), eq(reviews.clientIp, clientIp)))
                .get() ?? null;
        },

        deleteReviewByIdAndIp(id: string, clientIp: string): boolean {
            const existing = db
                .select({ id: reviews.id })
                .from(reviews)
                .where(and(eq(reviews.id, id), eq(reviews.clientIp, clientIp)))
                .get();
            if (!existing) return false;
            db.delete(reviews)
                .where(and(eq(reviews.id, id), eq(reviews.clientIp, clientIp)))
                .run();
            return true;
        },
    };
}

export type ReviewRepository = ReturnType<typeof createReviewRepository>;
