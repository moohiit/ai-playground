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
};

export type Group = {
  _id: string;
  name: string;
  description?: string;
  members: Member[];
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

export type SettlementRecord = {
  settlementId: string;
  settledAt: string;
  expenses: Expense[];
};

export type CategoryStat = { category: string; total: number; count: number };
export type MonthStat = {
  year: number;
  month: number;
  total: number;
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
  paidByMe: number;
  paidByOthers: number;
  personalTotal: number;
  groupTotal: number;
  averagePerDay: number;
  averagePerTransaction: number;
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
