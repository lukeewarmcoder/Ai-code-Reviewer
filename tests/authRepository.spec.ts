import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { createDatabase, type AppDatabase } from "../src/db/index.js";
import { createAuthRepository } from "../src/db/authRepository.js";
import { apiKeys } from "../src/db/schema.js";

// ─── Test helpers ────────────────────────────────────────────────────────────

let db: AppDatabase;

function freshDb() {
    db = createDatabase(":memory:");

    db.run(sql`
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

// ═════════════════════════════════════════════════════════════════════════════
// createApiKey
// ═════════════════════════════════════════════════════════════════════════════

describe("createApiKey", () => {
    beforeEach(freshDb);

    it("returns a raw key of 64 hex characters (32 bytes)", () => {
        const auth = createAuthRepository(db);
        const { rawKey } = auth.createApiKey("test-key");

        expect(rawKey).toHaveLength(64);
        expect(/^[0-9a-f]{64}$/.test(rawKey)).toBe(true);
    });

    it("returns a UUID id", () => {
        const auth = createAuthRepository(db);
        const { id } = auth.createApiKey("test-key");

        expect(id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );
    });

    it("stores key_hash — never raw key", () => {
        const auth = createAuthRepository(db);
        const { rawKey } = auth.createApiKey("my-key");

        const rows = db.select().from(apiKeys).all();
        expect(rows).toHaveLength(1);

        const row = rows[0];
        expect(row.name).toBe("my-key");
        expect(row.keyHash).not.toBe(rawKey);
        expect(row.keyHash).toHaveLength(64); // SHA-256 hex
        expect(row.active).toBe(1);
        expect(row.createdAt).toBeGreaterThan(0);

        // Verify raw key is nowhere in the stored row
        const rowJson = JSON.stringify(row);
        expect(rowJson).not.toContain(rawKey);
    });

    it("generates unique keys each time", () => {
        const auth = createAuthRepository(db);
        const k1 = auth.createApiKey("key-1");
        const k2 = auth.createApiKey("key-2");

        expect(k1.rawKey).not.toBe(k2.rawKey);
        expect(k1.id).not.toBe(k2.id);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// validateApiKey
// ═════════════════════════════════════════════════════════════════════════════

describe("validateApiKey", () => {
    beforeEach(freshDb);

    it("returns { id, plan } for a valid active key", () => {
        const auth = createAuthRepository(db);
        const { id, rawKey } = auth.createApiKey("valid-key");

        const result = auth.validateApiKey(rawKey);
        expect(result).toEqual({ id, plan: "FREE" });
    });

    it("returns null for a random string", () => {
        const auth = createAuthRepository(db);
        auth.createApiKey("test-key");

        expect(auth.validateApiKey("not-a-real-key")).toBeNull();
    });

    it("returns null for empty string", () => {
        const auth = createAuthRepository(db);
        expect(auth.validateApiKey("")).toBeNull();
    });

    it("returns null when no keys exist", () => {
        const auth = createAuthRepository(db);
        expect(auth.validateApiKey("anything")).toBeNull();
    });

    it("returns null for a revoked key", () => {
        const auth = createAuthRepository(db);
        const { id, rawKey } = auth.createApiKey("revoked-key");

        auth.revokeApiKey(id);

        expect(auth.validateApiKey(rawKey)).toBeNull();
    });

    it("validates correct key among multiple keys", () => {
        const auth = createAuthRepository(db);
        const k1 = auth.createApiKey("key-1");
        const k2 = auth.createApiKey("key-2");
        const k3 = auth.createApiKey("key-3");

        expect(auth.validateApiKey(k1.rawKey)).toEqual({ id: k1.id, plan: "FREE" });
        expect(auth.validateApiKey(k2.rawKey)).toEqual({ id: k2.id, plan: "FREE" });
        expect(auth.validateApiKey(k3.rawKey)).toEqual({ id: k3.id, plan: "FREE" });
        expect(auth.validateApiKey("wrong-key")).toBeNull();
    });

    it("rejects key with single character difference", () => {
        const auth = createAuthRepository(db);
        const { rawKey } = auth.createApiKey("test-key");

        // Flip the last character
        const lastChar = rawKey[rawKey.length - 1];
        const flipped = lastChar === "a" ? "b" : "a";
        const tamperedKey = rawKey.slice(0, -1) + flipped;

        expect(auth.validateApiKey(tamperedKey)).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// revokeApiKey
// ═════════════════════════════════════════════════════════════════════════════

describe("revokeApiKey", () => {
    beforeEach(freshDb);

    it("sets active to 0", () => {
        const auth = createAuthRepository(db);
        const { id } = auth.createApiKey("to-revoke");

        auth.revokeApiKey(id);

        const rows = db.select().from(apiKeys).all();
        expect(rows[0].active).toBe(0);
    });

    it("does not affect other keys", () => {
        const auth = createAuthRepository(db);
        const k1 = auth.createApiKey("keep");
        const k2 = auth.createApiKey("revoke");

        auth.revokeApiKey(k2.id);

        expect(auth.validateApiKey(k1.rawKey)).toEqual({ id: k1.id, plan: "FREE" });
        expect(auth.validateApiKey(k2.rawKey)).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// plan assignment
// ═════════════════════════════════════════════════════════════════════════════

describe("plan assignment", () => {
    beforeEach(freshDb);

    it("defaults to FREE plan", () => {
        const auth = createAuthRepository(db);
        const { rawKey } = auth.createApiKey("default-plan");

        const result = auth.validateApiKey(rawKey);
        expect(result!.plan).toBe("FREE");
    });

    it("creates PRO key when specified", () => {
        const auth = createAuthRepository(db);
        const { rawKey } = auth.createApiKey("pro-key", "PRO");

        const result = auth.validateApiKey(rawKey);
        expect(result!.plan).toBe("PRO");
    });

    it("stores plan in database", () => {
        const auth = createAuthRepository(db);
        auth.createApiKey("free-key", "FREE");
        auth.createApiKey("pro-key", "PRO");

        const rows = db.select().from(apiKeys).all();
        expect(rows[0].plan).toBe("FREE");
        expect(rows[1].plan).toBe("PRO");
    });
});
