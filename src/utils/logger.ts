// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReviewCostLog {
    event: "review_cost";
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    clientIp: string;
    durationMs: number;
    timestamp: string;
}

export interface ReviewErrorLog {
    event: "review_error";
    requestId: string;
    errorCode: string;
    clientIp: string;
    durationMs: number;
    timestamp: string;
}

export interface RateLimitLog {
    event: "rate_limit_hit";
    requestId: string;
    clientIp: string;
    retryAfterMs: number;
    timestamp: string;
}

// ─── Logger ──────────────────────────────────────────────────────────────────

export function logReviewCost(entry: Omit<ReviewCostLog, "event" | "timestamp" | "totalTokens">): void {
    const log: ReviewCostLog = {
        event: "review_cost",
        ...entry,
        totalTokens: entry.inputTokens + entry.outputTokens,
        timestamp: new Date().toISOString(),
    };
    process.stdout.write(JSON.stringify(log) + "\n");
}

export function logReviewError(entry: Omit<ReviewErrorLog, "event" | "timestamp">): void {
    const log: ReviewErrorLog = {
        event: "review_error",
        ...entry,
        timestamp: new Date().toISOString(),
    };
    process.stderr.write(JSON.stringify(log) + "\n");
}

export function logRateLimit(entry: Omit<RateLimitLog, "event" | "timestamp">): void {
    const log: RateLimitLog = {
        event: "rate_limit_hit",
        ...entry,
        timestamp: new Date().toISOString(),
    };
    process.stdout.write(JSON.stringify(log) + "\n");
}
