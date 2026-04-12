import { connectDB } from "@/lib/db";
import { vision } from "@/lib/llm";
import { Group, Expense, type GroupDoc, type ExpenseDoc } from "./models";
import {
  type CreateGroupInput,
  type CreateExpenseInput,
  type ExpenseFilter,
  type ReportFilter,
  type ReceiptResult,
  geminiReceiptSchema,
  receiptResultSchema,
} from "./schemas";
import {
  calculateSplits,
  calculateBalances,
  calculateSettlements,
  type MemberBalance,
  type Settlement,
} from "./balance";
import { RECEIPT_SYSTEM_PROMPT, RECEIPT_PROMPT } from "./prompts";
import crypto from "crypto";

// ── Groups ──────────────────────────────────────────

export async function createGroup(input: CreateGroupInput) {
  await connectDB();
  const members = input.members.map((m) => ({
    id: crypto.randomUUID(),
    name: m.name,
    isActive: true,
  }));
  const group = await Group.create({
    name: input.name,
    description: input.description,
    members,
  });
  return group.toObject();
}

export async function listGroups() {
  await connectDB();
  return Group.find().sort({ createdAt: -1 }).lean();
}

export async function getGroup(id: string) {
  await connectDB();
  const group = await Group.findById(id).lean();
  if (!group) throw new Error("Group not found");
  return group;
}

export async function updateGroup(
  id: string,
  data: { name?: string; description?: string }
) {
  await connectDB();
  const group = await Group.findByIdAndUpdate(id, data, { new: true }).lean();
  if (!group) throw new Error("Group not found");
  return group;
}

export async function addMember(groupId: string, name: string) {
  await connectDB();
  const member = { id: crypto.randomUUID(), name, isActive: true };
  const group = await Group.findByIdAndUpdate(
    groupId,
    { $push: { members: member } },
    { new: true }
  ).lean();
  if (!group) throw new Error("Group not found");
  return group;
}

export async function removeMember(groupId: string, memberId: string) {
  await connectDB();
  const group = await Group.findByIdAndUpdate(
    groupId,
    { $pull: { members: { id: memberId } } },
    { new: true }
  ).lean();
  if (!group) throw new Error("Group not found");
  return group;
}

export async function deleteGroup(id: string) {
  await connectDB();
  await Expense.deleteMany({ groupId: id });
  await Group.findByIdAndDelete(id);
}

// ── Expenses ────────────────────────────────────────

export async function createExpense(input: CreateExpenseInput) {
  await connectDB();

  let splitAmong = input.splitAmong ?? [];
  let splits: { memberId: string; name: string; amount: number }[] = [];

  if (input.type === "group" && input.groupId) {
    const group = await Group.findById(input.groupId).lean();
    if (!group) throw new Error("Group not found");

    if (splitAmong.length === 0) {
      splitAmong = group.members
        .filter((m) => m.isActive)
        .map((m) => ({ memberId: m.id, name: m.name }));
    }

    splits = calculateSplits(input.amount, splitAmong);
  }

  const expense = await Expense.create({
    type: input.type,
    groupId: input.groupId ?? null,
    paidBy: input.paidBy,
    amount: input.amount,
    description: input.description,
    category: input.category,
    date: new Date(input.date),
    splitAmong,
    splits,
    items: input.items ?? [],
  });

  return expense.toObject();
}

export async function listExpenses(filter: ExpenseFilter) {
  await connectDB();

  const query: Record<string, unknown> = {};
  if (filter.groupId) query.groupId = filter.groupId;
  if (filter.type) query.type = filter.type;
  if (filter.category) query.category = filter.category;
  if (filter.dateFrom || filter.dateTo) {
    query.date = {};
    if (filter.dateFrom)
      (query.date as Record<string, unknown>).$gte = new Date(filter.dateFrom);
    if (filter.dateTo)
      (query.date as Record<string, unknown>).$lte = new Date(filter.dateTo);
  }

  const skip = (filter.page - 1) * filter.limit;
  const [expenses, total] = await Promise.all([
    Expense.find(query).sort({ date: -1 }).skip(skip).limit(filter.limit).lean(),
    Expense.countDocuments(query),
  ]);

  return {
    expenses,
    total,
    page: filter.page,
    totalPages: Math.ceil(total / filter.limit),
  };
}

export async function deleteExpense(id: string) {
  await connectDB();
  const result = await Expense.findByIdAndDelete(id);
  if (!result) throw new Error("Expense not found");
}

// ── Receipt scanning ────────────────────────────────

export async function scanReceipt(
  imageBase64: string,
  mimeType: string
): Promise<ReceiptResult> {
  const raw = await vision({
    prompt: RECEIPT_PROMPT,
    imageBase64,
    mimeType,
    system: RECEIPT_SYSTEM_PROMPT,
    responseSchema: geminiReceiptSchema,
  });

  const parsed = receiptResultSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Failed to parse receipt: ${parsed.error.message}`);
  }
  return parsed.data;
}

// ── Reports ─────────────────────────────────────────

export async function getSummary(filter: ReportFilter) {
  await connectDB();

  const match: Record<string, unknown> = {};
  if (filter.groupId) match.groupId = filter.groupId;
  if (filter.dateFrom || filter.dateTo) {
    match.date = {};
    if (filter.dateFrom)
      (match.date as Record<string, unknown>).$gte = new Date(filter.dateFrom);
    if (filter.dateTo)
      (match.date as Record<string, unknown>).$lte = new Date(filter.dateTo);
  }

  const [byCategory, byMonth] = await Promise.all([
    Expense.aggregate([
      { $match: match },
      { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    Expense.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
          },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
  ]);

  const totalAmount = byCategory.reduce(
    (sum: number, c: { total: number }) => sum + c.total,
    0
  );
  const totalCount = byCategory.reduce(
    (sum: number, c: { count: number }) => sum + c.count,
    0
  );

  return {
    totalAmount: Math.round(totalAmount * 100) / 100,
    totalCount,
    byCategory: byCategory.map((c: { _id: string; total: number; count: number }) => ({
      category: c._id,
      total: Math.round(c.total * 100) / 100,
      count: c.count,
    })),
    byMonth: byMonth.map(
      (m: { _id: { year: number; month: number }; total: number; count: number }) => ({
        year: m._id.year,
        month: m._id.month,
        total: Math.round(m.total * 100) / 100,
        count: m.count,
      })
    ),
  };
}

export async function getGroupBalances(
  groupId: string
): Promise<{ balances: MemberBalance[]; settlements: Settlement[] }> {
  await connectDB();

  const expenses = await Expense.find({ groupId, type: "group" }).lean();
  const balances = calculateBalances(expenses as ExpenseDoc[]);
  const settlements = calculateSettlements(balances);

  return { balances, settlements };
}
