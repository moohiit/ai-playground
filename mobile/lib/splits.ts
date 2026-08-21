import type { SplitMode } from "./types";

export type SplitValue = { memberId: string; value: number };

/**
 * Client-side mirror of calculateSplits in modules/expense-tracker/balance.ts.
 *
 * The server is authoritative — this exists so the add-expense form can show
 * what each member will owe as the user types, rather than after a round trip.
 * Keep the two in step: the rounding rule (each part rounded to cents as it is
 * allocated, the last member taking the residue) is what guarantees the parts
 * sum to exactly the amount, and a divergence here would quietly promise a
 * different division from the one that gets saved.
 */
export function calculateSplits(
  amount: number,
  splitAmong: { memberId: string; name: string }[],
  mode: SplitMode = "equal",
  values?: SplitValue[]
): { memberId: string; name: string; amount: number }[] {
  if (splitAmong.length === 0) return [];
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const byId = new Map((values ?? []).map((v) => [v.memberId, v.value]));

  if (mode === "exact") {
    return splitAmong.map((m) => ({
      memberId: m.memberId,
      name: m.name,
      amount: round2(byId.get(m.memberId) ?? 0),
    }));
  }

  const weights = splitAmong.map((m) =>
    mode === "equal" ? 1 : Math.max(0, byId.get(m.memberId) ?? 0)
  );
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const effective = totalWeight > 0 ? weights : splitAmong.map(() => 1);
  const effectiveTotal = totalWeight > 0 ? totalWeight : splitAmong.length;

  let allocated = 0;
  return splitAmong.map((m, i) => {
    const isLast = i === splitAmong.length - 1;
    const amt = isLast
      ? round2(amount - allocated)
      : round2((effective[i] / effectiveTotal) * amount);
    allocated = round2(allocated + amt);
    return { memberId: m.memberId, name: m.name, amount: amt };
  });
}

/**
 * Mirror of splitValuesFromItems in modules/expense-tracker/balance.ts — see
 * the note on calculateSplits above for why a copy exists and what must stay
 * in step. The server recomputes this on save; this is for the live preview.
 */
export function splitValuesFromItems(
  amount: number,
  items: { price: number; quantity?: number; assignedTo?: string[] }[],
  splitAmong: { memberId: string }[]
): SplitValue[] {
  const ids = splitAmong.map((m) => m.memberId);
  if (ids.length === 0) return [];
  const totals = new Map<string, number>(ids.map((id) => [id, 0]));
  let itemsTotal = 0;
  for (const item of items) {
    const line = item.price * (item.quantity ?? 1);
    itemsTotal += line;
    const owners = (item.assignedTo ?? []).filter((id) => totals.has(id));
    const share = owners.length > 0 ? owners : ids;
    const each = line / share.length;
    for (const id of share) totals.set(id, (totals.get(id) ?? 0) + each);
  }
  const residual = (amount - itemsTotal) / ids.length;
  // Same residue rule as calculateSplits — see the server copy.
  let allocated = 0;
  return ids.map((id, i) => {
    const isLast = i === ids.length - 1;
    const raw = (totals.get(id) ?? 0) + residual;
    const value = isLast
      ? Math.round((amount - allocated) * 100) / 100
      : Math.round(raw * 100) / 100;
    allocated = Math.round((allocated + value) * 100) / 100;
    return { memberId: id, value };
  });
}

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
