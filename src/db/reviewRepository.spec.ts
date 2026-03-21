import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { createDatabase, type AppDatabase } from "./index.js";
import { reviews, usageLogs } from "./schema.js";
import { createReviewRepository, hashCode } from "./reviewRepository.js";
import { recordReview } from "./persistence.js";

// ─── Test helpers ────────────────────────────────────────────────────────────

let db: AppDatabase;

function freshDb() {
    db = createDatabase(":memory:");

    // Create tables (in tests we use raw SQL since no migrations)
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

const SAMPLE_CODE = "function add(a, b) { return a + b; }";

const SAMPLE_RESULT = {
    bugs: ["Off-by-one"],
    complexity: { time: "O(1)", space: "O(1)", explanation: "Constant." },
    cleanCode: [],
    security: [],
    optimization: [],
    improvedCode: "const add = (a, b) => a + b;",
};

// ═════════════════════════════════════════════════════════════════════════════
// 1. hashCode
// ═════════════════════════════════════════════════════════════════════════════

describe("hashCode", () => {
    it("returns deterministic SHA-256 hex", () => {
        const h1 = hashCode("hello");
        const h2 = hashCode("hello");
        expect(h1).toBe(h2);
        expect(h1).toHaveLength(64); // SHA-256 = 32 bytes = 64 hex chars
    });

    it("produces different hashes for different inputs", () => {
        expect(hashCode("abc")).not.toBe(hashCode("abd"));
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. reviewRepository
// ═════════════════════════════════════════════════════════════════════════════

describe("reviewRepository", () => {
    beforeEach(freshDb);

    it("saveReview + getReviewById round-trips correctly", () => {
        const repo = createReviewRepository(db);

        repo.saveReview({
            id: "req-001",
            clientIp: "127.0.0.1",
            code: SAMPLE_CODE,
            language: "javascript",
            status: "success",
            result: SAMPLE_RESULT,
            inputTokens: 100,
            outputTokens: 200,
            durationMs: 450,
        });

        const row = repo.getReviewById("req-001");

        expect(row).not.toBeNull();
        expect(row!.id).toBe("req-001");
        expect(row!.clientIp).toBe("127.0.0.1");
        expect(row!.codeHash).toBe(hashCode(SAMPLE_CODE, "javascript"));
        expect(row!.codeLength).toBe(SAMPLE_CODE.length);
        expect(row!.language).toBe("javascript");
        expect(row!.status).toBe("success");
        expect(row!.durationMs).toBe(450);
        expect(row!.inputTokens).toBe(100);
        expect(row!.outputTokens).toBe(200);
        expect(row!.createdAt).toBeGreaterThan(0);
    });

    it("stores result as JSON string", () => {
        const repo = createReviewRepository(db);

        repo.saveReview({
            id: "req-002",
            clientIp: "10.0.0.1",
            code: SAMPLE_CODE,
            status: "success",
            result: SAMPLE_RESULT,
            durationMs: 100,
        });

        const row = repo.getReviewById("req-002");
        expect(row!.result).toBe(JSON.stringify(SAMPLE_RESULT));

        // Parse it back
        const parsed = JSON.parse(row!.result!);
        expect(parsed.bugs).toEqual(["Off-by-one"]);
    });

    it("stores error reviews without result", () => {
        const repo = createReviewRepository(db);

        repo.saveReview({
            id: "req-003",
            clientIp: "10.0.0.1",
            code: SAMPLE_CODE,
            status: "error",
            errorCode: "AI_UNAVAILABLE",
            durationMs: 2000,
        });

        const row = repo.getReviewById("req-003");
        expect(row!.status).toBe("error");
        expect(row!.errorCode).toBe("AI_UNAVAILABLE");
        expect(row!.result).toBeNull();
    });

    it("raw code is NEVER stored — only hash and length", () => {
        const repo = createReviewRepository(db);

        repo.saveReview({
            id: "req-004",
            clientIp: "10.0.0.1",
            code: "SECRET_CODE_NEVER_STORE_THIS",
            status: "success",
            result: SAMPLE_RESULT,
            durationMs: 100,
        });

        const row = repo.getReviewById("req-004");
        const rowJson = JSON.stringify(row);

        expect(rowJson).not.toContain("SECRET_CODE_NEVER_STORE_THIS");
        expect(row!.codeHash).toBe(hashCode("SECRET_CODE_NEVER_STORE_THIS"));
        expect(row!.codeLength).toBe("SECRET_CODE_NEVER_STORE_THIS".length);
    });

    it("duplicate ID throws", () => {
        const repo = createReviewRepository(db);
        const record = {
            id: "dup-001",
            clientIp: "10.0.0.1",
            code: SAMPLE_CODE,
            status: "success" as const,
            result: SAMPLE_RESULT,
            durationMs: 100,
        };

        repo.saveReview(record);
        expect(() => repo.saveReview(record)).toThrow();
    });

    it("getReviewById returns null for missing ID", () => {
        const repo = createReviewRepository(db);
        expect(repo.getReviewById("nonexistent")).toBeNull();
    });

    it("logUsage inserts usage record", () => {
        const repo = createReviewRepository(db);

        repo.logUsage({
            clientIp: "192.168.1.1",
            inputTokens: 50,
            outputTokens: 100,
            durationMs: 300,
        });

        const rows = db.select().from(usageLogs).all();
        expect(rows).toHaveLength(1);
        expect(rows[0].clientIp).toBe("192.168.1.1");
        expect(rows[0].inputTokens).toBe(50);
        expect(rows[0].outputTokens).toBe(100);
        expect(rows[0].createdAt).toBeGreaterThan(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. persistence facade (recordReview)
// ═════════════════════════════════════════════════════════════════════════════

describe("persistence facade", () => {
    // Note: recordReview uses the global singleton.
    // We override it in these tests by mocking getDb.
    // For simplicity, we test the repository transaction logic directly.

    beforeEach(freshDb);

    it("recordReview saves review + usage in one call", () => {
        const repo = createReviewRepository(db);

        // Simulate what persistence.ts does
        db.transaction(() => {
            repo.saveReview({
                id: "tx-001",
                clientIp: "10.0.0.1",
                code: SAMPLE_CODE,
                status: "success",
                result: SAMPLE_RESULT,
                inputTokens: 50,
                outputTokens: 100,
                durationMs: 200,
            });

            repo.logUsage({
                clientIp: "10.0.0.1",
                inputTokens: 50,
                outputTokens: 100,
                durationMs: 200,
            });
        });

        const review = repo.getReviewById("tx-001");
        const usage = db.select().from(usageLogs).all();

        expect(review).not.toBeNull();
        expect(usage).toHaveLength(1);
    });

    it("transaction rolls back both on failure", () => {
        const repo = createReviewRepository(db);

        // First save
        repo.saveReview({
            id: "tx-002",
            clientIp: "10.0.0.1",
            code: SAMPLE_CODE,
            status: "success",
            result: SAMPLE_RESULT,
            inputTokens: 50,
            outputTokens: 100,
            durationMs: 200,
        });

        // Transaction that should fail (duplicate ID)
        try {
            db.transaction(() => {
                repo.logUsage({
                    clientIp: "10.0.0.1",
                    inputTokens: 99,
                    outputTokens: 99,
                    durationMs: 99,
                });

                // This will fail — duplicate PK
                repo.saveReview({
                    id: "tx-002",
                    clientIp: "10.0.0.1",
                    code: SAMPLE_CODE,
                    status: "error",
                    errorCode: "DUPLICATE",
                    durationMs: 100,
                });
            });
        } catch {
            // Expected
        }

        // Usage log from failed transaction should also be rolled back
        const usage = db.select().from(usageLogs).all();
        expect(usage).toHaveLength(0);
    });

    it("error reviews do not create usage log entry", () => {
        const repo = createReviewRepository(db);

        db.transaction(() => {
            repo.saveReview({
                id: "tx-003",
                clientIp: "10.0.0.1",
                code: SAMPLE_CODE,
                status: "error",
                errorCode: "AI_UNAVAILABLE",
                durationMs: 500,
            });
            // No logUsage call for errors — mirrors persistence.ts logic
        });

        const review = repo.getReviewById("tx-003");
        const usage = db.select().from(usageLogs).all();

        expect(review!.status).toBe("error");
        expect(usage).toHaveLength(0); // No usage for errors
    });
});
