import { randomUUID } from "node:crypto";
import { ReviewRequestSchema } from "../validation.js";
import { defaultLimiter } from "../rateLimit.js";
import { reviewCode, AIReviewError } from "../claude.js";
import { logReviewCost, logReviewError, logRateLimit } from "../logger.js";

// ─── Client-facing error messages (never expose internals) ──────────────────

const PUBLIC_MESSAGES: Record<string, string> = {
    AI_UNAVAILABLE: "The AI service is currently unavailable.",
    AI_MALFORMED_RESPONSE: "The AI service returned an invalid response.",
};

// ─── Response type ───────────────────────────────────────────────────────────

export type ReviewHttpResponse = {
    status: number;
    body: unknown;
    headers?: Record<string, string>;
};

// ─── Error code mapping ──────────────────────────────────────────────────────

const AI_ERROR_MAP: Record<string, { status: number; clientCode: string }> = {
    API_ERROR: { status: 502, clientCode: "AI_UNAVAILABLE" },
    EMPTY_RESPONSE: { status: 502, clientCode: "AI_UNAVAILABLE" },
    JSON_PARSE_ERROR: { status: 502, clientCode: "AI_MALFORMED_RESPONSE" },
    VALIDATION_FAILED: { status: 502, clientCode: "AI_MALFORMED_RESPONSE" },
    UNKNOWN: { status: 502, clientCode: "AI_UNAVAILABLE" },
};

// ─── Response builders ───────────────────────────────────────────────────────

function success(
    data: unknown,
    headers: Record<string, string>
): ReviewHttpResponse {
    return { status: 200, body: { success: true, data }, headers };
}

function failure(
    status: number,
    code: string,
    message: string,
    headers: Record<string, string>
): ReviewHttpResponse {
    return {
        status,
        body: { success: false, error: { code, message } },
        headers,
    };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function handleReviewRequest(
    input: unknown,
    clientIp: string
): Promise<ReviewHttpResponse> {
    const startTime = performance.now();
    const requestId = randomUUID();
    const rateKey = clientIp || "anonymous";

    const baseHeaders: Record<string, string> = {
        "X-Request-Id": requestId,
        "Content-Type": "application/json",
    };

    // ── 1. Input validation ──────────────────────────────────────────────────

    const parsed = ReviewRequestSchema.safeParse(input);

    if (!parsed.success) {
        return failure(400, "INVALID_INPUT", "Invalid request payload.", baseHeaders);
    }

    const { code, language } = parsed.data;

    // ── 2. Rate limit check ──────────────────────────────────────────────────

    const rateResult = defaultLimiter.check(rateKey);

    const rateLimitHeaders: Record<string, string> = {
        ...baseHeaders,
        "X-RateLimit-Limit": "5",
        "X-RateLimit-Remaining": rateResult.remaining.toString(),
    };

    if (!rateResult.allowed) {
        const retryAfterSeconds = Math.ceil(rateResult.retryAfterMs / 1000);

        logRateLimit({
            requestId,
            clientIp: rateKey,
            retryAfterMs: rateResult.retryAfterMs,
        });

        return failure(
            429,
            "RATE_LIMIT_EXCEEDED",
            `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
            {
                ...rateLimitHeaders,
                "Retry-After": retryAfterSeconds.toString(),
            }
        );
    }

    // ── 3. AI engine call ────────────────────────────────────────────────────

    try {
        const result = await reviewCode(code, language);
        const durationMs = Math.round(performance.now() - startTime);

        logReviewCost({
            inputTokens: Math.ceil(code.length / 4),
            outputTokens: Math.ceil(JSON.stringify(result).length / 4),
            clientIp: rateKey,
            durationMs,
        });

        return success(result, rateLimitHeaders);
    } catch (err: unknown) {
        const durationMs = Math.round(performance.now() - startTime);

        if (err instanceof AIReviewError) {
            const mapping = AI_ERROR_MAP[err.code] ?? {
                status: 500,
                clientCode: "INTERNAL_ERROR",
            };

            logReviewError({
                requestId,
                errorCode: err.code,
                clientIp: rateKey,
                durationMs,
            });

            return failure(
                mapping.status,
                mapping.clientCode,
                PUBLIC_MESSAGES[mapping.clientCode] ?? "An unexpected error occurred.",
                rateLimitHeaders
            );
        }

        logReviewError({
            requestId,
            errorCode: "UNEXPECTED",
            clientIp: rateKey,
            durationMs,
        });

        return failure(
            500,
            "INTERNAL_ERROR",
            "An unexpected error occurred. Please try again later.",
            rateLimitHeaders
        );
    }
}
