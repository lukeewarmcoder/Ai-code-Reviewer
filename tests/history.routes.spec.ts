import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { sql } from "drizzle-orm";
import { createDatabase } from "../src/db/index.js";
import type { AppDatabase } from "../src/db/index.js";

// ─── In-memory DB setup ──────────────────────────────────────────────────────

let testDb: AppDatabase;

function initTestDb() {
    testDb = createDatabase(":memory:");
    testDb.run(sql`
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
    testDb.run(sql`
        CREATE TABLE IF NOT EXISTS usage_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_ip TEXT NOT NULL,
            input_tokens INTEGER NOT NULL,
            output_tokens INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        )
    `);
    testDb.run(sql`
        CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            key_hash TEXT NOT NULL,
            plan TEXT NOT NULL DEFAULT 'FREE',
            active INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL
        )
    `);
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { mockCreate, mockCheck } = vi.hoisted(() => ({
    mockCreate: vi.fn(),
    mockCheck: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
    default: class MockAnthropic {
        messages = { create: mockCreate };
        constructor() { }
    },
}));

vi.mock("../src/middleware/rateLimit.middleware.js", () => ({
    defaultLimiter: { check: mockCheck },
}));

vi.mock("../src/middleware/auth.middleware.js", () => ({
    requireApiKey: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../src/db/index.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../src/db/index.js")>();
    return {
        ...actual,
        getDb: () => testDb,
    };
});

process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

import { app } from "../src/index.js";
import { createReviewRepository } from "../src/db/reviewRepository.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seedReview(id: string, clientIp: string) {
    const repo = createReviewRepository(testDb);
    repo.saveReview({
        id,
        clientIp,
        code: "const x = 1;",
        language: "javascript",
        status: "success",
        result: { qualityScore: 100, bugs: [], complexity: { time: "O(1)", space: "O(1)", explanation: "trivial" }, cleanCode: [], security: [], optimization: [], improvedCode: "" },
        durationMs: 100,
    });
}

// ─── Reset ───────────────────────────────────────────────────────────────────

beforeEach(() => {
    initTestDb();
    mockCreate.mockReset();
    mockCheck.mockReset();
    mockCheck.mockReturnValue({ allowed: true, remaining: 4, retryAfterMs: 0 });
});

// ═════════════════════════════════════════════════════════════════════════════

describe("GET /api/history", () => {
    it("returns empty array when no reviews exist", async () => {
        const res = await request(app).get("/api/history");
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toEqual([]);
    });

    it("returns reviews for the requesting client IP", async () => {
        seedReview("hist-1", "::ffff:127.0.0.1");
        const res = await request(app).get("/api/history");
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].id).toBe("hist-1");
    });
});

describe("GET /api/history/:id", () => {
    it("returns 404 for non-existent review", async () => {
        const res = await request(app).get("/api/history/no-such-id");
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("returns the review when it belongs to the client", async () => {
        seedReview("hist-detail-1", "::ffff:127.0.0.1");
        const res = await request(app).get("/api/history/hist-detail-1");
        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe("hist-detail-1");
    });
});

describe("DELETE /api/history/:id", () => {
    it("returns 404 when review does not exist", async () => {
        const res = await request(app).delete("/api/history/no-such-id");
        expect(res.status).toBe(404);
    });

    it("deletes the review successfully", async () => {
        seedReview("hist-del-1", "::ffff:127.0.0.1");
        const res = await request(app).delete("/api/history/hist-del-1");
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const check = await request(app).get("/api/history/hist-del-1");
        expect(check.status).toBe(404);
    });
});
