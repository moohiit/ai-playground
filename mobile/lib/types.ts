// Client-side mirrors of the API response shapes. These intentionally cover
// only what the app renders. If you later extract the zod schemas from
// modules/expense-tracker into a shared, server-dep-free package, import the
// inferred types here instead.

export type ExpenseType = "personal" | "group";

export type Expense = {
  _id: string;
  type: ExpenseType;
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

export type Summary = {
  totalAmount: number;
  totalCount: number;
  myShare: number;
  personalTotal: number;
  groupTotal: number;
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
