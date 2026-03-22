import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";
import { createAnalyticsRepository } from "../db/analyticsRepository.js";
import type { ReviewHttpResponse } from "./review.controller.js";

// ─── Handler ─────────────────────────────────────────────────────────────────

export function handleAdminStatsRequest(): ReviewHttpResponse {
    const requestId = randomUUID();

    const baseHeaders: Record<string, string> = {
        "X-Request-Id": requestId,
        "Content-Type": "application/json",
    };

    try {
        const db = getDb();
        const analytics = createAnalyticsRepository(db);
        const stats = analytics.getSystemStats();

        return {
            status: 200,
            body: { success: true, data: stats },
            headers: baseHeaders,
        };
    } catch {
        return {
            status: 500,
            body: {
                success: false,
                error: {
                    code: "INTERNAL_ERROR",
                    message: "An unexpected error occurred. Please try again later.",
                },
            },
            headers: baseHeaders,
        };
    }
}
