// Phase 2A: pure budget math (no DB). Given a monthly limit and what's been spent,
// produce the progress numbers + an alert status. All amounts are in the user's base
// currency. Kept pure so it's trivially unit-testable, like balance.ts.

export type BudgetStatus = "ok" | "warn" | "over";

export const WARN_THRESHOLD = 0.8; // 80% → warn
export const OVER_THRESHOLD = 1.0; // 100% → over

export function budgetStatus(spent: number, limit: number): BudgetStatus {
  if (limit <= 0) return "ok";
  const pct = spent / limit;
  if (pct >= OVER_THRESHOLD) return "over";
  if (pct >= WARN_THRESHOLD) return "warn";
  return "ok";
}

export type BudgetProgress = {
  limit: number;
  spent: number;
  remaining: number; // negative when over budget
  pct: number; // 0..1+ (spent / limit), 0 when limit is 0
  status: BudgetStatus;
};

export function evaluateBudget(limit: number, spent: number): BudgetProgress {
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    limit: round(limit),
    spent: round(spent),
    remaining: round(limit - spent),
    pct: limit > 0 ? round(spent / limit) : 0,
    status: budgetStatus(spent, limit),
  };
}
