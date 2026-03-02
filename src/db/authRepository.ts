import { randomUUID, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { apiKeys } from "./schema.js";
import type { AppDatabase } from "./index.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashKey(rawKey: string): string {
    return createHash("sha256").update(rawKey).digest("hex");
}

// ─── Repository ──────────────────────────────────────────────────────────────

export function createAuthRepository(db: AppDatabase) {
    return {
        /**
         * Generate a new API key.
         * Returns the raw key (show to user ONCE) and the stored record ID.
         * The raw key is never stored — only its SHA-256 hash.
         */
        createApiKey(name: string): { id: string; rawKey: string } {
            const id = randomUUID();
            const rawKey = randomBytes(32).toString("hex");
            const keyHash = hashKey(rawKey);

            db.insert(apiKeys)
                .values({
                    id,
                    name,
                    keyHash,
                    active: 1,
                    createdAt: Date.now(),
                })
                .run();

            return { id, rawKey };
        },

        /**
         * Validate a raw API key using constant-time comparison.
         * Returns true if the key exists and is active.
         */
        validateApiKey(rawKey: string): boolean {
            const candidateHash = hashKey(rawKey);

            // Fetch all active key hashes
            const rows = db
                .select({ keyHash: apiKeys.keyHash })
                .from(apiKeys)
                .where(eq(apiKeys.active, 1))
                .all();

            // Constant-time comparison against each active key
            const candidateBuffer = Buffer.from(candidateHash, "hex");

            for (const row of rows) {
                const storedBuffer = Buffer.from(row.keyHash, "hex");
                if (
                    candidateBuffer.length === storedBuffer.length &&
                    timingSafeEqual(candidateBuffer, storedBuffer)
                ) {
                    return true;
                }
            }

            return false;
        },

        /**
         * Revoke a key by ID.
         */
        revokeApiKey(id: string): void {
            db.update(apiKeys)
                .set({ active: 0 })
                .where(eq(apiKeys.id, id))
                .run();
        },
    };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
