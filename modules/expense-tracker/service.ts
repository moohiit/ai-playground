import { connectDB } from "@/lib/db";
import { vision } from "@/lib/llm";
import type { JWTPayload } from "@/lib/auth";
import { User } from "@/models/User";
import { Group, Expense, type ExpenseDoc } from "./models";
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

// ── Groups ──────────────────────────────────────────

export async function createGroup(input: CreateGroupInput, auth: JWTPayload) {
  await connectDB();

  const allEmails = [...new Set(input.memberEmails.map((e) => e.toLowerCase()))];
  const users = await User.find({ email: { $in: allEmails } }).lean();

  const found = new Set(users.map((u) => u.email));
  const notFound = allEmails.filter((e) => !found.has(e));
  if (notFound.length > 0) {
    throw new Error(
      `These emails are not registered: ${notFound.join(", ")}. They need to create an account first.`
    );
  }

  const members = [
    { userId: auth.userId, name: auth.name, email: auth.email, isActive: true },
    ...users
      .filter((u) => u._id.toString() !== auth.userId)
      .map((u) => ({
        userId: u._id.toString(),
        name: u.name,
        email: u.email,
        isActive: true,
      })),
  ];

  const group = await Group.create({
    name: input.name,
    description: input.description,
    createdBy: auth.userId,
    members,
  });
  return group.toObject();
}

export async function listGroups(auth: JWTPayload) {
  await connectDB();
  return Group.find({ "members.userId": auth.userId })
    .sort({ createdAt: -1 })
    .lean();
}

export async function getGroup(id: string, auth: JWTPayload) {
  await connectDB();
  const group = await Group.findById(id).lean();
  if (!group) throw new Error("Group not found");
  if (!group.members.some((m) => m.userId === auth.userId)) {
    throw new Error("You are not a member of this group");
  }
  return group;
}

export async function updateGroup(
  id: string,
  data: { name?: string; description?: string },
  auth: JWTPayload
) {
  await connectDB();
  const group = await Group.findById(id);
  if (!group) throw new Error("Group not found");
  if (group.createdBy !== auth.userId) {
    throw new Error("Only the group creator can update it");
  }
  Object.assign(group, data);
  await group.save();
  return group.toObject();
}

export async function addMember(
  groupId: string,
  email: string,
  auth: JWTPayload
) {
  await connectDB();
  const group = await Group.findById(groupId);
  if (!group) throw new Error("Group not found");
  if (!group.members.some((m) => m.userId === auth.userId)) {
    throw new Error("You are not a member of this group");
  }

  const user = await User.findOne({ email: email.toLowerCase() }).lean();
  if (!user) throw new Error("User not found. They need to register first.");

  if (group.members.some((m) => m.userId === user._id.toString())) {
    throw new Error("User is already in this group");
  }

  group.members.push({
    userId: user._id.toString(),
    name: user.name,
    email: user.email,
    isActive: true,
  });
  await group.save();
  return group.toObject();
}

export async function removeMember(
  groupId: string,
  memberId: string,
  auth: JWTPayload
) {
  await connectDB();
  const group = await Group.findById(groupId);
  if (!group) throw new Error("Group not found");
  if (group.createdBy !== auth.userId) {
    throw new Error("Only the group creator can remove members");
  }
  group.members = group.members.filter(
    (m) => m.userId !== memberId
  ) as typeof group.members;
  await group.save();
  return group.toObject();
}

export async function deleteGroup(id: string, auth: JWTPayload) {
  await connectDB();
  const group = await Group.findById(id);
  if (!group) throw new Error("Group not found");
  if (group.createdBy !== auth.userId) {
    throw new Error("Only the group creator can delete it");
  }
  await Expense.deleteMany({ groupId: id });
  await Group.findByIdAndDelete(id);
}

// ── Expenses ────────────────────────────────────────

export async function createExpense(
  input: CreateExpenseInput,
  auth: JWTPayload
) {
  await connectDB();

  let splitAmong = input.splitAmong ?? [];
  let splits: { memberId: string; name: string; amount: number }[] = [];

  if (input.type === "group" && input.groupId) {
    const group = await Group.findById(input.groupId).lean();
    if (!group) throw new Error("Group not found");
    if (!group.members.some((m) => m.userId === auth.userId)) {
      throw new Error("You are not a member of this group");
    }

    if (splitAmong.length === 0) {
      splitAmong = group.members
        .filter((m) => m.isActive)
        .map((m) => ({ memberId: m.userId, name: m.name }));
    }

    splits = calculateSplits(input.amount, splitAmong);
  }

  const expense = await Expense.create({
    type: input.type,
    groupId: input.groupId ?? null,
    createdBy: auth.userId,
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

export async function listExpenses(
  filter: ExpenseFilter,
  auth: JWTPayload
) {
  await connectDB();

  if (filter.groupId) {
    const group = await Group.findById(filter.groupId).lean();
    if (!group || !group.members.some((m) => m.userId === auth.userId)) {
      throw new Error("Group not found or access denied");
    }
  }

  const query: Record<string, unknown> = {};

  if (filter.groupId) {
    query.groupId = filter.groupId;
  } else if (filter.type === "personal") {
    query.createdBy = auth.userId;
    query.type = "personal";
  } else if (filter.type === "group") {
    const userGroups = await Group.find(
      { "members.userId": auth.userId },
      { _id: 1 }
    ).lean();
    query.groupId = { $in: userGroups.map((g) => g._id) };
  } else {
    const userGroups = await Group.find(
      { "members.userId": auth.userId },
      { _id: 1 }
    ).lean();
    query.$or = [
      { createdBy: auth.userId, type: "personal" },
      { groupId: { $in: userGroups.map((g) => g._id) } },
    ];
  }

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
    Expense.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(filter.limit)
      .lean(),
    Expense.countDocuments(query),
  ]);

  return {
    expenses,
    total,
    page: filter.page,
    totalPages: Math.ceil(total / filter.limit),
  };
}

export async function deleteExpense(id: string, auth: JWTPayload) {
  await connectDB();
  const expense = await Expense.findById(id);
  if (!expense) throw new Error("Expense not found");

  if (expense.type === "group" && expense.groupId) {
    const group = await Group.findById(expense.groupId).lean();
    if (!group || !group.members.some((m) => m.userId === auth.userId)) {
      throw new Error("Access denied");
    }
  } else if (expense.createdBy !== auth.userId) {
    throw new Error("Access denied");
  }

  await Expense.findByIdAndDelete(id);
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

export async function getSummary(
  filter: ReportFilter,
  auth: JWTPayload
) {
  await connectDB();

  const match: Record<string, unknown> = {};

  if (filter.groupId) {
    const group = await Group.findById(filter.groupId).lean();
    if (!group || !group.members.some((m) => m.userId === auth.userId)) {
      throw new Error("Group not found or access denied");
    }
    match.groupId = group._id;
  } else {
    const userGroups = await Group.find(
      { "members.userId": auth.userId },
      { _id: 1 }
    ).lean();
    match.$or = [
      { createdBy: auth.userId, type: "personal" },
      { groupId: { $in: userGroups.map((g) => g._id) } },
    ];
  }

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
      {
        $group: {
          _id: "$category",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]),
    Expense.aggregate([
      { $match: match },
      {
        $group: {
          _id: { year: { $year: "$date" }, month: { $month: "$date" } },
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
    byCategory: byCategory.map(
      (c: { _id: string; total: number; count: number }) => ({
        category: c._id,
        total: Math.round(c.total * 100) / 100,
        count: c.count,
      })
    ),
    byMonth: byMonth.map(
      (m: {
        _id: { year: number; month: number };
        total: number;
        count: number;
      }) => ({
        year: m._id.year,
        month: m._id.month,
        total: Math.round(m.total * 100) / 100,
        count: m.count,
      })
    ),
  };
}

export async function getGroupBalances(
  groupId: string,
  auth: JWTPayload
): Promise<{ balances: MemberBalance[]; settlements: Settlement[] }> {
  await connectDB();

  const group = await Group.findById(groupId).lean();
  if (!group || !group.members.some((m) => m.userId === auth.userId)) {
    throw new Error("Group not found or access denied");
  }

  const expenses = await Expense.find({ groupId, type: "group" }).lean();
  const balances = calculateBalances(expenses as ExpenseDoc[]);
  const settlements = calculateSettlements(balances);

  return { balances, settlements };
}
