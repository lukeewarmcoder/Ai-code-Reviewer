// ─── Types ───────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
}

// ─── Sliding Window Rate Limiter ─────────────────────────────────────────────

export class RateLimiter {
    private readonly windowMs: number;
    private readonly maxRequests: number;
    private readonly store = new Map<string, number[]>();

    constructor(config: RateLimitConfig) {
        this.windowMs = config.windowMs;
        this.maxRequests = config.maxRequests;
    }

    /**
     * Check whether a request from `key` is allowed.
     * Mutates internal state: records the timestamp if allowed.
     */
    check(key: string): RateLimitResult {
        const now = Date.now();
        const windowStart = now - this.windowMs;

        // Get or create entry, prune expired timestamps
        let timestamps = this.store.get(key) ?? [];
        timestamps = timestamps.filter((t) => t > windowStart);

        if (timestamps.length >= this.maxRequests) {
            // Blocked — calculate when the oldest entry in the window expires
            const oldestInWindow = timestamps[0];
            const retryAfterMs = oldestInWindow + this.windowMs - now;

            this.store.set(key, timestamps);

            return {
                allowed: false,
                remaining: 0,
                retryAfterMs: Math.max(retryAfterMs, 0),
            };
        }

        // Allowed — record this request
        timestamps.push(now);
        this.store.set(key, timestamps);

        return {
            allowed: true,
            remaining: this.maxRequests - timestamps.length,
            retryAfterMs: 0,
        };
    }

    /**
     * Remove all entries for a key (useful for testing or admin resets).
     */
    reset(key: string): void {
        this.store.delete(key);
    }

    /**
     * Clear all entries (useful for testing).
     */
    resetAll(): void {
        this.store.clear();
    }
}

// ─── Default limiter: 5 requests per 24 hours ───────────────────────────────

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const defaultLimiter = new RateLimiter({
    windowMs: TWENTY_FOUR_HOURS_MS,
    maxRequests: 5,
});
