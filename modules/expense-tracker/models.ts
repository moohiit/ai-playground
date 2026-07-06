import mongoose, { Schema, type Model, type Types } from "mongoose";

export type MemberDoc = {
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
  // Guest members have no account: a synthetic userId (`guest:...`) and no email.
  isGuest?: boolean;
};

export type GroupDoc = {
  _id: Types.ObjectId;
  name: string;
  description: string;
  createdBy: string;
  members: MemberDoc[];
  // Phase 4B: random token for a public read-only "who owes whom" link (null = off).
  shareId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const memberSchema = new Schema<MemberDoc>(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    isGuest: { type: Boolean, default: false },
  },
  { _id: false }
);

const groupSchema = new Schema<GroupDoc>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    createdBy: { type: String, required: true, index: true },
    members: { type: [memberSchema], default: [] },
    shareId: { type: String, default: null, index: true },
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
  // Phase 2B: links a transaction generated from a recurring rule back to it.
  recurringId: Types.ObjectId | null;
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
    recurringId: {
      type: Schema.Types.ObjectId,
      ref: "RecurringRule",
      default: null,
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
  expoPushToken: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const userPrefsSchema = new Schema<UserPrefsDoc>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    baseCurrency: { type: String, default: "INR" },
    locale: { type: String, default: "en-IN" },
    weekStart: { type: Number, default: 1 },
    expoPushToken: { type: String, default: null },
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

// Phase 2B: recurring rules (rent, subscriptions, EMIs). Personal-only (D-6). The
// `template` is the transaction to create each period. `nextRunAt` is the next due
// date; `autoPost` rules are materialized by the daily cron, others wait for the
// user to confirm. Generated expenses carry `recurringId` back to the rule.
export type RecurringCadence = "weekly" | "monthly" | "yearly";

export type RecurringTemplate = {
  amount: number;
  currency: string;
  category: string;
  description: string;
  direction: "expense" | "income";
  accountId: Types.ObjectId | null;
};

export type RecurringRuleDoc = {
  _id: Types.ObjectId;
  userId: string;
  template: RecurringTemplate;
  cadence: RecurringCadence;
  nextRunAt: Date;
  lastRunAt: Date | null;
  autoPost: boolean;
  active: boolean;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const recurringTemplateSchema = new Schema<RecurringTemplate>(
  {
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    category: { type: String, required: true },
    description: { type: String, required: true },
    direction: { type: String, enum: ["expense", "income"], default: "expense" },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
  },
  { _id: false }
);

const recurringRuleSchema = new Schema<RecurringRuleDoc>(
  {
    userId: { type: String, required: true, index: true },
    template: { type: recurringTemplateSchema, required: true },
    cadence: {
      type: String,
      enum: ["weekly", "monthly", "yearly"],
      default: "monthly",
    },
    nextRunAt: { type: Date, required: true, index: true },
    lastRunAt: { type: Date, default: null },
    autoPost: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    endDate: { type: Date, default: null },
  },
  { timestamps: true }
);

export const RecurringRule: Model<RecurringRuleDoc> =
  (mongoose.models.RecurringRule as Model<RecurringRuleDoc>) ||
  mongoose.model<RecurringRuleDoc>("RecurringRule", recurringRuleSchema);

// Phase 4: savings goals (personal, base currency). Either manual (`savedAmount` the
// user tops up) or linked to an account (progress = that account's live balance).
export type GoalDoc = {
  _id: Types.ObjectId;
  userId: string;
  name: string;
  target: number;
  savedAmount: number;
  deadline: Date | null;
  linkedAccountId: Types.ObjectId | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const goalSchema = new Schema<GoalDoc>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    target: { type: Number, required: true },
    savedAmount: { type: Number, default: 0 },
    deadline: { type: Date, default: null },
    linkedAccountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Goal: Model<GoalDoc> =
  (mongoose.models.Goal as Model<GoalDoc>) ||
  mongoose.model<GoalDoc>("Goal", goalSchema);

// Phase 4 (last): warranty / return-window tracker. Linked to a receipt-scanned
// expense via expenseId (optional). returnByDate tracks the store's return window;
// warrantyExpiresAt tracks the manufacturer warranty end date. Both are optional so
// the user can track either, neither, or both.
export type WarrantyDoc = {
  _id: Types.ObjectId;
  userId: string;
  expenseId: Types.ObjectId | null;
  label: string;
  purchaseDate: Date;
  returnByDate: Date | null;
  warrantyExpiresAt: Date | null;
  notes: string;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const warrantySchema = new Schema<WarrantyDoc>(
  {
    userId: { type: String, required: true, index: true },
    expenseId: { type: Schema.Types.ObjectId, ref: "Expense", default: null },
    label: { type: String, required: true },
    purchaseDate: { type: Date, required: true },
    returnByDate: { type: Date, default: null },
    warrantyExpiresAt: { type: Date, default: null },
    notes: { type: String, default: "" },
    archived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export const Warranty: Model<WarrantyDoc> =
  (mongoose.models.Warranty as Model<WarrantyDoc>) ||
  mongoose.model<WarrantyDoc>("Warranty", warrantySchema);

// Money notes: informal lent/borrowed money tracked OUTSIDE the ledger —
// "gave Rahul 2000 for the concert, he'll return it by the 15th". Not an
// expense (it's expected back) and not a group split (the other person needs
// no account). settledAt records when it was actually returned/paid back.
export type MoneyNoteDoc = {
  _id: Types.ObjectId;
  userId: string;
  direction: "lent" | "borrowed";
  personName: string;
  amount: number;
  currency: string;
  description: string;
  givenOn: Date;
  dueBy: Date | null;
  settledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const moneyNoteSchema = new Schema<MoneyNoteDoc>(
  {
    userId: { type: String, required: true, index: true },
    direction: { type: String, enum: ["lent", "borrowed"], default: "lent" },
    personName: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    description: { type: String, default: "" },
    givenOn: { type: Date, required: true },
    dueBy: { type: Date, default: null },
    settledAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

export const MoneyNote: Model<MoneyNoteDoc> =
  (mongoose.models.MoneyNote as Model<MoneyNoteDoc>) ||
  mongoose.model<MoneyNoteDoc>("MoneyNote", moneyNoteSchema);

// Simple personal to-do list (money chores: "pay electricity bill",
// "ask Rahul for the 2000 back").
export type TodoDoc = {
  _id: Types.ObjectId;
  userId: string;
  text: string;
  done: boolean;
  doneAt: Date | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const todoSchema = new Schema<TodoDoc>(
  {
    userId: { type: String, required: true, index: true },
    text: { type: String, required: true },
    done: { type: Boolean, default: false, index: true },
    doneAt: { type: Date, default: null },
    dueDate: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Todo: Model<TodoDoc> =
  (mongoose.models.Todo as Model<TodoDoc>) ||
  mongoose.model<TodoDoc>("Todo", todoSchema);
