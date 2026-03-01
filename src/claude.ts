import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

// ─── Resolve paths ───────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILLS_PATH = resolve(__dirname, "..", "skills.md");

// ─── Load system prompt once at module init ──────────────────────────────────

let systemPrompt: string;
try {
    systemPrompt = readFileSync(SKILLS_PATH, "utf-8");
} catch (err) {
    throw new Error(
        `[claude] Failed to load skills.md from ${SKILLS_PATH}: ${err instanceof Error ? err.message : String(err)
        }`
    );
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MODEL = "claude-opus-4-20250514" as const;
const MAX_TOKENS = 16_384;
const TEMPERATURE = 0;

// ─── Zod schema — mirrors skills.md STRICT OUTPUT CONTRACT ───────────────────

const ComplexitySchema = z.object({
    time: z.string(),
    space: z.string(),
    explanation: z.string(),
});

const AIReviewResultSchema = z.object({
    bugs: z.array(z.string()),
    complexity: ComplexitySchema,
    cleanCode: z.array(z.string()),
    security: z.array(z.string()),
    optimization: z.array(z.string()),
    improvedCode: z.string(),
});

// ─── Public types ────────────────────────────────────────────────────────────

export interface AIReviewResult {
    bugs: string[];
    complexity: {
        time: string;
        space: string;
        explanation: string;
    };
    cleanCode: string[];
    security: string[];
    optimization: string[];
    improvedCode: string;
}

// ─── Structured error ────────────────────────────────────────────────────────

export type AIReviewErrorCode =
    | "API_ERROR"
    | "EMPTY_RESPONSE"
    | "JSON_PARSE_ERROR"
    | "VALIDATION_FAILED"
    | "UNKNOWN";

export class AIReviewError extends Error {
    public readonly code: AIReviewErrorCode;
    public readonly raw?: string;

    constructor(code: AIReviewErrorCode, message: string, raw?: string) {
        super(message);
        this.name = "AIReviewError";
        this.code = code;
        this.raw = raw;
        Object.setPrototypeOf(this, AIReviewError.prototype);
    }

    public toJSON(): { error: true; code: AIReviewErrorCode; message: string } {
        return { error: true, code: this.code, message: this.message };
    }
}

// ─── Anthropic client (lazy singleton) ───────────────────────────────────────

let client: Anthropic | null = null;

function getClient(): Anthropic {
    if (!client) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey || apiKey.trim().length === 0) {
            throw new AIReviewError(
                "API_ERROR",
                "ANTHROPIC_API_KEY is missing or empty. Set it in your .env file."
            );
        }
        client = new Anthropic({ apiKey });
    }
    return client;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractTextContent(
    response: Anthropic.Messages.Message
): string {
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
        throw new AIReviewError(
            "EMPTY_RESPONSE",
            "Claude returned no text content."
        );
    }
    return textBlock.text.trim();
}

function extractJSON(raw: string): string {
    // Strip markdown fences if Claude accidentally wraps output
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();

    // Try to find a top-level JSON object
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
        return raw.slice(start, end + 1);
    }

    return raw;
}

function parseAndValidate(raw: string): AIReviewResult {
    const jsonStr = extractJSON(raw);

    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonStr);
    } catch {
        throw new AIReviewError(
            "JSON_PARSE_ERROR",
            "Claude response is not valid JSON.",
            jsonStr
        );
    }

    const result = AIReviewResultSchema.safeParse(parsed);
    if (!result.success) {
        const issues = result.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
        throw new AIReviewError(
            "VALIDATION_FAILED",
            `Zod validation failed: ${issues}`,
            jsonStr
        );
    }

    return result.data;
}

// ─── Core review function ────────────────────────────────────────────────────

export async function reviewCode(
    code: string,
    language?: string
): Promise<AIReviewResult> {
    if (!code || code.trim().length === 0) {
        throw new AIReviewError("API_ERROR", "Code input cannot be empty.");
    }

    const anthropic = getClient();

    const userMessage = language
        ? `Review the following ${language} code:\n\n${code}`
        : `Review the following code:\n\n${code}`;

    const messages: Anthropic.Messages.MessageParam[] = [
        { role: "user", content: userMessage },
    ];

    // ── First attempt ──────────────────────────────────────────────────────────

    let response: Anthropic.Messages.Message;
    try {
        response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            temperature: TEMPERATURE,
            system: systemPrompt,
            messages,
        });
    } catch (err) {
        throw new AIReviewError(
            "API_ERROR",
            `Anthropic API call failed: ${err instanceof Error ? err.message : String(err)
            }`
        );
    }

    const rawText = extractTextContent(response);

    try {
        return parseAndValidate(rawText);
    } catch (firstError) {
        // ── Retry once — ask Claude to fix its own output ────────────────────────

        const retryMessages: Anthropic.Messages.MessageParam[] = [
            ...messages,
            { role: "assistant", content: rawText },
            {
                role: "user",
                content: [
                    "Your previous response was not valid JSON conforming to the required schema.",
                    "Please return ONLY valid JSON matching this exact schema, with no markdown or commentary:",
                    "",
                    '{ "bugs": string[], "complexity": { "time": string, "space": string, "explanation": string }, "cleanCode": string[], "security": string[], "optimization": string[], "improvedCode": string }',
                    "",
                    "All fields are required. Arrays must be empty if no issues found. Strings must never be null.",
                ].join("\n"),
            },
        ];

        let retryResponse: Anthropic.Messages.Message;
        try {
            retryResponse = await anthropic.messages.create({
                model: MODEL,
                max_tokens: MAX_TOKENS,
                temperature: TEMPERATURE,
                system: systemPrompt,
                messages: retryMessages,
            });
        } catch (err) {
            throw new AIReviewError(
                "API_ERROR",
                `Anthropic API retry call failed: ${err instanceof Error ? err.message : String(err)
                }`
            );
        }

        const retryText = extractTextContent(retryResponse);

        try {
            return parseAndValidate(retryText);
        } catch (secondError) {
            // Both attempts failed — throw the second error with full context
            if (secondError instanceof AIReviewError) {
                throw secondError;
            }
            throw new AIReviewError(
                "VALIDATION_FAILED",
                `Both attempts produced invalid output. Last error: ${secondError instanceof Error ? secondError.message : String(secondError)
                }`,
                retryText
            );
        }
    }
}

// ─── CLI entry point for manual testing ──────────────────────────────────────

const isMainModule =
    typeof process !== "undefined" &&
    process.argv[1] &&
    (process.argv[1].endsWith("claude.ts") ||
        process.argv[1].endsWith("claude.js"));

if (isMainModule) {
    const sampleCode = `
function findMax(arr) {
  let max = 0;
  for (let i = 0; i <= arr.length; i++) {
    if (arr[i] > max) {
      max = arr[i];
    }
  }
  return max;
}
`;

    console.log("🔍 Reviewing sample code with Claude Opus 4...\n");
    reviewCode(sampleCode, "javascript")
        .then((result) => {
            console.log(JSON.stringify(result, null, 2));
        })
        .catch((err) => {
            if (err instanceof AIReviewError) {
                console.error(JSON.stringify(err.toJSON(), null, 2));
            } else {
                console.error("Unexpected error:", err);
            }
            process.exit(1);
        });
}
