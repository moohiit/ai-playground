// Mirror of modules/expense-tracker/currencies.ts for the mobile bundle.

// AED removed: the FX provider (Frankfurter/ECB) can't convert it, so
// selecting it made expenses unsavable. Symbol kept below for old rows.
export const SUPPORTED_CURRENCIES = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "AUD",
  "CAD",
  "SGD",
  "CHF",
  "CNY",
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

const SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  AED: "AED ",
  SGD: "S$",
  CHF: "Fr",
  CNY: "¥",
};

export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? `${code} `;
}

/**
 * Strict money-input parser. parseFloat silently truncated garbage:
 * "12,50" (Android decimal-comma keyboards) became 12 — losing the fraction —
 * and "12abc" became 12. A single comma between digits is treated as the
 * decimal separator; anything else non-numeric returns NaN so callers'
 * `!amt` validation rejects it.
 */
export function parseAmount(raw: string): number {
  let s = raw.trim();
  if (/^\d+,\d+$/.test(s)) s = s.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

export function formatMoney(amount: number, code = "INR"): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${currencySymbol(code)}${Math.abs(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
