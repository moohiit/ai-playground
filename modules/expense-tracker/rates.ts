// Phase 1B: foreign-exchange conversion for multi-currency expenses (Decision D-3).
// Provider: Frankfurter (https://www.frankfurter.app) — keyless, daily ECB rates.
// Rates are cached in-process for 12h; conversion freezes `amountBase` at write time
// so reports stay stable even if rates later move.

export { SUPPORTED_CURRENCIES, isSupportedCurrency, currencySymbol } from "./currencies";
export type { CurrencyCode } from "./currencies";

// In-process cache of "rates from <base>" → { TARGET: rate }. 12h TTL.
const TTL_MS = 12 * 60 * 60 * 1000;
const memCache = new Map<string, { fetchedAt: number; rates: Record<string, number> }>();

async function fetchRatesFrom(base: string): Promise<Record<string, number>> {
  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    // Frankfurter is daily data; let Next cache it for an hour too.
    next: { revalidate: 3600 },
  } as RequestInit);
  if (!res.ok) throw new Error(`FX rate fetch failed (${res.status})`);
  const data = (await res.json()) as { rates?: Record<string, number> };
  // The base→base rate isn't included by the API; add it explicitly.
  return { [base]: 1, ...(data.rates ?? {}) };
}

export async function getRatesFrom(base: string): Promise<Record<string, number>> {
  const cached = memCache.get(base);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.rates;
  try {
    const rates = await fetchRatesFrom(base);
    memCache.set(base, { fetchedAt: Date.now(), rates });
    return rates;
  } catch (err) {
    // A stale cached rate beats failing a save; only error if we have nothing.
    if (cached) return cached.rates;
    throw err;
  }
}

/**
 * Convert `amount` from one currency to another, rounded to 2 decimals.
 * Same-currency conversions short-circuit (no network call), so base-currency
 * entries never depend on the FX API.
 */
export async function convert(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  if (from === to) return amount;
  const rates = await getRatesFrom(from);
  const rate = rates[to];
  if (!rate || !isFinite(rate)) {
    throw new Error(`No exchange rate available for ${from} → ${to}`);
  }
  return Math.round(amount * rate * 100) / 100;
}
