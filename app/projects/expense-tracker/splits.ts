import type { SplitMode } from "../../../modules/expense-tracker/balance";

/**
 * Labels for the split modes. The maths itself comes straight from
 * modules/expense-tracker/balance.ts — the web client shares the server's
 * implementation, so the live preview cannot drift from what gets saved.
 * (Mobile keeps its own copy in mobile/lib/splits.ts, since the Expo project
 * cannot import from this one.)
 */
export const SPLIT_MODES: { id: SplitMode; label: string }[] = [
  { id: "equal", label: "Equally" },
  { id: "shares", label: "By shares" },
  { id: "exact", label: "Exact amounts" },
  { id: "percent", label: "By percent" },
  { id: "items", label: "By item" },
];

export const SPLIT_HINT: Record<SplitMode, string> = {
  equal: "",
  shares: "Shares per person (a couple counting double is 2)",
  exact: "Amount per person",
  percent: "Percent per person",
  items: "Tap the people each line is for — anything left unassigned is shared",
};

/** Short label for a non-equal split, shown on expense rows. */
export const SPLIT_LABEL: Record<SplitMode, string> = {
  equal: "equally",
  shares: "by shares",
  exact: "exact amounts",
  percent: "by percent",
  items: "by item",
};
