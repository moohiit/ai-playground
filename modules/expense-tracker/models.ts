import mongoose, { Schema, type Model, type Types } from "mongoose";

export type MemberDoc = {
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
};

export type GroupDoc = {
  _id: Types.ObjectId;
  name: string;
  description: string;
  createdBy: string;
  members: MemberDoc[];
  createdAt: Date;
  updatedAt: Date;
};

const memberSchema = new Schema<MemberDoc>(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const groupSchema = new Schema<GroupDoc>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    createdBy: { type: String, required: true, index: true },
    members: { type: [memberSchema], default: [] },
  },
  { timestamps: true }
);

groupSchema.index({ "members.userId": 1 });

export const Group: Model<GroupDoc> =
  (mongoose.models.Group as Model<GroupDoc>) ||
  mongoose.model<GroupDoc>("Group", groupSchema);

export type SplitEntry = {
  memberId: string;
  name: string;
  amount: number;
};

export type ExpenseItem = {
  name: string;
  quantity: number;
  price: number;
};

export type ExpenseDoc = {
  _id: Types.ObjectId;
  type: "personal" | "group";
  direction: "expense" | "income";
  groupId: Types.ObjectId | null;
  createdBy: string;
  paidBy: { id: string; name: string };
  amount: number;
  // Phase 1B: currency the amount was entered in, and the amount converted to the
  // creator's base currency (frozen at write). Pre-1B rows lack both → treated as
  // base-currency at read time (amountBase falls back to amount).
  currency: string;
  amountBase: number;
  // Phase 1C: which personal account/wallet the money moved through (optional).
  accountId: Types.ObjectId | null;
  description: string;
  category: string;
  date: Date;
  splitAmong: { memberId: string; name: string }[];
  splits: SplitEntry[];
  items: ExpenseItem[];
  receiptUrl: string | null;
  rawExtraction: Record<string, unknown> | null;
  settledAt: Date | null;
  settlementId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const splitEntrySchema = new Schema<SplitEntry>(
  {
    memberId: { type: String, required: true },
    name: { type: String, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const expenseItemSchema = new Schema<ExpenseItem>(
  {
    name: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    price: { type: Number, required: true },
  },
  { _id: false }
);

const expenseSchema = new Schema<ExpenseDoc>(
  {
    type: { type: String, enum: ["personal", "group"], required: true },
    // Phase 1A: income tracking. Defaults to "expense"; pre-existing rows with no
    // field are treated as "expense" at read time (no migration required).
    direction: {
      type: String,
      enum: ["expense", "income"],
      default: "expense",
      index: true,
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      default: null,
      index: true,
    },
    createdBy: { type: String, required: true, index: true },
    paidBy: {
      id: { type: String, required: true },
      name: { type: String, required: true },
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    amountBase: { type: Number, default: null },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },
    description: { type: String, required: true },
    category: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    splitAmong: [
      {
        memberId: { type: String, required: true },
        name: { type: String, required: true },
        _id: false,
      },
    ],
    splits: { type: [splitEntrySchema], default: [] },
    items: { type: [expenseItemSchema], default: [] },
    receiptUrl: { type: String, default: null },
    rawExtraction: { type: Schema.Types.Mixed, default: null },
    settledAt: { type: Date, default: null, index: true },
    settlementId: { type: String, default: null },
  },
  { timestamps: true }
);

expenseSchema.index({ date: -1, groupId: 1 });

export const Expense: Model<ExpenseDoc> =
  (mongoose.models.Expense as Model<ExpenseDoc>) ||
  mongoose.model<ExpenseDoc>("Expense", expenseSchema);

// Per-user preferences for the expense tracker. Scaffolded in Phase 0 so Phase 1B
// (multi-currency) has a home for `baseCurrency`. `baseCurrency` defaults to "INR" for
// continuity with the current ₹-hardcoded UI; Phase 1B replaces the implicit default with
// an explicit onboarding selection (Decision D-3: user picks, no silent INR assumption).
export type UserPrefsDoc = {
  _id: Types.ObjectId;
  userId: string;
  baseCurrency: string;
  locale: string;
  weekStart: number; // 0 = Sunday, 1 = Monday
  createdAt: Date;
  updatedAt: Date;
};

const userPrefsSchema = new Schema<UserPrefsDoc>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    baseCurrency: { type: String, default: "INR" },
    locale: { type: String, default: "en-IN" },
    weekStart: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export const UserPrefs: Model<UserPrefsDoc> =
  (mongoose.models.UserPrefs as Model<UserPrefsDoc>) ||
  mongoose.model<UserPrefsDoc>("UserPrefs", userPrefsSchema);

// Phase 1C: accounts / wallets (personal-only, D-6). Balances are tracked in the
// user's BASE currency — openingBalance is entered in base, and transaction sums use
// `amountBase`. Per-account foreign currency is a future enhancement (1C.2); the
// `currency` field is stored for forward-compatibility and defaults to the base.
export type AccountKind = "cash" | "bank" | "card" | "wallet";

export type AccountDoc = {
  _id: Types.ObjectId;
  userId: string;
  name: string;
  kind: AccountKind;
  currency: string;
  openingBalance: number;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const accountSchema = new Schema<AccountDoc>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    kind: {
      type: String,
      enum: ["cash", "bank", "card", "wallet"],
      default: "bank",
    },
    currency: { type: String, default: "INR" },
    openingBalance: { type: Number, default: 0 },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Account: Model<AccountDoc> =
  (mongoose.models.Account as Model<AccountDoc>) ||
  mongoose.model<AccountDoc>("Account", accountSchema);

// A transfer moves money between two of the user's accounts. It is NOT spending or
// income — it lives in its own collection so it never appears in expense/income
// reports, but it does affect account balances. `amount` is in the base currency.
export type TransferDoc = {
  _id: Types.ObjectId;
  userId: string;
  fromAccountId: Types.ObjectId;
  toAccountId: Types.ObjectId;
  amount: number;
  date: Date;
  note: string;
  createdAt: Date;
  updatedAt: Date;
};

const transferSchema = new Schema<TransferDoc>(
  {
    userId: { type: String, required: true, index: true },
    fromAccountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    toAccountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

export const Transfer: Model<TransferDoc> =
  (mongoose.models.Transfer as Model<TransferDoc>) ||
  mongoose.model<TransferDoc>("Transfer", transferSchema);

// Phase 2A: monthly budgets (personal-only, D-6). `amount` is in the user's base
// currency. scope "overall" caps total monthly spending; scope "category" caps one
// category. One budget per (user, scope, category) — enforced by a unique index.
export type BudgetScope = "overall" | "category";

export type BudgetDoc = {
  _id: Types.ObjectId;
  userId: string;
  scope: BudgetScope;
  category: string | null;
  amount: number;
  period: "monthly";
  rollover: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const budgetSchema = new Schema<BudgetDoc>(
  {
    userId: { type: String, required: true, index: true },
    scope: { type: String, enum: ["overall", "category"], required: true },
    category: { type: String, default: null },
    amount: { type: Number, required: true },
    period: { type: String, enum: ["monthly"], default: "monthly" },
    rollover: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// One overall budget + one budget per category per user.
budgetSchema.index({ userId: 1, scope: 1, category: 1 }, { unique: true });

export const Budget: Model<BudgetDoc> =
  (mongoose.models.Budget as Model<BudgetDoc>) ||
  mongoose.model<BudgetDoc>("Budget", budgetSchema);
