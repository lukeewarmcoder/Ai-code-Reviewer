import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST() {
    try {
        const session = await auth();
        
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { message: "Unauthorized. Please log in first." } },
                { status: 401 }
            );
        }

        // Proxy to Express backend
        const backendUrl = process.env.API_URL?.replace("/api/review", "/api/stripe/checkout") || "http://localhost:3001/api/stripe/checkout";
        const internalKey = process.env.INTERNAL_API_KEY || "master_secret_key_123";

        const backendRes = await fetch(backendUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${internalKey}`,
            },
            body: JSON.stringify({ userId: session.user.id }),
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
