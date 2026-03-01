import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ─── reviews ─────────────────────────────────────────────────────────────────

export const reviews = sqliteTable("reviews", {
    id: text("id").primaryKey(),                        // UUID from X-Request-Id
    clientIp: text("client_ip").notNull(),
    codeHash: text("code_hash").notNull(),                    // SHA-256, never raw code
    codeLength: integer("code_length").notNull(),
    language: text("language"),
    status: text("status", { enum: ["success", "error"] }).notNull(),
    errorCode: text("error_code"),                             // null on success
    result: text("result"),                                 // JSON.stringify(AIReviewResult)
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms").notNull(),
    createdAt: integer("created_at").notNull(),                // epoch ms (Date.now())
});

// ─── usage_logs ──────────────────────────────────────────────────────────────

export const usageLogs = sqliteTable("usage_logs", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clientIp: text("client_ip").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: integer("created_at").notNull(),                // epoch ms
});
