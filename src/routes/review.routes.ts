import { Router, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { ReviewRequestSchema } from "../middleware/validate.middleware.js";
import { defaultLimiter } from "../middleware/rateLimit.middleware.js";
import { logReviewCost, logReviewError, logRateLimit } from "../utils/logger.js";
import { reviewCode, AIReviewError } from "../services/claude.service.js";
import { getCachedReview, recordReview } from "../db/persistence.js";

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

    const { code, language, level } = parsed.data;

    // ── Step 1.5: Plan-based limits ───────────────────────────────────────────

    const plan = (req.headers["x-api-key-plan"] as string) ?? "FREE";
    const maxLines = plan === "PRO" ? 5000 : 300;
    const lineCount = code.split("\n").length;

    if (lineCount > maxLines) {
        errorResponse(
            res,
            400,
            "CODE_TOO_LONG",
            `Code exceeds the ${maxLines}-line limit for your ${plan} plan. You sent ${lineCount} lines.`
        );
        return;
    }

    // ── Step 2: Rate limit check ─────────────────────────────────────────────

    const rateMaxOverride = plan === "PRO" ? 1000 : undefined; // PRO = effectively unlimited
    const rateResult = defaultLimiter.check(clientIp, rateMaxOverride);

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

    // ── Step 2.5: Cache check ────────────────────────────────────────────────

    const cachedResult = getCachedReview(code, language, level);
    if (cachedResult) {
        logReviewCost({
            inputTokens: 0,
            outputTokens: 0,
            clientIp,
            durationMs: Date.now() - startTime,
        });
        
        res.setHeader("X-Cache", "HIT");
        successResponse(res, cachedResult);
        return;
    }

    // ── Step 3: Call AI engine ────────────────────────────────────────────────

    try {
        const result = await reviewCode(code, language, level);

        const durationMs = Date.now() - startTime;
        const inputTokens = Math.ceil(code.length / 4);
        const outputTokens = Math.ceil(JSON.stringify(result).length / 4);

        // ── Step 4: Cost logging & Persistence ────────────────────────────────
        logReviewCost({
            inputTokens,
            outputTokens,
            clientIp,
            durationMs,
        });

        recordReview({
            id: requestId,
            clientIp,
            code,
            language,
            level,
            status: "success",
            result,
            inputTokens,
            outputTokens,
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

            recordReview({
                id: requestId,
                clientIp,
                code,
                language,
                level,
                status: "error",
                errorCode: err.code,
                durationMs,
            });

            return;
        }

        // Unexpected error — never expose internals
        logReviewError({ requestId, errorCode: "UNEXPECTED", clientIp, durationMs });

        recordReview({
            id: requestId,
            clientIp,
            code,
            language,
            level,
            status: "error",
            errorCode: "UNEXPECTED",
            durationMs,
        });

        errorResponse(
            res,
            500,
            "INTERNAL_ERROR",
            "An unexpected error occurred. Please try again later."
        );
    }
});
