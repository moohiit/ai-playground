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
  groupId: Types.ObjectId | null;
  createdBy: string;
  paidBy: { id: string; name: string };
  amount: number;
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
