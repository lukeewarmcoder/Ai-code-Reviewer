import { z } from "zod";

// ─── Replicate the Zod schema from claude.ts for offline validation ──────────

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

// ─── Test helpers ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.error(`  ❌ ${label}`);
        failed++;
    }
}

// ─── Test: valid payload passes Zod ──────────────────────────────────────────

console.log("\n🧪 Test Suite: AIReviewResult Zod Schema\n");

const validPayload = {
    bugs: ["Off-by-one error in loop boundary"],
    complexity: {
        time: "O(n)",
        space: "O(1)",
        explanation: "Single pass through the array.",
    },
    cleanCode: ["Rename 'max' to 'maxValue' for clarity"],
    security: [],
    optimization: ["Initialize max to -Infinity instead of 0"],
    improvedCode: 'function findMax(arr: number[]): number { return Math.max(...arr); }',
};

const validResult = AIReviewResultSchema.safeParse(validPayload);
assert(validResult.success === true, "Valid payload passes schema");

// ─── Test: missing field fails ───────────────────────────────────────────────

const missingField = { ...validPayload } as Record<string, unknown>;
delete missingField.bugs;
const missingResult = AIReviewResultSchema.safeParse(missingField);
assert(missingResult.success === false, "Missing 'bugs' field fails schema");

// ─── Test: wrong type fails ─────────────────────────────────────────────────

const wrongType = { ...validPayload, bugs: "not an array" };
const wrongResult = AIReviewResultSchema.safeParse(wrongType);
assert(wrongResult.success === false, "Wrong type for 'bugs' fails schema");

// ─── Test: empty arrays valid ────────────────────────────────────────────────

const emptyArrays = {
    bugs: [],
    complexity: { time: "O(1)", space: "O(1)", explanation: "Constant." },
    cleanCode: [],
    security: [],
    optimization: [],
    improvedCode: "",
};
const emptyResult = AIReviewResultSchema.safeParse(emptyArrays);
assert(emptyResult.success === true, "Empty arrays are valid per schema");

// ─── Test: extra keys are stripped (Zod default passthrough) ────────────────

const extraKeys = { ...validPayload, rogue: "should be ignored" };
const extraResult = AIReviewResultSchema.safeParse(extraKeys);
assert(extraResult.success === true, "Extra keys do not cause failure");

// ─── Test: null string fails ────────────────────────────────────────────────

const nullString = { ...validPayload, improvedCode: null };
const nullResult = AIReviewResultSchema.safeParse(nullString);
assert(nullResult.success === false, "Null string field fails schema");

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
