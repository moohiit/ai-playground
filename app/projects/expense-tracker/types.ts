// Shape of GET /reports/summary, shared by every consumer.
//
// This was hand-copied into ReportsTab, GroupReport and ExportPdf, each with
// slightly different optionality — so a field added to getSummary had to be
// added in three places and the copies drifted (ExportPdf treated income as
// optional while ReportsTab required it, in files that hand data to each
// other). One definition, matching what getSummary actually returns.
export type CategoryEntry = {
  category: string;
  total: number;
  // The viewer's slice of that category — personal rows in full, group rows
  // only for their split.
  myShare: number;
  count: number;
};

export type MonthEntry = {
  year: number;
  month: number;
  total: number;
  myShare: number;
  count: number;
};

export type DayEntry = { day: number; total: number; count: number };

export type PayerEntry = { id: string; name: string; total: number; count: number };

export type GroupEntry = {
  groupId: string;
  groupName: string;
  total: number;
  myShare: number;
  count: number;
};

export type Largest = {
  description: string;
  amount: number;
  date: string;
  paidBy: string;
  category: string;
} | null;

export type Summary = {
  totalAmount: number;
  totalCount: number;
  incomeAmount: number;
  incomeCount: number;
  netAmount: number;
  myShare: number;
  // Entries the viewer is part of — the denominator for myAveragePerTransaction.
  myCount: number;
  paidByMe: number;
  paidByOthers: number;
  personalTotal: number;
  groupTotal: number;
  averagePerDay: number;
  averagePerTransaction: number;
  // The same averages restricted to the viewer's own share.
  myAveragePerDay: number;
  myAveragePerTransaction: number;
  daysCovered: number;
  largest: Largest;
  byCategory: CategoryEntry[];
  byMonth: MonthEntry[];
  byDayOfWeek: DayEntry[];
  byGroup: GroupEntry[];
  topPayers: PayerEntry[];
};

/** Cross-group "do I owe anyone right now" rollup, in the viewer's base currency. */
export type MyBalances = {
  owedToMe: number;
  iOwe: number;
  net: number;
  byPerson: { id: string; name: string; net: number }[];
  byGroup: {
    groupId: string;
    groupName: string;
    net: number;
    owedToMe: number;
    iOwe: number;
  }[];
};

/** Someone the viewer already shares a group with, for member suggestions. */
export type KnownPerson = {
  userId: string;
  name: string;
  email: string;
  sharedGroups: number;
};

/** What two group members have between them: shared expenses and the debt. */
export type PairBalance = {
  memberA: { id: string; name: string };
  memberB: { id: string; name: string };
  expenseCount: number;
  total: number;
  shareA: number;
  shareB: number;
  /** Positive = memberB owes memberA. */
  net: number;
  expenses: {
    _id: string;
    paidBy: { id: string; name: string };
    amount: number;
    amountBase?: number;
    currency?: string;
    description: string;
    category: string;
    date: string;
    splitAmong: { memberId: string; name: string }[];
    splits: { memberId: string; name: string; amount: number }[];
    isSettlement?: boolean;
    settledAt?: string | null;
  }[];
};
