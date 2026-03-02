import { sql } from "drizzle-orm";
import { reviews } from "./schema.js";
import type { AppDatabase } from "./index.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SystemStats {
    totalReviews: number;
    successRate: number;       // 0–1
    avgDurationMs: number;     // floor-rounded integer
    totalInputTokens: number;
    totalOutputTokens: number;
}

// ─── Repository ──────────────────────────────────────────────────────────────

export function createAnalyticsRepository(db: AppDatabase) {
    return {
        getSystemStats(): SystemStats {
            const row = db
                .select({
                    total: sql<number>`count(*)`,
                    successes: sql<number>`sum(case when ${reviews.status} = 'success' then 1 else 0 end)`,
                    avgDuration: sql<number>`avg(${reviews.durationMs})`,
                    sumInput: sql<number>`coalesce(sum(${reviews.inputTokens}), 0)`,
                    sumOutput: sql<number>`coalesce(sum(${reviews.outputTokens}), 0)`,
                })
                .from(reviews)
                .get()!;

            const total = row.total ?? 0;

            if (total === 0) {
                return {
                    totalReviews: 0,
                    successRate: 0,
                    avgDurationMs: 0,
                    totalInputTokens: 0,
                    totalOutputTokens: 0,
                };
            }

            return {
                totalReviews: total,
                successRate: (row.successes ?? 0) / total,
                avgDurationMs: Math.floor(row.avgDuration ?? 0),
                totalInputTokens: row.sumInput,
                totalOutputTokens: row.sumOutput,
            };
        },
    };
}

export type AnalyticsRepository = ReturnType<typeof createAnalyticsRepository>;
