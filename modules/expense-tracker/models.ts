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
