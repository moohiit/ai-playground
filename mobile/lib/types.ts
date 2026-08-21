// Client-side mirrors of the API response shapes. These intentionally cover
// only what the app renders. If you later extract the zod schemas from
// modules/expense-tracker into a shared, server-dep-free package, import the
// inferred types here instead.

export type ExpenseType = "personal" | "group";
export type Direction = "expense" | "income";

export type AccountKind = "cash" | "bank" | "card" | "wallet";

export type Account = {
  _id: string;
  name: string;
  kind: AccountKind;
  currency: string;
  openingBalance: number;
  balance: number;
  archived: boolean;
};

export type Goal = {
  _id: string;
  name: string;
  deadline: string | null;
  linkedAccountId: string | null;
  target: number;
  saved: number;
  remaining: number;
  pct: number;
  complete: boolean;
  monthsLeft: number | null;
  monthlyNeeded: number | null;
};

export type RecurringRule = {
  _id: string;
  template: {
    amount: number;
    currency: string;
    category: string;
    description: string;
    direction: Direction;
  };
  cadence: "weekly" | "monthly" | "yearly";
  nextRunAt: string;
  autoPost: boolean;
  active: boolean;
  endDate: string | null;
  due: boolean;
};

/** How a group expense is divided; see modules/expense-tracker/balance.ts. */
export type SplitMode = "equal" | "shares" | "exact" | "percent" | "items";

/** A receipt line. `assignedTo` drives the "by item" split. */
export type ExpenseItem = {
  name: string;
  quantity: number;
  price: number;
  assignedTo?: string[];
};

export type Expense = {
  _id: string;
  type: ExpenseType;
  direction?: Direction;
  currency?: string;
  amountBase?: number;
  accountId?: string | null;
  groupId?: string;
  paidBy: { id: string; name: string };
  amount: number;
  description: string;
  category: string;
  date: string;
  splitAmong?: { memberId: string; name: string }[];
  splits: { memberId: string; name: string; amount: number }[];
  // How `splits` was derived. Absent on rows written before unequal splits
  // existed — those are equal.
  splitMode?: SplitMode;
  splitValues?: { memberId: string; value: number }[];
  items?: ExpenseItem[];
  isSettlement?: boolean;
  // Set once the row has been swept into a settlement batch. Settled rows are
  // history: the API refuses to edit or delete them.
  settledAt?: string | null;
};

export type ExpenseListResponse = {
  expenses: Expense[];
  total: number;
  page: number;
  totalPages: number;
};

export type Member = {
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
  isGuest?: boolean;
};

export type Group = {
  _id: string;
  name: string;
  description?: string;
  createdBy: string;
  members: Member[];
  shareId?: string | null;
  // Newest expense recorded in the group; null when it has none yet. The list
  // API sorts on this, so the most recently used group comes back first.
  lastExpenseAt?: string | null;
};

export type Balance = {
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

export type SettlementTransfer = {
  from: { id: string; name: string };
  to: { id: string; name: string };
  amount: number;
  paidAt: string;
};

export type SettlementRecord = {
  settlementId: string;
  settledAt: string;
  expenses: Expense[];
  // Settle-up payments actually made before the batch closed. Empty for
  // batches closed with no individual payments, and for pre-existing batches
  // recorded before settlements were tracked — both fall back to the plan
  // recomputed from Paid − Share.
  transfers?: SettlementTransfer[];
};

export type CategoryStat = {
  category: string;
  total: number;
  // The viewer's slice of that category — personal rows in full, group rows
  // only for their split.
  myShare: number;
  count: number;
};
export type MonthStat = {
  year: number;
  month: number;
  total: number;
  // The viewer's slice of that month — personal rows in full, group rows only
  // for their split.
  myShare: number;
  count: number;
};
export type DayStat = { day: number; total: number; count: number };
export type GroupStat = {
  groupId: string;
  groupName: string;
  total: number;
  myShare: number;
  count: number;
};
export type PayerStat = { id: string; name: string; total: number; count: number };

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
  largest: {
    description: string;
    amount: number;
    date: string;
    paidBy: string;
    category: string;
  } | null;
  byCategory: CategoryStat[];
  byMonth: MonthStat[];
  byDayOfWeek: DayStat[];
  byGroup: GroupStat[];
  topPayers?: PayerStat[];
};

export const CATEGORIES = [
  "Food & Groceries",
  "Rent & Housing",
  "Utilities",
  "Transport",
  "Shopping",
  "Cosmetics & Personal Care",
  "Entertainment",
  "Health",
  "Education",
  "Subscriptions",
  "Other",
] as const;

export const INCOME_CATEGORIES = [
  "Salary",
  "Business",
  "Investments",
  "Freelance",
  "Gifts",
  "Refunds",
  "Other",
] as const;

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
