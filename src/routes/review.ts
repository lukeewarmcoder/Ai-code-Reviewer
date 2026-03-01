import { Router, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { ReviewRequestSchema } from "../validation.js";
import { defaultLimiter } from "../rateLimit.js";
import { logReviewCost, logReviewError, logRateLimit } from "../logger.js";
import { reviewCode, AIReviewError } from "../claude.js";

// ─── Error code mapping ──────────────────────────────────────────────────────

const AI_ERROR_MAP: Record<string, { status: number; clientCode: string }> = {
    API_ERROR: { status: 502, clientCode: "AI_UNAVAILABLE" },
    EMPTY_RESPONSE: { status: 502, clientCode: "AI_UNAVAILABLE" },
    JSON_PARSE_ERROR: { status: 502, clientCode: "AI_MALFORMED_RESPONSE" },
    VALIDATION_FAILED: { status: 502, clientCode: "AI_MALFORMED_RESPONSE" },
    UNKNOWN: { status: 502, clientCode: "AI_UNAVAILABLE" },
};

// ─── Response helpers ────────────────────────────────────────────────────────

function successResponse(res: Response, data: unknown): void {
    res.status(200).json({ success: true, data });
}

function errorResponse(
    res: Response,
    status: number,
    code: string,
    message: string,
    headers?: Record<string, string>
): void {
    if (headers) {
        for (const [key, value] of Object.entries(headers)) {
            res.setHeader(key, value);
        }
    }
    res.status(status).json({ success: false, error: { code, message } });
}

// ─── Client IP extraction ────────────────────────────────────────────────────

function getClientIp(req: Request): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
        return forwarded.split(",")[0].trim();
    }
    return req.socket.remoteAddress ?? "unknown";
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const reviewRouter = Router();

// Method guard — only POST allowed
reviewRouter.all("/", (req: Request, res: Response, next) => {
    if (req.method !== "POST") {
        errorResponse(res, 405, "METHOD_NOT_ALLOWED", `Method ${req.method} is not allowed. Use POST.`);
        return;
    }
    next();
});

// POST /api/review
reviewRouter.post("/", async (req: Request, res: Response): Promise<void> => {
    const clientIp = getClientIp(req);
    const startTime = Date.now();
    const requestId = randomUUID();

    // ── Step 1: Input validation ─────────────────────────────────────────────

    const parsed = ReviewRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
        errorResponse(res, 400, "INVALID_INPUT", issues);
        return;
    }

    const { code, language } = parsed.data;

    // ── Step 2: Rate limit check ─────────────────────────────────────────────

    const rateResult = defaultLimiter.check(clientIp);

    // Always set rate limit headers
    res.setHeader("X-RateLimit-Remaining", rateResult.remaining.toString());

    if (!rateResult.allowed) {
        const retryAfterSeconds = Math.ceil(rateResult.retryAfterMs / 1000);

        logRateLimit({ requestId, clientIp, retryAfterMs: rateResult.retryAfterMs });

        errorResponse(
            res,
            429,
            "RATE_LIMIT_EXCEEDED",
            `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
            { "Retry-After": retryAfterSeconds.toString() }
        );
        return;
    }

    // ── Step 3: Call AI engine ────────────────────────────────────────────────

    try {
        const result = await reviewCode(code, language);

        const durationMs = Date.now() - startTime;

        // ── Step 4: Cost logging ─────────────────────────────────────────────
        // Note: In a real integration, inputTokens/outputTokens come from
        // the Anthropic response.usage. For now, we estimate from the result.
        logReviewCost({
            inputTokens: Math.ceil(code.length / 4),      // rough estimate
            outputTokens: Math.ceil(JSON.stringify(result).length / 4),
            clientIp,
            durationMs,
        });

        successResponse(res, result);
    } catch (err) {
        const durationMs = Date.now() - startTime;

        if (err instanceof AIReviewError) {
            const mapping = AI_ERROR_MAP[err.code] ?? {
                status: 500,
                clientCode: "INTERNAL_ERROR",
            };

            // Log full error server-side (including raw if present)
            logReviewError({ requestId, errorCode: err.code, clientIp, durationMs });

            // NEVER send err.raw to client
            errorResponse(res, mapping.status, mapping.clientCode, err.message);
            return;
        }

        // Unexpected error — never expose internals
        logReviewError({ requestId, errorCode: "UNEXPECTED", clientIp, durationMs });

        errorResponse(
            res,
            500,
            "INTERNAL_ERROR",
            "An unexpected error occurred. Please try again later."
        );
    }
});
