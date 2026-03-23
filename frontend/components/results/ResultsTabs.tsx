"use client";

import { useState } from "react";
import { Bug, BarChart3, Shield, Sparkles, Rocket } from "lucide-react";
import { clsx } from "clsx";
import { motion, AnimatePresence } from "framer-motion";

interface AIReviewResult {
    bugs: string[];
    complexity: { time: string; space: string; explanation: string };
    cleanCode: string[];
    security: string[];
    optimization: string[];
    improvedCode: string;
    qualityScore?: number;
}

const TABS = [
    { key: "bugs", label: "Bugs", icon: Bug, color: "text-red-400" },
    { key: "complexity", label: "Complexity", icon: BarChart3, color: "text-yellow-400" },
    { key: "security", label: "Security", icon: Shield, color: "text-orange-400" },
    { key: "cleanCode", label: "Clean Code", icon: Sparkles, color: "text-green-400" },
    { key: "optimized", label: "Optimized", icon: Rocket, color: "text-blue-400" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ResultsTabs({ data }: { data: AIReviewResult }) {
    const [active, setActive] = useState<TabKey>("bugs");

    return (
        <div className="flex flex-col gap-4">
            {/* Quality Score */}
            {data.qualityScore != null && (
                <div className="flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-3">
                    <span className="text-sm text-gray-400">Quality Score</span>
                    <span
                        className={clsx(
                            "text-2xl font-bold",
                            data.qualityScore >= 80
                                ? "text-green-400"
                                : data.qualityScore >= 50
                                  ? "text-yellow-400"
                                  : "text-red-400"
                        )}
                    >
                        {data.qualityScore}/100
                    </span>
                </div>
            )}

            {/* Tab Bar */}
            <div className="flex gap-1 rounded-xl border border-gray-700 bg-gray-900 p-1">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActive(tab.key)}
                            className={clsx(
                                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition",
                                active === tab.key
                                    ? "bg-gray-800 text-white shadow"
                                    : "text-gray-400 hover:text-gray-200"
                            )}
                        >
                            <Icon className={clsx("h-3.5 w-3.5", active === tab.key && tab.color)} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={active}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="rounded-xl border border-gray-700 bg-gray-900 p-5"
                >
                    {active === "bugs" && (
                        <ListSection items={data.bugs} emptyMsg="No bugs detected! 🎉" />
                    )}
                    {active === "complexity" && (
                        <div className="space-y-3 text-sm">
                            <div className="flex gap-6">
                                <Pill label="Time" value={data.complexity.time} />
                                <Pill label="Space" value={data.complexity.space} />
                            </div>
                            <p className="text-gray-300 leading-relaxed">
                                {data.complexity.explanation}
                            </p>
                        </div>
                    )}
                    {active === "security" && (
                        <ListSection items={data.security} emptyMsg="No security issues found! 🔒" />
                    )}
                    {active === "cleanCode" && (
                        <ListSection items={data.cleanCode} emptyMsg="Code is already clean! ✨" />
                    )}
                    {active === "optimized" && (
                        <div className="space-y-3">
                            {data.optimization.length > 0 && (
                                <ListSection items={data.optimization} emptyMsg="" />
                            )}
                            {data.improvedCode && (
                                <pre className="overflow-x-auto rounded-lg bg-gray-950 p-4 text-sm text-green-300">
                                    <code>{data.improvedCode}</code>
                                </pre>
                            )}
                            {!data.improvedCode && data.optimization.length === 0 && (
                                <p className="text-gray-400 text-sm">No optimizations suggested.</p>
                            )}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

function ListSection({ items, emptyMsg }: { items: string[]; emptyMsg: string }) {
    if (items.length === 0)
        return <p className="text-gray-400 text-sm">{emptyMsg}</p>;
    return (
        <ul className="space-y-2">
            {items.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-200">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                    {item}
                </li>
            ))}
        </ul>
    );
}

function Pill({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg bg-gray-800 px-3 py-1.5">
            <span className="text-xs text-gray-400">{label}</span>
            <p className="font-mono text-sm font-semibold text-white">{value}</p>
        </div>
    );
}
