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

export function formatMoney(amount: number, code = "INR"): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${currencySymbol(code)}${Math.abs(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
