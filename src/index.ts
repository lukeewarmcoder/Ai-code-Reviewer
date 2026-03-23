import express from "express";
import cors from "cors";
import { reviewRouter } from "./routes/review.routes.js";
import { historyRouter } from "./routes/history.routes.js";
import { stripeRouter } from "./routes/stripe.routes.js";
import { handleAdminStatsRequest } from "./controllers/admin.controller.js";
import { requireApiKey } from "./middleware/auth.middleware.js";
import type { ReviewHttpResponse } from "./controllers/review.controller.js";
import "dotenv/config";

// ─── Handler adapter ─────────────────────────────────────────────────────────

function sendHttpResponse(res: express.Response, result: ReviewHttpResponse): void {
    if (result.headers) {
        for (const [key, value] of Object.entries(result.headers)) {
            res.setHeader(key, value);
        }
    }
    res.status(result.status).json(result.body);
}

// ─── App ─────────────────────────────────────────────────────────────────────

export const app = express();

// ─── Security headers ────────────────────────────────────────────────────────

app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
});

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json({ limit: "100kb" }));

// Handle JSON parse errors
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && typeof err === "object" && "type" in err && (err as { type: string }).type === "entity.parse.failed") {
        res.status(400).json({
            success: false,
            error: { code: "INVALID_JSON", message: "Request body is not valid JSON." },
        });
        return;
    }
    next(err);
});

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use("/api/review", requireApiKey, reviewRouter);
app.use("/api/history", requireApiKey, historyRouter);
app.use("/api/stripe/checkout", requireApiKey, express.json(), stripeRouter);
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeRouter);

app.get("/api/admin/stats", requireApiKey, (_req, res) => {
    sendHttpResponse(res, handleAdminStatsRequest());
});

// ─── Health check ────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
});

// ─── 404 catch-all ───────────────────────────────────────────────────────────

app.use((_req, res) => {
    res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Endpoint not found." },
    });
});

// ─── Start server (only when run directly) ───────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3001", 10);

const isMainModule =
    typeof process !== "undefined" &&
    process.argv[1] &&
    (process.argv[1].endsWith("index.ts") ||
        process.argv[1].endsWith("index.js") ||
        process.argv[1].endsWith("server.ts") ||
        process.argv[1].endsWith("server.js"));

if (isMainModule) {
    const server = app.listen(PORT, () => {
        console.log(`🚀 AI Code Review API listening on http://localhost:${PORT}`);
        console.log(`   POST /api/review`);
        console.log(`   GET  /api/admin/stats`);
        console.log(`   GET  /health`);
    });

    // ─── Graceful shutdown ───────────────────────────────────────────────────

    const shutdown = (signal: string) => {
        console.log(`\n📡 Received ${signal}. Shutting down gracefully...`);
        server.close(() => {
            console.log("✅ Server closed.");
            process.exit(0);
        });

        // Force exit after 10 seconds
        setTimeout(() => {
            console.error("⚠️  Forced shutdown after timeout.");
            process.exit(1);
        }, 10_000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
}
