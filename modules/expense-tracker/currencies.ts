// Pure, client-safe currency constants (no server/Node deps) so both the FX module
// (rates.ts) and UI components can import them without bundling server code.

// NOTE: codes here must be convertible by the FX provider (rates.ts uses
// Frankfurter, which serves ECB reference rates). AED was offered before but
// the ECB doesn't publish it — every AED conversion hard-failed, so picking
// it made expenses unsavable. Only list currencies Frankfurter can convert.
// (The symbol map below intentionally keeps extra entries so any historic
// rows in a removed currency still render.)
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

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

const SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  AED: "د.إ",
  SGD: "S$",
  CHF: "Fr",
  CNY: "¥",
};

export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? `${code} `;
}

/** Format an amount with its currency symbol, e.g. (2075, "INR") → "₹2,075.00". */
export function formatMoney(amount: number, code = "INR"): string {
  const sign = amount < 0 ? "-" : "";
  const sym = currencySymbol(code);
  return `${sign}${sym}${Math.abs(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
