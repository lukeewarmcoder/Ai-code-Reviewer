import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { createDatabase, type AppDatabase } from "../src/db/index.js";
import { reviews } from "../src/db/schema.js";
import { createAnalyticsRepository } from "../src/db/analyticsRepository.js";
import { hashCode } from "../src/db/reviewRepository.js";

// ─── Test helpers ────────────────────────────────────────────────────────────

let db: AppDatabase;

function freshDb() {
    db = createDatabase(":memory:");

    db.run(sql`
        CREATE TABLE IF NOT EXISTS reviews (
            id TEXT PRIMARY KEY,
            client_ip TEXT NOT NULL,
            code_hash TEXT NOT NULL,
            code_length INTEGER NOT NULL,
            language TEXT,
            status TEXT NOT NULL,
            error_code TEXT,
            result TEXT,
            input_tokens INTEGER,
            output_tokens INTEGER,
            duration_ms INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        )
    `);

    db.run(sql`
        CREATE TABLE IF NOT EXISTS usage_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_ip TEXT NOT NULL,
            input_tokens INTEGER NOT NULL,
            output_tokens INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        )
    `);
}

let idCounter = 0;

function seedReview(
    overrides: Partial<{
        id: string;
        status: "success" | "error";
        errorCode: string | null;
        inputTokens: number | null;
        outputTokens: number | null;
        durationMs: number;
    }> = {}
) {
    idCounter++;

    const inputTokens = "inputTokens" in overrides
        ? overrides.inputTokens ?? null
        : 100;

    const outputTokens = "outputTokens" in overrides
        ? overrides.outputTokens ?? null
        : 200;

    db.insert(reviews)
        .values({
            id: overrides.id ?? `seed-${idCounter}`,
            clientIp: "10.0.0.1",
            codeHash: hashCode("test-code"),
            codeLength: 9,
            language: "javascript",
            status: overrides.status ?? "success",
            errorCode: overrides.errorCode ?? null,
            result: overrides.status === "error" ? null : '{"bugs":[]}',
            inputTokens,
            outputTokens,
            durationMs: overrides.durationMs ?? 500,
            createdAt: Date.now(),
        })
        .run();
}

// ═════════════════════════════════════════════════════════════════════════════
// getSystemStats
// ═════════════════════════════════════════════════════════════════════════════

describe("getSystemStats", () => {
    beforeEach(() => {
        idCounter = 0;
        freshDb();
    });

    it("returns all zeroes on empty database", () => {
        const analytics = createAnalyticsRepository(db);
        const stats = analytics.getSystemStats();

        expect(stats.totalReviews).toBe(0);
        expect(stats.successRate).toBe(0);
        expect(stats.avgDurationMs).toBe(0);
        expect(stats.totalInputTokens).toBe(0);
        expect(stats.totalOutputTokens).toBe(0);
    });

    it("counts total reviews correctly", () => {
        const analytics = createAnalyticsRepository(db);

        seedReview();
        seedReview();
        seedReview();

        const stats = analytics.getSystemStats();
        expect(stats.totalReviews).toBe(3);
    });

    it("successRate = 1.0 when all reviews succeed", () => {
        const analytics = createAnalyticsRepository(db);

        seedReview({ status: "success" });
        seedReview({ status: "success" });
        seedReview({ status: "success" });

        const stats = analytics.getSystemStats();
        expect(stats.successRate).toBe(1);
    });

    it("successRate = 0 when all reviews fail", () => {
        const analytics = createAnalyticsRepository(db);

        seedReview({ status: "error", errorCode: "AI_UNAVAILABLE" });
        seedReview({ status: "error", errorCode: "AI_MALFORMED_RESPONSE" });

        const stats = analytics.getSystemStats();
        expect(stats.successRate).toBe(0);
    });

    it("successRate = success / total for mixed results", () => {
        const analytics = createAnalyticsRepository(db);

        seedReview({ status: "success" });
        seedReview({ status: "success" });
        seedReview({ status: "error", errorCode: "AI_UNAVAILABLE" });

        const stats = analytics.getSystemStats();
        // 2 / 3 ≈ 0.6667
        expect(stats.successRate).toBeCloseTo(2 / 3, 4);
    });

    it("avgDurationMs is floor-rounded to integer", () => {
        const analytics = createAnalyticsRepository(db);

        seedReview({ durationMs: 100 });
        seedReview({ durationMs: 200 });
        seedReview({ durationMs: 201 });

        // avg = (100 + 200 + 201) / 3 = 167
        const stats = analytics.getSystemStats();
        expect(stats.avgDurationMs).toBe(167);
        expect(Number.isInteger(stats.avgDurationMs)).toBe(true);
    });

    it("avgDurationMs rounds down fractional averages", () => {
        const analytics = createAnalyticsRepository(db);

        seedReview({ durationMs: 10 });
        seedReview({ durationMs: 11 });
        seedReview({ durationMs: 11 });

        // avg = (10 + 11 + 11) / 3 = 10.666... → floor = 10
        const stats = analytics.getSystemStats();
        expect(stats.avgDurationMs).toBe(10);
    });

    it("sums input and output tokens correctly", () => {
        const analytics = createAnalyticsRepository(db);

        seedReview({ inputTokens: 100, outputTokens: 200 });
        seedReview({ inputTokens: 300, outputTokens: 400 });
        seedReview({ inputTokens: 50, outputTokens: 75 });

        const stats = analytics.getSystemStats();
        expect(stats.totalInputTokens).toBe(450);
        expect(stats.totalOutputTokens).toBe(675);
    });

    it("treats null tokens as 0 in aggregation", () => {
        const analytics = createAnalyticsRepository(db);

        seedReview({ inputTokens: 100, outputTokens: 200 });
        seedReview({
            status: "error",
            errorCode: "AI_UNAVAILABLE",
            inputTokens: null,
            outputTokens: null,
        });

        const stats = analytics.getSystemStats();
        expect(stats.totalInputTokens).toBe(100);
        expect(stats.totalOutputTokens).toBe(200);
    });

    it("handles large token values without overflow", () => {
        const analytics = createAnalyticsRepository(db);

        const largeTokens = 2_000_000_000;
        seedReview({ inputTokens: largeTokens, outputTokens: largeTokens });
        seedReview({ inputTokens: largeTokens, outputTokens: largeTokens });

        const stats = analytics.getSystemStats();
        expect(stats.totalInputTokens).toBe(largeTokens * 2);
        expect(stats.totalOutputTokens).toBe(largeTokens * 2);
    });

    it("single review returns itself as the average", () => {
        const analytics = createAnalyticsRepository(db);

        seedReview({ durationMs: 999, inputTokens: 42, outputTokens: 84 });

        const stats = analytics.getSystemStats();
        expect(stats.totalReviews).toBe(1);
        expect(stats.successRate).toBe(1);
        expect(stats.avgDurationMs).toBe(999);
        expect(stats.totalInputTokens).toBe(42);
        expect(stats.totalOutputTokens).toBe(84);
    });
});
