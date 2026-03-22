import { z } from "zod";

// ─── Input size limits ───────────────────────────────────────────────────────

export const MAX_INPUT_CODE_LENGTH = 50_000;
export const MAX_LANGUAGE_LENGTH = 50;

// ─── Request schema ──────────────────────────────────────────────────────────

export const ReviewRequestSchema = z.object({
    code: z
        .string({ required_error: "code is required" })
        .min(1, "code must not be empty")
        .max(MAX_INPUT_CODE_LENGTH, `code must not exceed ${MAX_INPUT_CODE_LENGTH} characters`),
    language: z
        .string()
        .max(MAX_LANGUAGE_LENGTH, `language must not exceed ${MAX_LANGUAGE_LENGTH} characters`)
        .optional(),
    level: z.enum(["beginner", "advanced"]).optional(),
});

export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;
