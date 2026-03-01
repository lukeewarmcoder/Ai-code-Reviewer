import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── Hoisted mocks (available before vi.mock factories) ──────────────────────

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

vi.mock("../rateLimit.js", () => ({
    defaultLimiter: { check: mockCheck },
}));

// Set API key for the AI engine
process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

import { app } from "../server.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_RESULT = {
    bugs: ["Off-by-one error"],
    complexity: { time: "O(n)", space: "O(1)", explanation: "Linear scan." },
    cleanCode: ["Use const instead of let"],
    security: [],
    optimization: ["Use Math.max spread"],
    improvedCode: "function findMax(arr) { return Math.max(...arr); }",
};

const VALID_JSON = JSON.stringify(VALID_RESULT);

function makeClaudeResponse(text: string) {
    return {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-4-20250514",
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 200 },
    };
}

// ─── Reset mocks ─────────────────────────────────────────────────────────────

beforeEach(() => {
    mockCreate.mockReset();
    mockCheck.mockReset();
    // Default: rate limiter allows
    mockCheck.mockReturnValue({ allowed: true, remaining: 4, retryAfterMs: 0 });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. METHOD GUARD
// ═════════════════════════════════════════════════════════════════════════════

describe("Method guard", () => {
    it("returns 405 for GET /api/review", async () => {
        const res = await request(app).get("/api/review");
        expect(res.status).toBe(405);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe("METHOD_NOT_ALLOWED");
    });

    it("returns 405 for PUT /api/review", async () => {
        const res = await request(app).put("/api/review");
        expect(res.status).toBe(405);
    });

    it("returns 405 for DELETE /api/review", async () => {
        const res = await request(app).delete("/api/review");
        expect(res.status).toBe(405);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. INPUT VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

describe("Input validation", () => {
    it("returns 400 for missing code field", async () => {
        const res = await request(app)
            .post("/api/review")
            .send({ language: "javascript" });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("INVALID_INPUT");
        expect(res.body.error.message).toContain("code");
    });

    it("returns 400 for empty code", async () => {
        const res = await request(app)
            .post("/api/review")
            .send({ code: "" });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("INVALID_INPUT");
    });

    it("returns 400 for oversized code", async () => {
        const res = await request(app)
            .post("/api/review")
            .send({ code: "x".repeat(50_001) });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("INVALID_INPUT");
        expect(res.body.error.message).toContain("50000");
    });

    it("returns 400 for non-string code", async () => {
        const res = await request(app)
            .post("/api/review")
            .send({ code: 12345 });

        expect(res.status).toBe(400);
    });

    it("accepts valid input with language", async () => {
        mockCreate.mockResolvedValueOnce(makeClaudeResponse(VALID_JSON));

        const res = await request(app)
            .post("/api/review")
            .send({ code: "const x = 1;", language: "javascript" });

        expect(res.status).toBe(200);
    });

    it("accepts valid input without language", async () => {
        mockCreate.mockResolvedValueOnce(makeClaudeResponse(VALID_JSON));

        const res = await request(app)
            .post("/api/review")
            .send({ code: "const x = 1;" });

        expect(res.status).toBe(200);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. RATE LIMITING
// ═════════════════════════════════════════════════════════════════════════════

describe("Rate limiting", () => {
    it("returns 429 when rate limit exceeded", async () => {
        mockCheck.mockReturnValue({
            allowed: false,
            remaining: 0,
            retryAfterMs: 60_000,
        });

        const res = await request(app)
            .post("/api/review")
            .send({ code: "const x = 1;" });

        expect(res.status).toBe(429);
        expect(res.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("includes Retry-After header on 429", async () => {
        mockCheck.mockReturnValue({
            allowed: false,
            remaining: 0,
            retryAfterMs: 60_000,
        });

        const res = await request(app)
            .post("/api/review")
            .send({ code: "const x = 1;" });

        expect(res.headers["retry-after"]).toBe("60");
    });

    it("includes X-RateLimit-Remaining header on success", async () => {
        mockCheck.mockReturnValue({ allowed: true, remaining: 3, retryAfterMs: 0 });
        mockCreate.mockResolvedValueOnce(makeClaudeResponse(VALID_JSON));

        const res = await request(app)
            .post("/api/review")
            .send({ code: "const x = 1;" });

        expect(res.headers["x-ratelimit-remaining"]).toBe("3");
    });

    it("does NOT call AI engine when rate limited", async () => {
        mockCheck.mockReturnValue({
            allowed: false,
            remaining: 0,
            retryAfterMs: 10_000,
        });

        await request(app)
            .post("/api/review")
            .send({ code: "const x = 1;" });

        expect(mockCreate).not.toHaveBeenCalled();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. HAPPY PATH
// ═════════════════════════════════════════════════════════════════════════════

describe("Happy path", () => {
    it("returns 200 with AIReviewResult on success", async () => {
        mockCreate.mockResolvedValueOnce(makeClaudeResponse(VALID_JSON));

        const res = await request(app)
            .post("/api/review")
            .send({ code: "function add(a, b) { return a + b; }" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toEqual(VALID_RESULT);
    });

    it("response has correct Content-Type", async () => {
        mockCreate.mockResolvedValueOnce(makeClaudeResponse(VALID_JSON));

        const res = await request(app)
            .post("/api/review")
            .send({ code: "const x = 1;" });

        expect(res.headers["content-type"]).toMatch(/application\/json/);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. AI ERROR HANDLING
// ═════════════════════════════════════════════════════════════════════════════

describe("AI error handling", () => {
    it("returns 502 with AI_UNAVAILABLE on API_ERROR", async () => {
        mockCreate.mockRejectedValueOnce(new Error("Connection refused"));

        const res = await request(app)
            .post("/api/review")
            .send({ code: "const x = 1;" });

        expect(res.status).toBe(502);
        expect(res.body.error.code).toBe("AI_UNAVAILABLE");
    });

    it("returns 502 with AI_MALFORMED_RESPONSE on malformed AI output", async () => {
        const bad = "not json at all";
        mockCreate
            .mockResolvedValueOnce(makeClaudeResponse(bad))
            .mockResolvedValueOnce(makeClaudeResponse(bad));

        const res = await request(app)
            .post("/api/review")
            .send({ code: "const x = 1;" });

        expect(res.status).toBe(502);
        expect(res.body.error.code).toBe("AI_MALFORMED_RESPONSE");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. NO RAW LEAKAGE
// ═════════════════════════════════════════════════════════════════════════════

describe("No raw leakage", () => {
    it("response body never contains 'raw' field on AI error", async () => {
        mockCreate.mockRejectedValueOnce(new Error("timeout"));

        const res = await request(app)
            .post("/api/review")
            .send({ code: "const x = 1;" });

        const body = JSON.stringify(res.body);
        expect(body).not.toContain('"raw"');
    });

    it("response body never contains system prompt content", async () => {
        mockCreate.mockRejectedValueOnce(new Error("timeout"));

        const res = await request(app)
            .post("/api/review")
            .send({ code: "const x = 1;" });

        const body = JSON.stringify(res.body);
        expect(body).not.toContain("Senior Software Engineer");
        expect(body).not.toContain("STRICT PROHIBITIONS");
    });

    it("success response contains only data wrapper, never raw", async () => {
        mockCreate.mockResolvedValueOnce(makeClaudeResponse(VALID_JSON));

        const res = await request(app)
            .post("/api/review")
            .send({ code: "const x = 1;" });

        expect(res.body).toHaveProperty("success", true);
        expect(res.body).toHaveProperty("data");
        expect(res.body).not.toHaveProperty("raw");
        expect(res.body.data).not.toHaveProperty("raw");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. SECURITY HEADERS
// ═════════════════════════════════════════════════════════════════════════════

describe("Security headers", () => {
    it("sets X-Content-Type-Options: nosniff", async () => {
        const res = await request(app).get("/health");
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("sets X-Frame-Options: DENY", async () => {
        const res = await request(app).get("/health");
        expect(res.headers["x-frame-options"]).toBe("DENY");
    });

    it("sets Strict-Transport-Security", async () => {
        const res = await request(app).get("/health");
        expect(res.headers["strict-transport-security"]).toContain("max-age=");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. HEALTH CHECK / 404
// ═════════════════════════════════════════════════════════════════════════════

describe("Health check and 404", () => {
    it("GET /health returns 200 ok", async () => {
        const res = await request(app).get("/health");
        expect(res.status).toBe(200);
        expect(res.body.status).toBe("ok");
    });

    it("unknown routes return 404", async () => {
        const res = await request(app).get("/api/unknown");
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe("NOT_FOUND");
    });
});
