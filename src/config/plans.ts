// ─── Plan definitions ────────────────────────────────────────────────────────

export const PLAN_LIMITS = {
    FREE: 5,
    PRO: 100,
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;
