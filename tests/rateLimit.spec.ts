import { describe, it, expect, beforeEach } from "vitest";
import { RateLimiter } from "../src/middleware/rateLimit.middleware.js";

describe("RateLimiter", () => {
    let limiter: RateLimiter;

    beforeEach(() => {
        limiter = new RateLimiter({ windowMs: 10_000, maxRequests: 3 });
    });

    it("allows up to maxRequests in window", () => {
        const r1 = limiter.check("user1");
        const r2 = limiter.check("user1");
        const r3 = limiter.check("user1");

        expect(r1.allowed).toBe(true);
        expect(r2.allowed).toBe(true);
        expect(r3.allowed).toBe(true);
    });

    it("blocks the (maxRequests + 1)th request", () => {
        limiter.check("user1");
        limiter.check("user1");
        limiter.check("user1");
        const r4 = limiter.check("user1");

        expect(r4.allowed).toBe(false);
        expect(r4.remaining).toBe(0);
    });

    it("returns correct remaining count", () => {
        const r1 = limiter.check("user1");
        expect(r1.remaining).toBe(2);

        const r2 = limiter.check("user1");
        expect(r2.remaining).toBe(1);

        const r3 = limiter.check("user1");
        expect(r3.remaining).toBe(0);
    });

    it("returns retryAfterMs > 0 when blocked", () => {
        limiter.check("user1");
        limiter.check("user1");
        limiter.check("user1");
        const blocked = limiter.check("user1");

        expect(blocked.retryAfterMs).toBeGreaterThan(0);
        expect(blocked.retryAfterMs).toBeLessThanOrEqual(10_000);
    });

    it("returns retryAfterMs = 0 when allowed", () => {
        const r = limiter.check("user1");
        expect(r.retryAfterMs).toBe(0);
    });

    it("isolates different keys", () => {
        limiter.check("user1");
        limiter.check("user1");
        limiter.check("user1");

        // user1 is at limit, but user2 should be unaffected
        const r = limiter.check("user2");
        expect(r.allowed).toBe(true);
        expect(r.remaining).toBe(2);
    });

    it("window slides — old entries expire", async () => {
        // Use a very short window for this test
        const fastLimiter = new RateLimiter({ windowMs: 100, maxRequests: 2 });

        fastLimiter.check("user1");
        fastLimiter.check("user1");
        const blocked = fastLimiter.check("user1");
        expect(blocked.allowed).toBe(false);

        // Wait for window to expire
        await new Promise((resolve) => setTimeout(resolve, 150));

        const afterExpiry = fastLimiter.check("user1");
        expect(afterExpiry.allowed).toBe(true);
        expect(afterExpiry.remaining).toBe(1);
    });

    it("reset clears a specific key", () => {
        limiter.check("user1");
        limiter.check("user1");
        limiter.check("user1");

        limiter.reset("user1");

        const afterReset = limiter.check("user1");
        expect(afterReset.allowed).toBe(true);
        expect(afterReset.remaining).toBe(2);
    });

    it("resetAll clears all keys", () => {
        limiter.check("user1");
        limiter.check("user1");
        limiter.check("user1");
        limiter.check("user2");
        limiter.check("user2");
        limiter.check("user2");

        limiter.resetAll();

        expect(limiter.check("user1").allowed).toBe(true);
        expect(limiter.check("user2").allowed).toBe(true);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Plan-based rate limiting (maxOverride)
// ═════════════════════════════════════════════════════════════════════════════

describe("plan-based rate limiting", () => {
    let limiter: RateLimiter;

    beforeEach(() => {
        limiter = new RateLimiter({ windowMs: 10_000, maxRequests: 5 });
    });

    it("FREE plan caps at 5 requests", () => {
        for (let i = 0; i < 5; i++) {
            expect(limiter.check("free-key", 5).allowed).toBe(true);
        }
        expect(limiter.check("free-key", 5).allowed).toBe(false);
    });

    it("PRO plan caps at 100 requests", () => {
        for (let i = 0; i < 100; i++) {
            expect(limiter.check("pro-key", 100).allowed).toBe(true);
        }
        expect(limiter.check("pro-key", 100).allowed).toBe(false);
    });

    it("maxOverride overrides instance default", () => {
        // Instance default is 5, but override to 2
        expect(limiter.check("override-key", 2).allowed).toBe(true);
        expect(limiter.check("override-key", 2).allowed).toBe(true);
        expect(limiter.check("override-key", 2).allowed).toBe(false);
    });

    it("separate buckets per key with different limits", () => {
        // Fill up free key
        for (let i = 0; i < 5; i++) {
            limiter.check("free-key", 5);
        }
        expect(limiter.check("free-key", 5).allowed).toBe(false);

        // Pro key on same limiter is still fine
        const proResult = limiter.check("pro-key", 100);
        expect(proResult.allowed).toBe(true);
        expect(proResult.remaining).toBe(99);
    });

    it("remaining reflects override limit", () => {
        const r1 = limiter.check("pro-key", 100);
        expect(r1.remaining).toBe(99);

        const r2 = limiter.check("free-key", 5);
        expect(r2.remaining).toBe(4);
    });
});
