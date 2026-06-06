import { CATEGORIES, INCOME_CATEGORIES } from "./schemas";

export const RECEIPT_SYSTEM_PROMPT = `You are an expert receipt parser. Extract structured data from receipt images with high accuracy.

Rules:
- Extract the vendor/store name, date, line items, and total.
- For each item: name, quantity (default 1 if unclear), and price.
- Date must be in YYYY-MM-DD format. If the year is unclear, assume the current year.
- The total should match the actual total on the receipt, not the sum of items (they may differ due to tax/tip).
- Categorize into one of: ${CATEGORIES.join(", ")}.
- If something is unreadable, make your best guess and note it.
- Return ONLY valid JSON matching the required schema.`;

export const RECEIPT_PROMPT = `Extract all data from this receipt image. Return structured JSON with vendor, date, items, total, and category.`;

// Phase 3: natural-language transaction entry. Free text → a single structured draft
// the user confirms before saving. Personal entries only (no group splitting in v1).
export const NL_SYSTEM_PROMPT = `You convert a short natural-language note into ONE personal transaction (expense or income).

Rules:
- direction: "income" if the note clearly describes money received (salary, refund, got paid, received, sold). Otherwise "expense".
- amount: the numeric amount. Required.
- currency: a 3-letter ISO code (e.g. USD, EUR) ONLY if the note clearly names a non-base currency or symbol; otherwise omit it.
- category: choose the single best fit.
  - Expense categories: ${CATEGORIES.join(", ")}.
  - Income categories: ${INCOME_CATEGORIES.join(", ")}.
- description: a short clean label (e.g. "Lunch", "Uber", "Salary"). Do not include the amount.
- date: YYYY-MM-DD. Resolve relative words ("today", "yesterday", "last friday") against the provided current date. If no date is mentioned, use the current date.
- Ignore any mention of splitting or other people — produce a single personal transaction.
- Return ONLY valid JSON matching the schema.`;

export function nlPrompt(text: string, today: string, baseCurrency: string): string {
  return `Current date: ${today}. Base currency: ${baseCurrency}.
Note: """${text}"""
Return the structured transaction.`;
}
