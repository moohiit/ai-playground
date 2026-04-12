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

export function calculateSplits(
  amount: number,
  splitAmong: { memberId: string; name: string }[]
): { memberId: string; name: string; amount: number }[] {
  if (splitAmong.length === 0) return [];
  const share = Math.round((amount / splitAmong.length) * 100) / 100;

  let remaining = amount;
  return splitAmong.map((m, i) => {
    const isLast = i === splitAmong.length - 1;
    const amt = isLast ? Math.round(remaining * 100) / 100 : share;
    remaining -= share;
    return { memberId: m.memberId, name: m.name, amount: amt };
  });
}

export function calculateBalances(expenses: ExpenseDoc[]): MemberBalance[] {
  const map = new Map<
    string,
    { name: string; totalPaid: number; totalOwed: number }
  >();

  for (const exp of expenses) {
    if (exp.type !== "group") continue;

    const payerId = exp.paidBy.id;
    if (!map.has(payerId)) {
      map.set(payerId, { name: exp.paidBy.name, totalPaid: 0, totalOwed: 0 });
    }
    map.get(payerId)!.totalPaid += exp.amount;

    for (const split of exp.splits) {
      if (!map.has(split.memberId)) {
        map.set(split.memberId, {
          name: split.name,
          totalPaid: 0,
          totalOwed: 0,
        });
      }
      map.get(split.memberId)!.totalOwed += split.amount;
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
