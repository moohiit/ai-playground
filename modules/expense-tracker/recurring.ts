// Phase 2B: pure date math for recurring rules (no DB, no Date.now()). Given a
// rule's `nextRunAt`, cadence, and a reference `now`, compute the occurrences that
// are due and the advanced `nextRunAt`. Kept pure like balance.ts / budget.ts.

export type Cadence = "weekly" | "monthly" | "yearly";

// Normalize to UTC midnight — recurring bills are date-granular.
function atUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysInMonth(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
}

// Advance a date by one cadence period. Month/year steps clamp the day so e.g.
// Jan 31 + 1 month → Feb 28/29 (and stays on month-ends thereafter is acceptable).
export function advance(date: Date, cadence: Cadence): Date {
  const d = atUtcMidnight(date);
  if (cadence === "weekly") {
    return new Date(d.getTime() + 7 * 86400000);
  }
  const day = d.getUTCDate();
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth();
  if (cadence === "monthly") {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  } else {
    year += 1; // yearly
  }
  const clampedDay = Math.min(day, daysInMonth(year, month));
  return new Date(Date.UTC(year, month, clampedDay));
}

/**
 * All due occurrence dates from `nextRunAt` up to and including `now`, plus the new
 * `nextRunAt` (first date strictly after `now`). Stops at `endDate` if given. `cap`
 * bounds runaway catch-up (e.g. a weekly rule untouched for years).
 */
export function dueOccurrences(
  nextRunAt: Date,
  cadence: Cadence,
  now: Date,
  endDate?: Date | null,
  cap = 120
): { dates: Date[]; nextRunAt: Date } {
  const limit = atUtcMidnight(now);
  const end = endDate ? atUtcMidnight(endDate) : null;
  const dates: Date[] = [];
  let cur = atUtcMidnight(nextRunAt);
  let i = 0;
  while (cur.getTime() <= limit.getTime() && (!end || cur.getTime() <= end.getTime()) && i < cap) {
    dates.push(cur);
    cur = advance(cur, cadence);
    i++;
  }
  return { dates, nextRunAt: cur };
}

// Is the rule due as of `now` (has at least one unposted occurrence)?
export function isDue(
  nextRunAt: Date,
  now: Date,
  active: boolean,
  endDate?: Date | null
): boolean {
  if (!active) return false;
  const next = atUtcMidnight(nextRunAt).getTime();
  const limit = atUtcMidnight(now).getTime();
  if (next > limit) return false;
  if (endDate && next > atUtcMidnight(endDate).getTime()) return false;
  return true;
}
