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

// ─── api_keys ────────────────────────────────────────────────────────────────

export const apiKeys = sqliteTable("api_keys", {
    id: text("id").primaryKey(),                           // UUID
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),                        // SHA-256 of raw key
    plan: text("plan").notNull().default("FREE"),            // FREE | PRO
    active: integer("active").notNull().default(1),            // 1 = active, 0 = revoked
    createdAt: integer("created_at").notNull(),                   // epoch ms
});

// ─── users (NextAuth) ────────────────────────────────────────────────────────

export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified"),                   // epoch ms or null
    image: text("image"),
    plan: text("plan").notNull().default("FREE"),              // FREE | PRO
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
});

// ─── accounts (NextAuth OAuth) ───────────────────────────────────────────────

export const accounts = sqliteTable("accounts", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
});
