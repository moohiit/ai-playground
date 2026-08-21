import type { ExpenseDoc } from "./models";

export type MemberBalance = {
  memberId: string;
  name: string;
  totalPaid: number;
  totalOwed: number;
  netBalance: number;
};

export type Settlement = {
  from: { id: string; name: string };
  to: { id: string; name: string };
  amount: number;
};

/**
 * How an expense is divided among the members it is split with.
 *
 * - `equal`   — the same amount each (the historical behaviour, still default)
 * - `shares`  — weights, e.g. a couple counting double: 2 / 1 / 1
 * - `exact`   — an amount per member, entered directly
 * - `percent` — a percentage per member, summing to 100
 *
 * Leaving someone out entirely is not a mode: drop them from `splitAmong`.
 */
export type SplitMode = "equal" | "shares" | "exact" | "percent";

export type SplitValue = { memberId: string; value: number };

/**
 * Divide `amount` among `splitAmong`.
 *
 * Whatever the mode, the parts always sum to exactly `amount`: each part is
 * rounded to cents as it is allocated and the final member takes the residue,
 * so repeated rounding can never leave the group a cent short or over. For
 * `exact` the caller's numbers are authoritative (the schema already checks
 * they sum), so nothing is adjusted.
 */
export function calculateSplits(
  amount: number,
  splitAmong: { memberId: string; name: string }[],
  mode: SplitMode = "equal",
  values?: SplitValue[]
): { memberId: string; name: string; amount: number }[] {
  if (splitAmong.length === 0) return [];

  const byId = new Map((values ?? []).map((v) => [v.memberId, v.value]));

  if (mode === "exact") {
    return splitAmong.map((m) => ({
      memberId: m.memberId,
      name: m.name,
      amount: round2(byId.get(m.memberId) ?? 0),
    }));
  }

  // Weight per member for the proportional modes. `equal` is the same
  // calculation with every weight at 1, which keeps one code path for the
  // rounding rule rather than two that could drift apart.
  const weights = splitAmong.map((m) =>
    mode === "equal" ? 1 : Math.max(0, byId.get(m.memberId) ?? 0)
  );
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  // Every weight zero (or missing) would divide by zero; fall back to equal
  // rather than handing the whole amount to the last member.
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
 * Running balances per member, in the group's base-currency terms.
 *
 * Every figure is taken from `amountBase` — the amount frozen in base currency
 * at write time — with split amounts (stored in the ENTRY currency) scaled by
 * the same base/entry ratio getSummary uses. Summing the raw `amount` fields
 * added dollars to rupees in any group where two members entered expenses in
 * different currencies, and the settle-up plan derived from those balances
 * then told people to pay meaningless sums. For a single-currency group the
 * ratio is 1 and nothing changes.
 */
export function calculateBalances(expenses: ExpenseDoc[]): MemberBalance[] {
  const map = new Map<
    string,
    { name: string; totalPaid: number; totalOwed: number }
  >();

  for (const exp of expenses) {
    if (exp.type !== "group") continue;

    const baseAmt = exp.amountBase ?? exp.amount;
    const ratio = exp.amount > 0 ? baseAmt / exp.amount : 1;

    const payerId = exp.paidBy.id;
    if (!map.has(payerId)) {
      map.set(payerId, { name: exp.paidBy.name, totalPaid: 0, totalOwed: 0 });
    }
    map.get(payerId)!.totalPaid += baseAmt;

    for (const split of exp.splits) {
      if (!map.has(split.memberId)) {
        map.set(split.memberId, {
          name: split.name,
          totalPaid: 0,
          totalOwed: 0,
        });
      }
      map.get(split.memberId)!.totalOwed += split.amount * ratio;
    }
  }

  return Array.from(map.entries()).map(([memberId, data]) => ({
    memberId,
    name: data.name,
    totalPaid: round2(data.totalPaid),
    totalOwed: round2(data.totalOwed),
    netBalance: round2(data.totalPaid - data.totalOwed),
  }));
}

export function calculateSettlements(balances: MemberBalance[]): Settlement[] {
  const debtors = balances
    .filter((b) => b.netBalance < -0.01)
    .map((b) => ({ id: b.memberId, name: b.name, amount: -b.netBalance }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = balances
    .filter((b) => b.netBalance > 0.01)
    .map((b) => ({ id: b.memberId, name: b.name, amount: b.netBalance }))
    .sort((a, b) => b.amount - a.amount);

  const settlements: Settlement[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const transfer = Math.min(debtors[i].amount, creditors[j].amount);
    if (transfer > 0.01) {
      settlements.push({
        from: { id: debtors[i].id, name: debtors[i].name },
        to: { id: creditors[j].id, name: creditors[j].name },
        amount: round2(transfer),
      });
    }

    debtors[i].amount -= transfer;
    creditors[j].amount -= transfer;

    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }

  return settlements;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
