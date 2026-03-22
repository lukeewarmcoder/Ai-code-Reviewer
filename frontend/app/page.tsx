"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle } from "lucide-react";
import ResultsTabs from "@/components/ResultsTabs";

// Monaco must be loaded client‑side only (no SSR)
const EditorView = dynamic(() => import("@/components/EditorView"), { ssr: false });

export default function Home() {
    const [result, setResult] = useState<Record<string, unknown> | null>(null);
    const [error, setError] = useState<string | null>(null);

    return (
        <main className="min-h-screen bg-gray-950 text-white">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        🧠 AI Code Reviewer
                    </h1>
                    <p className="text-sm text-gray-400 mt-0.5">
                        Paste your code, pick a language, and get instant AI-powered feedback.
                    </p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={async () => {
                            const res = await fetch("/api/stripe/checkout", { method: "POST" });
                            const json = await res.json();
                            if (json.url) window.location.href = json.url;
                            else alert(json.error?.message || "Checkout failed");
                        }}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-700 transition"
                    >
                        ⚡ Upgrade to PRO
                    </button>
                    <a
                        href="/api/auth/signin" // NextAuth default sign-in page
                        className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-semibold hover:bg-gray-700 transition"
                    >
                        Account
                    </a>
                </div>
            </header>

            {/* Main Grid */}
            <div className="mx-auto grid max-w-7xl gap-6 p-6 lg:grid-cols-2">
                {/* Left: Editor */}
                <section>
                    <EditorView
                        onResult={(data) => {
                            setResult(data);
                            setError(null);
                        }}
                        onError={(msg) => {
                            setError(msg);
                            setResult(null);
                        }}
                    />
                </section>

                {/* Right: Results */}
                <section>
                    {error && (
                        <div className="flex items-center gap-2 rounded-xl border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            {error}
                        </div>
                    )}

                    {result && !error && (
                        <ResultsTabs
                            data={result as {
                                bugs: string[];
                                complexity: { time: string; space: string; explanation: string };
                                cleanCode: string[];
                                security: string[];
                                optimization: string[];
                                improvedCode: string;
                                qualityScore?: number;
                            }}
                        />
                    )}

                    {!result && !error && (
                        <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-gray-700 p-12 text-center text-gray-500">
                            <p>Results will appear here after you review your code.</p>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
