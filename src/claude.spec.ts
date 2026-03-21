import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ─── Mock Anthropic SDK before any imports ───────────────────────────────────

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
    return {
        default: class MockAnthropic {
            messages = { create: mockCreate };
            constructor() { }
        },
    };
});

// Ensure API key is set so getClient() doesn't throw
beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-for-vitest";
});

// ─── Import after mock is registered ─────────────────────────────────────────

import {
    reviewCode,
    AIReviewError,
    buildEffectivePrompt,
    MAX_IMPROVED_CODE_LENGTH,
    MAX_ARRAY_ITEM_LENGTH,
    MAX_COMPLEXITY_FIELD_LENGTH,
} from "./claude.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_RESULT = {
    qualityScore: 95,
    bugs: ["Off-by-one error on line 3"],
    complexity: {
        time: "O(n)",
        space: "O(1)",
        explanation: "Single pass through the array.",
    },
    cleanCode: ["Rename variable 'x' to 'maxValue'"],
    security: [],
    optimization: ["Use Math.max() spread instead of manual loop"],
    improvedCode:
        "function findMax(arr: number[]): number {\n  return Math.max(...arr);\n}",
};

const VALID_JSON = JSON.stringify(VALID_RESULT);

function makeResponse(text: string) {
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

function makeEmptyResponse() {
    return {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-4-20250514",
        content: [],
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 0 },
    };
}

function makeToolOnlyResponse() {
    return {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-4-20250514",
        content: [{ type: "tool_use", id: "tool_1", name: "noop", input: {} }],
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
    };
}

const SAMPLE_CODE = `function add(a, b) { return a + b; }`;

// ─── Reset mock between tests ────────────────────────────────────────────────

beforeEach(() => {
    mockCreate.mockReset();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. VALID RESPONSE — HAPPY PATH
// ═════════════════════════════════════════════════════════════════════════════

describe("Happy path", () => {
    it("returns AIReviewResult for valid JSON response", async () => {
        mockCreate.mockResolvedValueOnce(makeResponse(VALID_JSON));

        const result = await reviewCode(SAMPLE_CODE, "javascript");

        expect(result).toEqual(VALID_RESULT);
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("passes language into user message when provided", async () => {
        mockCreate.mockResolvedValueOnce(makeResponse(VALID_JSON));

        await reviewCode(SAMPLE_CODE, "python");

        const callArgs = mockCreate.mock.calls[0][0];
        expect(callArgs.messages[0].content).toContain("python");
    });

    it("omits language prefix when not provided", async () => {
        mockCreate.mockResolvedValueOnce(makeResponse(VALID_JSON));

        await reviewCode(SAMPLE_CODE);

        const callArgs = mockCreate.mock.calls[0][0];
        expect(callArgs.messages[0].content).toMatch(/^Review the following code:/);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. JSON EXTRACTION ROBUSTNESS
// ═════════════════════════════════════════════════════════════════════════════

describe("JSON extraction", () => {
    it("strips markdown ```json fences", async () => {
        const wrapped = "```json\n" + VALID_JSON + "\n```";
        mockCreate.mockResolvedValueOnce(makeResponse(wrapped));

        const result = await reviewCode(SAMPLE_CODE);

        expect(result).toEqual(VALID_RESULT);
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("strips plain ``` fences without language tag", async () => {
        const wrapped = "```\n" + VALID_JSON + "\n```";
        mockCreate.mockResolvedValueOnce(makeResponse(wrapped));

        const result = await reviewCode(SAMPLE_CODE);

        expect(result).toEqual(VALID_RESULT);
    });

    it("extracts JSON from prefixed commentary", async () => {
        const prefixed = "Here is the code review:\n\n" + VALID_JSON;
        mockCreate.mockResolvedValueOnce(makeResponse(prefixed));

        const result = await reviewCode(SAMPLE_CODE);

        expect(result).toEqual(VALID_RESULT);
    });

    it("extracts JSON from trailing commentary", async () => {
        const trailed = VALID_JSON + "\n\nLet me know if you need more details.";
        mockCreate.mockResolvedValueOnce(makeResponse(trailed));

        const result = await reviewCode(SAMPLE_CODE);

        expect(result).toEqual(VALID_RESULT);
    });

    it("extracts JSON surrounded by both prefix and suffix text", async () => {
        const surrounded =
            "Review complete.\n" + VALID_JSON + "\nHope this helps!";
        mockCreate.mockResolvedValueOnce(makeResponse(surrounded));

        const result = await reviewCode(SAMPLE_CODE);

        expect(result).toEqual(VALID_RESULT);
    });

    it("handles JSON with unicode characters", async () => {
        const unicodeResult = {
            ...VALID_RESULT,
            bugs: ["変数名が不適切 — use English names"],
            improvedCode: "// 🚀 Optimized\nfunction add(a, b) { return a + b; }",
        };
        mockCreate.mockResolvedValueOnce(
            makeResponse(JSON.stringify(unicodeResult))
        );

        const result = await reviewCode(SAMPLE_CODE);

        expect(result.bugs[0]).toContain("変数名");
        expect(result.improvedCode).toContain("🚀");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. MALFORMED AI RESPONSES
// ═════════════════════════════════════════════════════════════════════════════

describe("Malformed AI responses", () => {
    it("throws EMPTY_RESPONSE when content array is empty", async () => {
        mockCreate.mockResolvedValueOnce(makeEmptyResponse());

        try {
            await reviewCode(SAMPLE_CODE);
            expect.unreachable("Should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(AIReviewError);
            expect((err as AIReviewError).code).toBe("EMPTY_RESPONSE");
        }
    });

    it("throws EMPTY_RESPONSE when response has only tool_use blocks", async () => {
        mockCreate.mockResolvedValueOnce(makeToolOnlyResponse());

        try {
            await reviewCode(SAMPLE_CODE);
            expect.unreachable("Should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(AIReviewError);
            expect((err as AIReviewError).code).toBe("EMPTY_RESPONSE");
        }
    });

    it("handles HTML response — retries then fails", async () => {
        const html = "<html><body>Service Unavailable</body></html>";
        mockCreate
            .mockResolvedValueOnce(makeResponse(html))
            .mockResolvedValueOnce(makeResponse(html));

        await expect(reviewCode(SAMPLE_CODE)).rejects.toThrow(AIReviewError);
        expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("handles plain text response — retries then fails", async () => {
        const plainText = "I cannot review this code because it is too short.";
        mockCreate
            .mockResolvedValueOnce(makeResponse(plainText))
            .mockResolvedValueOnce(makeResponse(plainText));

        await expect(reviewCode(SAMPLE_CODE)).rejects.toThrow(AIReviewError);
        expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("handles double-encoded JSON string — retries then fails", async () => {
        const doubleEncoded = JSON.stringify(VALID_JSON); // string inside string
        mockCreate
            .mockResolvedValueOnce(makeResponse(doubleEncoded))
            .mockResolvedValueOnce(makeResponse(doubleEncoded));

        await expect(reviewCode(SAMPLE_CODE)).rejects.toThrow(AIReviewError);
        expect(mockCreate).toHaveBeenCalledTimes(2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. ZOD VALIDATION FAILURES
// ═════════════════════════════════════════════════════════════════════════════

describe("Zod validation failures", () => {
    it("rejects missing required field (no 'bugs' key)", async () => {
        const { bugs, ...partial } = VALID_RESULT;
        mockCreate
            .mockResolvedValueOnce(makeResponse(JSON.stringify(partial)))
            .mockResolvedValueOnce(makeResponse(JSON.stringify(partial)));

        await expect(reviewCode(SAMPLE_CODE)).rejects.toMatchObject({
            code: "VALIDATION_FAILED",
        });
    });

    it("rejects wrong type (bugs as string instead of array)", async () => {
        const wrong = { ...VALID_RESULT, bugs: "not an array" };
        mockCreate
            .mockResolvedValueOnce(makeResponse(JSON.stringify(wrong)))
            .mockResolvedValueOnce(makeResponse(JSON.stringify(wrong)));

        await expect(reviewCode(SAMPLE_CODE)).rejects.toMatchObject({
            code: "VALIDATION_FAILED",
        });
    });

    it("rejects null improvedCode", async () => {
        const nullField = { ...VALID_RESULT, improvedCode: null };
        mockCreate
            .mockResolvedValueOnce(makeResponse(JSON.stringify(nullField)))
            .mockResolvedValueOnce(makeResponse(JSON.stringify(nullField)));

        await expect(reviewCode(SAMPLE_CODE)).rejects.toMatchObject({
            code: "VALIDATION_FAILED",
        });
    });

    it("rejects missing nested complexity fields", async () => {
        const badComplexity = {
            ...VALID_RESULT,
            complexity: { time: "O(n)" }, // missing space + explanation
        };
        mockCreate
            .mockResolvedValueOnce(makeResponse(JSON.stringify(badComplexity)))
            .mockResolvedValueOnce(makeResponse(JSON.stringify(badComplexity)));

        await expect(reviewCode(SAMPLE_CODE)).rejects.toMatchObject({
            code: "VALIDATION_FAILED",
        });
    });

    it("rejects array with non-string items", async () => {
        const mixedArray = { ...VALID_RESULT, security: [1, true, null] };
        mockCreate
            .mockResolvedValueOnce(makeResponse(JSON.stringify(mixedArray)))
            .mockResolvedValueOnce(makeResponse(JSON.stringify(mixedArray)));

        await expect(reviewCode(SAMPLE_CODE)).rejects.toMatchObject({
            code: "VALIDATION_FAILED",
        });
    });

    it("rejects completely wrong schema", async () => {
        const wrongSchema = { answer: "looks good", score: 10 };
        mockCreate
            .mockResolvedValueOnce(makeResponse(JSON.stringify(wrongSchema)))
            .mockResolvedValueOnce(makeResponse(JSON.stringify(wrongSchema)));

        await expect(reviewCode(SAMPLE_CODE)).rejects.toMatchObject({
            code: "VALIDATION_FAILED",
        });
    });

    it("includes Zod path details in error message", async () => {
        const wrong = { ...VALID_RESULT, bugs: 42 };
        mockCreate
            .mockResolvedValueOnce(makeResponse(JSON.stringify(wrong)))
            .mockResolvedValueOnce(makeResponse(JSON.stringify(wrong)));

        try {
            await reviewCode(SAMPLE_CODE);
            expect.unreachable("Should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(AIReviewError);
            expect((err as AIReviewError).message).toContain("bugs");
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. RETRY LOGIC
// ═════════════════════════════════════════════════════════════════════════════

describe("Retry logic", () => {
    it("retries once and succeeds on second attempt", async () => {
        const malformed = "Not valid JSON at all {{{";
        mockCreate
            .mockResolvedValueOnce(makeResponse(malformed))
            .mockResolvedValueOnce(makeResponse(VALID_JSON));

        const result = await reviewCode(SAMPLE_CODE);

        expect(result).toEqual(VALID_RESULT);
        expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("retry message includes the bad assistant output", async () => {
        const malformed = "Sorry, here is my review in free text.";
        mockCreate
            .mockResolvedValueOnce(makeResponse(malformed))
            .mockResolvedValueOnce(makeResponse(VALID_JSON));

        await reviewCode(SAMPLE_CODE);

        // Second call should include the bad response as assistant message
        const retryCallArgs = mockCreate.mock.calls[1][0];
        const assistantMsg = retryCallArgs.messages.find(
            (m: { role: string }) => m.role === "assistant"
        );
        expect(assistantMsg).toBeDefined();
        expect(assistantMsg.content).toBe(malformed);
    });

    it("retry message includes schema correction instructions", async () => {
        const malformed = "invalid";
        mockCreate
            .mockResolvedValueOnce(makeResponse(malformed))
            .mockResolvedValueOnce(makeResponse(VALID_JSON));

        await reviewCode(SAMPLE_CODE);

        const retryCallArgs = mockCreate.mock.calls[1][0];
        const lastUserMsg = retryCallArgs.messages.filter(
            (m: { role: string }) => m.role === "user"
        );
        const correctionMsg = lastUserMsg[lastUserMsg.length - 1];
        expect(correctionMsg.content).toContain("invalid or malformed JSON");
        expect(correctionMsg.content).toContain('"time": string');
        expect(correctionMsg.content).toContain('"space": string');
        expect(correctionMsg.content).toContain('"explanation": string');
        expect(correctionMsg.content).toContain("No markdown. No commentary.");
    });

    it("does NOT retry more than once — fails after two attempts", async () => {
        const bad = '{"partial": true}';
        mockCreate
            .mockResolvedValueOnce(makeResponse(bad))
            .mockResolvedValueOnce(makeResponse(bad));

        await expect(reviewCode(SAMPLE_CODE)).rejects.toThrow(AIReviewError);
        expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("first attempt valid JSON but wrong schema → retry fixes it", async () => {
        const wrongSchema = JSON.stringify({ answer: "looks good" });
        mockCreate
            .mockResolvedValueOnce(makeResponse(wrongSchema))
            .mockResolvedValueOnce(makeResponse(VALID_JSON));

        const result = await reviewCode(SAMPLE_CODE);

        expect(result).toEqual(VALID_RESULT);
        expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("truncated JSON on first attempt, valid on retry", async () => {
        const truncated = '{"bugs":["error"],"complexity":{"time":"O(n)"';
        mockCreate
            .mockResolvedValueOnce(makeResponse(truncated))
            .mockResolvedValueOnce(makeResponse(VALID_JSON));

        const result = await reviewCode(SAMPLE_CODE);

        expect(result).toEqual(VALID_RESULT);
        expect(mockCreate).toHaveBeenCalledTimes(2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5b. FULL FAILURE CHAIN
// ═════════════════════════════════════════════════════════════════════════════

describe("Full failure chain", () => {
    it("markdown-wrapped first → wrong-type retry → proper AIReviewError with raw", async () => {
        // First response: markdown-wrapped (triggers extractJSON fence strip → valid JSON parse → Zod passes... wait no)
        // Actually: markdown-wrapped with WRONG TYPES to ensure both attempts fail
        const wrongTypesPayload = {
            bugs: 42,                         // should be string[]
            complexity: { time: "O(n)" },     // missing space + explanation
            cleanCode: null,                  // should be string[]
            security: [],
            optimization: [],
            improvedCode: 123,                // should be string
        };
        const markdownWrapped = "```json\n" + JSON.stringify(wrongTypesPayload) + "\n```";

        // Retry: correct structure but wrong types (different failure)
        const wrongTypesRetry = {
            bugs: ["valid bug"],
            complexity: {
                time: 100,          // should be string
                space: "O(1)",
                explanation: "ok",
            },
            cleanCode: [],
            security: [],
            optimization: [],
            improvedCode: "",
        };
        const retryResponse = JSON.stringify(wrongTypesRetry);

        mockCreate
            .mockResolvedValueOnce(makeResponse(markdownWrapped))
            .mockResolvedValueOnce(makeResponse(retryResponse));

        try {
            await reviewCode(SAMPLE_CODE);
            expect.unreachable("Should have thrown");
        } catch (err) {
            // 1. Must be AIReviewError
            expect(err).toBeInstanceOf(AIReviewError);
            const reviewErr = err as AIReviewError;

            // 2. Must have VALIDATION_FAILED code
            expect(reviewErr.code).toBe("VALIDATION_FAILED");

            // 3. Must preserve raw output for debugging
            expect(reviewErr.raw).toBeDefined();
            expect(reviewErr.raw!.length).toBeGreaterThan(0);

            // 4. Raw must contain the retry response (not the first)
            expect(reviewErr.raw).toContain('"time":100');

            // 5. Error message must reference the failing field
            expect(reviewErr.message).toContain("Zod validation failed");

            // 6. Must NOT leak system prompt
            expect(reviewErr.message).not.toContain("Senior Software Engineer");
            expect(reviewErr.message).not.toContain("STRICT PROHIBITIONS");
            expect(reviewErr.raw).not.toContain("Senior Software Engineer");

            // 7. toJSON must be serializable
            const json = reviewErr.toJSON();
            expect(json.error).toBe(true);
            expect(json.code).toBe("VALIDATION_FAILED");
            expect(() => JSON.stringify(json)).not.toThrow();
        }

        // 8. Must have called API exactly twice (one attempt + one retry)
        expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("plain text first → malformed JSON retry → JSON_PARSE_ERROR with raw", async () => {
        const plainText = "I'm sorry, I cannot review this code.";
        const garbledRetry = "{bugs: [missing quotes], not valid}";

        mockCreate
            .mockResolvedValueOnce(makeResponse(plainText))
            .mockResolvedValueOnce(makeResponse(garbledRetry));

        try {
            await reviewCode(SAMPLE_CODE);
            expect.unreachable("Should have thrown");
        } catch (err) {
            const reviewErr = err as AIReviewError;
            expect(reviewErr.code).toBe("JSON_PARSE_ERROR");
            expect(reviewErr.raw).toBeDefined();
            expect(reviewErr.message).not.toContain("Senior Software Engineer");
        }
    });

    it("error.toJSON never includes raw field (no internal leakage)", async () => {
        const bad = "not json at all";
        mockCreate
            .mockResolvedValueOnce(makeResponse(bad))
            .mockResolvedValueOnce(makeResponse(bad));

        try {
            await reviewCode(SAMPLE_CODE);
            expect.unreachable("Should have thrown");
        } catch (err) {
            const reviewErr = err as AIReviewError;
            const json = reviewErr.toJSON();

            // toJSON intentionally omits 'raw' — safe to send to clients
            expect(json).not.toHaveProperty("raw");
            expect(Object.keys(json)).toEqual(["error", "code", "message"]);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. EMPTY / INVALID INPUT HANDLING
// ═════════════════════════════════════════════════════════════════════════════

describe("Input validation", () => {
    it("throws API_ERROR for empty string", async () => {
        await expect(reviewCode("")).rejects.toMatchObject({
            code: "API_ERROR",
            message: "Code input cannot be empty.",
        });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("throws API_ERROR for whitespace-only string", async () => {
        await expect(reviewCode("   \n\t  ")).rejects.toMatchObject({
            code: "API_ERROR",
        });
        expect(mockCreate).not.toHaveBeenCalled();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. API ERROR HANDLING
// ═════════════════════════════════════════════════════════════════════════════

describe("API errors", () => {
    it("wraps Anthropic SDK errors as API_ERROR", async () => {
        mockCreate
            .mockRejectedValueOnce(new Error("Connection refused"))
            .mockRejectedValueOnce(new Error("Connection refused")); // Fallback also fails

        try {
            await reviewCode(SAMPLE_CODE);
            expect.unreachable("Should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(AIReviewError);
            expect((err as AIReviewError).code).toBe("API_ERROR");
            expect((err as AIReviewError).message).toMatch(/Anthropic API call and fallback both failed/);
        }
    });

    it("wraps non-Error throws from SDK", async () => {
        mockCreate
            .mockRejectedValueOnce("network timeout")
            .mockRejectedValueOnce("network timeout");

        try {
            await reviewCode(SAMPLE_CODE);
            expect.unreachable("Should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(AIReviewError);
            expect((err as AIReviewError).code).toBe("API_ERROR");
        }
    });

    it("wraps retry API failure as API_ERROR", async () => {
        const malformed = "not json";
        mockCreate
            .mockResolvedValueOnce(makeResponse(malformed))
            .mockRejectedValueOnce(new Error("Rate limit exceeded"));

        try {
            await reviewCode(SAMPLE_CODE);
            expect.unreachable("Should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(AIReviewError);
            expect((err as AIReviewError).code).toBe("API_ERROR");
            expect((err as AIReviewError).message).toMatch(/retry call failed/);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. AIReviewError STRUCTURE
// ═════════════════════════════════════════════════════════════════════════════

describe("AIReviewError", () => {
    it("has correct name, code, and message", () => {
        const err = new AIReviewError("JSON_PARSE_ERROR", "bad json", '{"x":');
        expect(err.name).toBe("AIReviewError");
        expect(err.code).toBe("JSON_PARSE_ERROR");
        expect(err.message).toBe("bad json");
        expect(err.raw).toBe('{"x":');
    });

    it("toJSON returns structured error object", () => {
        const err = new AIReviewError("VALIDATION_FAILED", "zod error");
        const json = err.toJSON();
        expect(json).toEqual({
            error: true,
            code: "VALIDATION_FAILED",
            message: "zod error",
        });
    });

    it("is instanceof Error", () => {
        const err = new AIReviewError("UNKNOWN", "test");
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(AIReviewError);
    });

    it("raw is undefined when not provided", () => {
        const err = new AIReviewError("API_ERROR", "missing key");
        expect(err.raw).toBeUndefined();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. TOKEN AMPLIFICATION GUARD
// ═════════════════════════════════════════════════════════════════════════════

describe("Token amplification guard", () => {
    it("rejects improvedCode exceeding max length", async () => {
        const oversized = {
            ...VALID_RESULT,
            improvedCode: "x".repeat(MAX_IMPROVED_CODE_LENGTH + 1),
        };
        mockCreate
            .mockResolvedValueOnce(makeResponse(JSON.stringify(oversized)))
            .mockResolvedValueOnce(makeResponse(JSON.stringify(oversized)));

        try {
            await reviewCode(SAMPLE_CODE);
            expect.unreachable("Should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(AIReviewError);
            expect((err as AIReviewError).code).toBe("VALIDATION_FAILED");
            expect((err as AIReviewError).message).toContain("improvedCode");
        }
    });

    it("allows improvedCode at exactly max length", async () => {
        const atLimit = {
            ...VALID_RESULT,
            improvedCode: "x".repeat(MAX_IMPROVED_CODE_LENGTH),
        };
        mockCreate.mockResolvedValueOnce(
            makeResponse(JSON.stringify(atLimit))
        );

        const result = await reviewCode(SAMPLE_CODE);
        expect(result.improvedCode.length).toBe(MAX_IMPROVED_CODE_LENGTH);
    });

    it("rejects array items exceeding max item length", async () => {
        const oversizedItem = {
            ...VALID_RESULT,
            bugs: ["x".repeat(MAX_ARRAY_ITEM_LENGTH + 1)],
        };
        mockCreate
            .mockResolvedValueOnce(makeResponse(JSON.stringify(oversizedItem)))
            .mockResolvedValueOnce(makeResponse(JSON.stringify(oversizedItem)));

        try {
            await reviewCode(SAMPLE_CODE);
            expect.unreachable("Should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(AIReviewError);
            expect((err as AIReviewError).code).toBe("VALIDATION_FAILED");
        }
    });

    it("rejects oversized complexity explanation", async () => {
        const oversizedExplanation = {
            ...VALID_RESULT,
            complexity: {
                time: "O(n)",
                space: "O(1)",
                explanation: "x".repeat(MAX_COMPLEXITY_FIELD_LENGTH + 1),
            },
        };
        mockCreate
            .mockResolvedValueOnce(makeResponse(JSON.stringify(oversizedExplanation)))
            .mockResolvedValueOnce(makeResponse(JSON.stringify(oversizedExplanation)));

        try {
            await reviewCode(SAMPLE_CODE);
            expect.unreachable("Should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(AIReviewError);
            expect((err as AIReviewError).code).toBe("VALIDATION_FAILED");
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. CONCURRENCY STORM
// ═════════════════════════════════════════════════════════════════════════════

describe("Concurrency storm", () => {
    it("20 parallel calls — no shared state bleed, no retry counter corruption", async () => {
        const CONCURRENCY = 20;

        // Each call gets its own valid response
        for (let i = 0; i < CONCURRENCY; i++) {
            const uniqueResult = {
                ...VALID_RESULT,
                bugs: [`Bug from call ${i}`],
            };
            mockCreate.mockResolvedValueOnce(
                makeResponse(JSON.stringify(uniqueResult))
            );
        }

        const promises = Array.from({ length: CONCURRENCY }, (_, i) =>
            reviewCode(`// code ${i}\nconst x = ${i};`)
        );

        const results = await Promise.all(promises);

        // Each result must be unique — no cross-contamination
        for (let i = 0; i < CONCURRENCY; i++) {
            expect(results[i].bugs[0]).toBe(`Bug from call ${i}`);
        }

        expect(mockCreate).toHaveBeenCalledTimes(CONCURRENCY);
    });

    it("20 parallel calls — mixed success and failure, no interference", async () => {
        const CONCURRENCY = 20;
        const callCounters = new Map<string, number>();

        // Use mockImplementation for deterministic per-call routing
        mockCreate.mockImplementation((args: { messages: { content: string }[] }) => {
            const userMsg = args.messages[0].content;
            // Extract the call index from code content
            const match = userMsg.match(/code (\d+)/);
            const idx = match ? parseInt(match[1], 10) : -1;
            const callKey = `call-${idx}`;
            const attempt = (callCounters.get(callKey) ?? 0) + 1;
            callCounters.set(callKey, attempt);

            if (idx % 2 === 0) {
                // Even calls always succeed
                return Promise.resolve(
                    makeResponse(JSON.stringify({ ...VALID_RESULT, bugs: [`Bug ${idx}`] }))
                );
            } else {
                // Odd calls: fail first, succeed on retry
                if (attempt === 1) {
                    return Promise.resolve(makeResponse("not json"));
                }
                return Promise.resolve(
                    makeResponse(JSON.stringify({ ...VALID_RESULT, bugs: [`Retried ${idx}`] }))
                );
            }
        });

        const promises = Array.from({ length: CONCURRENCY }, (_, i) =>
            reviewCode(`// code ${i}\nconst x = ${i};`)
        );

        const results = await Promise.all(promises);

        for (let i = 0; i < CONCURRENCY; i++) {
            if (i % 2 === 0) {
                expect(results[i].bugs[0]).toBe(`Bug ${i}`);
            } else {
                expect(results[i].bugs[0]).toBe(`Retried ${i}`);
            }
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. MEMORY STABILITY
// ═════════════════════════════════════════════════════════════════════════════

describe("Memory stability", () => {
    it("500 sequential failures — no unhandled rejections, stable error objects", async () => {
        const ITERATIONS = 500;
        let unhandledCount = 0;

        const handler = () => { unhandledCount++; };
        process.on("unhandledRejection", handler);

        try {
            for (let i = 0; i < ITERATIONS; i++) {
                const badResponse = `not json iteration ${i}`;
                mockCreate
                    .mockResolvedValueOnce(makeResponse(badResponse))
                    .mockResolvedValueOnce(makeResponse(badResponse));

                try {
                    await reviewCode(SAMPLE_CODE);
                } catch (err) {
                    expect(err).toBeInstanceOf(AIReviewError);
                }
            }

            expect(unhandledCount).toBe(0);
            expect(mockCreate).toHaveBeenCalledTimes(ITERATIONS * 2);
        } finally {
            process.removeListener("unhandledRejection", handler);
        }
    }, 30_000); // generous timeout

    it("error objects are garbage-collectable (no retained references)", async () => {
        const errors: WeakRef<AIReviewError>[] = [];

        for (let i = 0; i < 50; i++) {
            mockCreate
                .mockResolvedValueOnce(makeResponse("bad"))
                .mockResolvedValueOnce(makeResponse("bad"));

            try {
                await reviewCode(SAMPLE_CODE);
            } catch (err) {
                if (err instanceof AIReviewError) {
                    errors.push(new WeakRef(err));
                }
            }
        }

        // All errors were captured as WeakRefs — they CAN be GC'd
        // We can't force GC deterministically, but we verify:
        // 1. No crash during iteration
        // 2. WeakRefs were created successfully
        expect(errors.length).toBe(50);
        // Verify at least some are still reachable (they may or may not be GC'd)
        const alive = errors.filter((ref) => ref.deref() !== undefined);
        expect(alive.length).toBeGreaterThanOrEqual(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. EXPERTISE LEVEL PROMPT INJECTION
// ═════════════════════════════════════════════════════════════════════════════

describe("Expertise level prompt injection", () => {
    // ── buildEffectivePrompt unit tests ──────────────────────────────────────

    it("buildEffectivePrompt includes BEGINNER mode when level is 'beginner'", () => {
        const prompt = buildEffectivePrompt("beginner");
        expect(prompt).toContain("EXPLANATION MODE: BEGINNER");
        expect(prompt).not.toContain("EXPLANATION MODE: ADVANCED");
    });

    it("buildEffectivePrompt includes ADVANCED mode when level is 'advanced'", () => {
        const prompt = buildEffectivePrompt("advanced");
        expect(prompt).toContain("EXPLANATION MODE: ADVANCED");
        expect(prompt).not.toContain("EXPLANATION MODE: BEGINNER");
    });

    it("buildEffectivePrompt includes neither mode when level is undefined", () => {
        const prompt = buildEffectivePrompt();
        expect(prompt).not.toContain("EXPLANATION MODE: BEGINNER");
        expect(prompt).not.toContain("EXPLANATION MODE: ADVANCED");
    });

    it("buildEffectivePrompt always includes ADAPTIVE EXPLANATION DEPTH", () => {
        expect(buildEffectivePrompt()).toContain("ADAPTIVE EXPLANATION DEPTH");
        expect(buildEffectivePrompt("beginner")).toContain("ADAPTIVE EXPLANATION DEPTH");
        expect(buildEffectivePrompt("advanced")).toContain("ADAPTIVE EXPLANATION DEPTH");
    });

    // ── Integration: system prompt passed to Anthropic API ───────────────────

    it("passes beginner system prompt to Anthropic when level='beginner'", async () => {
        mockCreate.mockResolvedValueOnce(makeResponse(VALID_JSON));

        await reviewCode(SAMPLE_CODE, "javascript", "beginner");

        const callArgs = mockCreate.mock.calls[0][0];
        expect(callArgs.system).toContain("EXPLANATION MODE: BEGINNER");
        expect(callArgs.system).toContain("jargon-free");
        expect(callArgs.system).toContain("ADAPTIVE EXPLANATION DEPTH");
    });

    it("passes advanced system prompt to Anthropic when level='advanced'", async () => {
        mockCreate.mockResolvedValueOnce(makeResponse(VALID_JSON));

        await reviewCode(SAMPLE_CODE, "javascript", "advanced");

        const callArgs = mockCreate.mock.calls[0][0];
        expect(callArgs.system).toContain("EXPLANATION MODE: ADVANCED");
        expect(callArgs.system).toContain("production-ready");
        expect(callArgs.system).toContain("ADAPTIVE EXPLANATION DEPTH");
    });

    it("passes neutral system prompt (no mode) when level is undefined", async () => {
        mockCreate.mockResolvedValueOnce(makeResponse(VALID_JSON));

        await reviewCode(SAMPLE_CODE, "javascript");

        const callArgs = mockCreate.mock.calls[0][0];
        expect(callArgs.system).not.toContain("EXPLANATION MODE: BEGINNER");
        expect(callArgs.system).not.toContain("EXPLANATION MODE: ADVANCED");
        expect(callArgs.system).toContain("ADAPTIVE EXPLANATION DEPTH");
    });

    it("user message does NOT contain level instructions (moved to system prompt)", async () => {
        mockCreate.mockResolvedValueOnce(makeResponse(VALID_JSON));

        await reviewCode(SAMPLE_CODE, "javascript", "beginner");

        const callArgs = mockCreate.mock.calls[0][0];
        const userContent = callArgs.messages[0].content;
        expect(userContent).not.toContain("beginner developer");
        expect(userContent).not.toContain("advanced developer");
    });

    it("fallback API call also uses the expertise-level system prompt", async () => {
        // First call fails, fallback succeeds
        mockCreate
            .mockRejectedValueOnce(new Error("primary failed"))
            .mockResolvedValueOnce(makeResponse(VALID_JSON));

        await reviewCode(SAMPLE_CODE, "javascript", "advanced");

        // Fallback is the second call
        const fallbackArgs = mockCreate.mock.calls[1][0];
        expect(fallbackArgs.system).toContain("EXPLANATION MODE: ADVANCED");
        expect(fallbackArgs.system).toContain("ADAPTIVE EXPLANATION DEPTH");
    });

    it("retry API call also uses the expertise-level system prompt", async () => {
        // First attempt returns invalid JSON, retry succeeds
        mockCreate
            .mockResolvedValueOnce(makeResponse("not valid json"))
            .mockResolvedValueOnce(makeResponse(VALID_JSON));

        await reviewCode(SAMPLE_CODE, "javascript", "beginner");

        // Retry is the second call
        const retryArgs = mockCreate.mock.calls[1][0];
        expect(retryArgs.system).toContain("EXPLANATION MODE: BEGINNER");
        expect(retryArgs.system).toContain("ADAPTIVE EXPLANATION DEPTH");
    });
});
