import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

// ─── Database path ───────────────────────────────────────────────────────────

const DEFAULT_DB_PATH = resolve(process.cwd(), "data", "reviews.db");

// ─── Connection factory ──────────────────────────────────────────────────────

export function createDatabase(dbPath?: string) {
    const path = dbPath ?? (process.env.DATABASE_URL || DEFAULT_DB_PATH);

    // Ensure data directory exists (skip for :memory:)
    if (path !== ":memory:") {
        const dir = resolve(path, "..");
        mkdirSync(dir, { recursive: true });
    }

    const sqlite = new Database(path);

    // Performance pragmas
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("busy_timeout = 5000");
    sqlite.pragma("foreign_keys = ON");

    return drizzle(sqlite, { schema });
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _db: ReturnType<typeof createDatabase> | null = null;

export function getDb() {
    if (!_db) {
        _db = createDatabase();
    }
    return _db;
}

export function resetDb() {
    _db = null;
}

export type AppDatabase = ReturnType<typeof createDatabase>;
