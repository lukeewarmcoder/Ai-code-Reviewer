import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolve } from "node:path";
import Database from "better-sqlite3";

export async function POST(req: Request) {
    try {
        const session = await auth();
        
        if (!session?.user?.email) {
            return NextResponse.json(
                { success: false, error: { message: "Unauthorized. Please log in." } },
                { status: 401 }
            );
        }

        // Get user's plan directly from SQLite (NextAuth DrizzleAdapter uses it)
        const dbPath = resolve(process.cwd(), "..", "data", "reviews.db");
        const sqlite = new Database(dbPath, { readonly: true });
        const row = sqlite.prepare("SELECT plan FROM users WHERE email = ?").get(session.user.email) as { plan: string } | undefined;
        const plan = row?.plan || "FREE";
        sqlite.close();

        const body = await req.json();

        // Proxy to Express backend internally
        const backendUrl = process.env.API_URL || "http://localhost:3001/api/review";
        const internalKey = process.env.INTERNAL_API_KEY || "master_secret_key_123";

        // Forward client IP manually if available
        const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";

        const backendRes = await fetch(backendUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${internalKey}`,
                "X-Override-Plan": plan,
                "X-Forwarded-For": ip,
            },
            body: JSON.stringify(body),
        });

        const data = await backendRes.json();
        
        return NextResponse.json(data, { status: backendRes.status });

    } catch (error) {
        return NextResponse.json(
            { success: false, error: { message: error instanceof Error ? error.message : "Internal Server Error" } },
            { status: 500 }
        );
    }
}
