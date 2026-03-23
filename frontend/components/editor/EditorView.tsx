"use client";

import { useState, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { Play, Loader2 } from "lucide-react";

const LANGUAGES = [
    { value: "javascript", label: "JavaScript" },
    { value: "python", label: "Python" },
    { value: "java", label: "Java" },
    { value: "cpp", label: "C++" },
    { value: "typescript", label: "TypeScript" },
];

interface EditorViewProps {
    onResult: (data: Record<string, unknown>) => void;
    onError: (msg: string) => void;
}

export default function EditorView({ onResult, onError }: EditorViewProps) {
    const [code, setCode] = useState("// Paste your code here\n");
    const [language, setLanguage] = useState("javascript");
    const [loading, setLoading] = useState(false);

    const handleSubmit = useCallback(async () => {
        if (!code.trim()) return;
        setLoading(true);
        try {
            const res = await fetch(
                process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/review",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code, language }),
                }
            );
            const json = await res.json();
            if (!res.ok) {
                onError(json?.error?.message ?? `Error ${res.status}`);
            } else {
                onResult(json.data);
            }
        } catch (err) {
            onError(err instanceof Error ? err.message : "Network error");
        } finally {
            setLoading(false);
        }
    }, [code, language, onResult, onError]);

    return (
        <div className="flex flex-col gap-4">
            {/* Controls */}
            <div className="flex items-center gap-3">
                <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
                >
                    {LANGUAGES.map((l) => (
                        <option key={l.value} value={l.value}>
                            {l.label}
                        </option>
                    ))}
                </select>

                <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow hover:from-blue-700 hover:to-indigo-700 transition disabled:opacity-50"
                >
                    {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Play className="h-4 w-4" />
                    )}
                    {loading ? "Reviewing…" : "Review Code"}
                </button>
            </div>

            {/* Monaco Editor */}
            <div className="overflow-hidden rounded-xl border border-gray-700">
                <Editor
                    height="420px"
                    language={language === "cpp" ? "cpp" : language}
                    theme="vs-dark"
                    value={code}
                    onChange={(v) => setCode(v ?? "")}
                    options={{
                        fontSize: 14,
                        minimap: { enabled: false },
                        padding: { top: 16 },
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                    }}
                />
            </div>
        </div>
    );
}
