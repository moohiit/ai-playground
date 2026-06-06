// Phase 3: pure month-end spend projection (no DB). Projects this month's total
// personal spending from the month-to-date run rate. Upcoming known recurring bills
// are surfaced separately by the service so the number stays simple and honest.

export type Forecast = {
  monthToDate: number;
  daysElapsed: number;
  daysInMonth: number;
  remainingDays: number;
  dailyRate: number;
  projectedTotal: number; // run-rate projection for the full month
};

const round = (n: number) => Math.round(n * 100) / 100;

export function projectMonthEnd(
  monthToDate: number,
  daysElapsed: number,
  daysInMonth: number
): Forecast {
  const safeElapsed = Math.max(1, daysElapsed);
  const dailyRate = monthToDate / safeElapsed;
  return {
    monthToDate: round(monthToDate),
    daysElapsed,
    daysInMonth,
    remainingDays: Math.max(0, daysInMonth - daysElapsed),
    dailyRate: round(dailyRate),
    projectedTotal: round(dailyRate * daysInMonth),
  };
}
