// Phase 4: pure savings-goal progress math (no DB). All amounts are in the user's
// base currency. Kept pure like balance.ts / budget.ts for easy testing.

export type GoalProgress = {
  target: number;
  saved: number;
  remaining: number; // 0 once reached
  pct: number; // 0..1 (capped at 1 for display logic upstream if desired)
  complete: boolean;
  monthsLeft: number | null; // until deadline
  monthlyNeeded: number | null; // to hit target by the deadline
};

const round = (n: number) => Math.round(n * 100) / 100;

// Whole months from `now` to `deadline`, min 1 (so we never divide by zero and a
// due-this-month goal asks for the full remainder).
function monthsUntil(now: Date, deadline: Date): number {
  const months =
    (deadline.getUTCFullYear() - now.getUTCFullYear()) * 12 +
    (deadline.getUTCMonth() - now.getUTCMonth());
  return Math.max(1, months);
}

export function goalProgress(
  target: number,
  saved: number,
  deadline: Date | null,
  now: Date
): GoalProgress {
  const remaining = Math.max(0, target - saved);
  const complete = saved >= target && target > 0;
  let monthsLeft: number | null = null;
  let monthlyNeeded: number | null = null;
  if (deadline && !complete) {
    monthsLeft = monthsUntil(now, deadline);
    monthlyNeeded = round(remaining / monthsLeft);
  }
  return {
    target: round(target),
    saved: round(saved),
    remaining: round(remaining),
    pct: target > 0 ? round(saved / target) : 0,
    complete,
    monthsLeft,
    monthlyNeeded,
  };
}
