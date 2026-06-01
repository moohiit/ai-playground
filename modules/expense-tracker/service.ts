import { connectDB } from "@/lib/db";
import { vision } from "@/lib/llm";
import type { JWTPayload } from "@/lib/auth";
import { User } from "@/models/User";
import mongoose from "mongoose";
import { Group, Expense, type ExpenseDoc } from "./models";

function toObjectId(id: string, label = "ID"): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) {
    throw new Error(`Invalid ${label}: ${id}`);
  }
  return new mongoose.Types.ObjectId(id);
}
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

  if (input.type === "group") {
    if (!input.groupId) {
      throw new Error("A group is required for a group expense");
    }
    const group = await Group.findById(input.groupId).lean();
    if (!group) throw new Error("Group not found");
    if (!group.members.some((m) => m.userId === auth.userId)) {
      throw new Error("You are not a member of this group");
    }

    const memberIds = new Set(group.members.map((m) => m.userId));
    if (!memberIds.has(input.paidBy.id)) {
      throw new Error("Payer must be a member of the group");
    }

    if (splitAmong.length === 0) {
      splitAmong = group.members
        .filter((m) => m.isActive)
        .map((m) => ({ memberId: m.userId, name: m.name }));
    } else if (splitAmong.some((s) => !memberIds.has(s.memberId))) {
      throw new Error("Split members must belong to the group");
    }

    splits = calculateSplits(input.amount, splitAmong);
  } else {
    // Personal expenses never carry a group or splits.
    splitAmong = [];
  }

  const expense = await Expense.create({
    type: input.type,
    groupId: input.type === "group" ? input.groupId ?? null : null,
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

  if (filter.settled === "true") {
    query.settledAt = { $ne: null, $exists: true };
  } else if (filter.settled === "false") {
    query.$and = [
      ...(Array.isArray(query.$and) ? query.$and : []),
      { $or: [{ settledAt: null }, { settledAt: { $exists: false } }] },
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

export async function updateExpense(
  id: string,
  input: Partial<CreateExpenseInput>,
  auth: JWTPayload
) {
  await connectDB();
  const expense = await Expense.findById(id);
  if (!expense) throw new Error("Expense not found");

  // 1. Authorize access to the expense as it currently exists.
  if (expense.type === "group" && expense.groupId) {
    const group = await Group.findById(expense.groupId).lean();
    if (!group || !group.members.some((m) => m.userId === auth.userId)) {
      throw new Error("Access denied");
    }
  } else if (expense.createdBy !== auth.userId) {
    throw new Error("Access denied");
  }

  // 2. Determine the effective target (type/group) after this update.
  const newType = input.type ?? expense.type;
  const currentGroupId = expense.groupId ? expense.groupId.toString() : null;
  const newGroupId =
    input.groupId !== undefined ? input.groupId || null : currentGroupId;
  const movingOrConverting =
    newType !== expense.type || (newGroupId ?? null) !== currentGroupId;

  // Only the original creator may move/convert an expense across personal/groups.
  if (movingOrConverting && expense.createdBy !== auth.userId) {
    throw new Error("Only the creator can move this expense");
  }

  if (newType === "group") {
    if (!newGroupId) throw new Error("A group is required for a group expense");
    // 3. Re-authorize against the TARGET group + validate payer/split members.
    const target = await Group.findById(newGroupId).lean();
    if (!target || !target.members.some((m) => m.userId === auth.userId)) {
      throw new Error("Access denied");
    }
    const memberIds = new Set(target.members.map((m) => m.userId));

    const splitAmong = (input.splitAmong ??
      (expense.splitAmong as { memberId: string; name: string }[])) as {
      memberId: string;
      name: string;
    }[];
    const payer = input.paidBy ?? expense.paidBy;
    if (payer && !memberIds.has(payer.id)) {
      throw new Error("Payer must be a member of the group");
    }
    for (const s of splitAmong ?? []) {
      if (!memberIds.has(s.memberId)) {
        throw new Error("Split members must belong to the group");
      }
    }

    const amount = input.amount ?? expense.amount;
    expense.splitAmong = splitAmong as typeof expense.splitAmong;
    expense.splits = calculateSplits(amount, splitAmong ?? []);
    expense.groupId = toObjectId(newGroupId, "groupId");
  } else {
    // Personal expenses carry no group / splits.
    expense.groupId = null;
    expense.splitAmong = [] as typeof expense.splitAmong;
    expense.splits = [];
  }

  if (input.amount !== undefined) expense.amount = input.amount;
  if (input.description !== undefined) expense.description = input.description;
  if (input.category !== undefined) expense.category = input.category;
  if (input.date !== undefined) expense.date = new Date(input.date);
  if (input.paidBy !== undefined) expense.paidBy = input.paidBy;
  expense.type = newType;

  await expense.save();
  return expense.toObject();
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

  let jsonData: unknown;
  try {
    jsonData = JSON.parse(raw);
  } catch {
    throw new Error("Failed to parse receipt — AI returned invalid JSON. Try a clearer image.");
  }
  const parsed = receiptResultSchema.safeParse(jsonData);
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
  const groupNameById = new Map<string, string>();

  if (filter.groupId) {
    const group = await Group.findById(filter.groupId).lean();
    if (!group || !group.members.some((m) => m.userId === auth.userId)) {
      throw new Error("Group not found or access denied");
    }
    match.groupId = group._id;
    groupNameById.set(group._id.toString(), group.name);
  } else {
    const userGroups = await Group.find(
      { "members.userId": auth.userId },
      { _id: 1, name: 1 }
    ).lean();
    for (const g of userGroups) groupNameById.set(g._id.toString(), g.name);

    if (filter.scope === "personal") {
      match.createdBy = auth.userId;
      match.type = "personal";
    } else if (filter.scope === "group") {
      match.groupId = { $in: userGroups.map((g) => g._id) };
    } else {
      match.$or = [
        { createdBy: auth.userId, type: "personal" },
        { groupId: { $in: userGroups.map((g) => g._id) } },
      ];
    }
  }

  if (filter.category) match.category = filter.category;

  if (filter.dateFrom || filter.dateTo) {
    match.date = {};
    if (filter.dateFrom)
      (match.date as Record<string, unknown>).$gte = new Date(filter.dateFrom);
    if (filter.dateTo)
      (match.date as Record<string, unknown>).$lte = new Date(filter.dateTo);
  }

  if (filter.settled === "true") {
    match.settledAt = { $ne: null, $exists: true };
  } else if (filter.settled === "false") {
    match.$and = [
      ...((match.$and as unknown[]) ?? []),
      { $or: [{ settledAt: null }, { settledAt: { $exists: false } }] },
    ];
  }

  const expenses = await Expense.find(match).lean();
  const userId = auth.userId;
  const round = (n: number) => Math.round(n * 100) / 100;

  let totalAmount = 0;
  let myShare = 0;
  let paidByMe = 0;
  let personalTotal = 0;
  let groupTotal = 0;
  let largest: {
    description: string;
    amount: number;
    date: string;
    paidBy: string;
    category: string;
  } | null = null;

  const byCategoryMap = new Map<
    string,
    { category: string; total: number; count: number }
  >();
  const byMonthMap = new Map<
    string,
    { year: number; month: number; total: number; count: number }
  >();
  const byDayOfWeek = Array.from({ length: 7 }, (_, i) => ({
    day: i,
    total: 0,
    count: 0,
  }));
  const byGroupMap = new Map<
    string,
    {
      groupId: string;
      groupName: string;
      total: number;
      myShare: number;
      count: number;
    }
  >();
  const topPayersMap = new Map<
    string,
    { id: string; name: string; total: number; count: number }
  >();

  let minDate = Infinity;
  let maxDate = -Infinity;

  for (const e of expenses) {
    totalAmount += e.amount;

    if (e.paidBy?.id === userId) paidByMe += e.amount;

    if (e.type === "personal") {
      personalTotal += e.amount;
      myShare += e.amount;
    } else {
      groupTotal += e.amount;
      const myPart = (e.splits ?? []).find((s) => s.memberId === userId);
      if (myPart) myShare += myPart.amount;
    }

    if (!largest || e.amount > largest.amount) {
      largest = {
        description: e.description,
        amount: e.amount,
        date: new Date(e.date).toISOString(),
        paidBy: e.paidBy?.name ?? "-",
        category: e.category,
      };
    }

    const cat = byCategoryMap.get(e.category) ?? {
      category: e.category,
      total: 0,
      count: 0,
    };
    cat.total += e.amount;
    cat.count += 1;
    byCategoryMap.set(e.category, cat);

    const d = new Date(e.date);
    const t = d.getTime();
    if (t < minDate) minDate = t;
    if (t > maxDate) maxDate = t;

    const monthKey = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
    const m = byMonthMap.get(monthKey) ?? {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      total: 0,
      count: 0,
    };
    m.total += e.amount;
    m.count += 1;
    byMonthMap.set(monthKey, m);

    byDayOfWeek[d.getUTCDay()].total += e.amount;
    byDayOfWeek[d.getUTCDay()].count += 1;

    if (e.type === "group" && e.groupId && !filter.groupId) {
      const gid = e.groupId.toString();
      const gname = groupNameById.get(gid) ?? "Unknown";
      const g = byGroupMap.get(gid) ?? {
        groupId: gid,
        groupName: gname,
        total: 0,
        myShare: 0,
        count: 0,
      };
      g.total += e.amount;
      const myPart = (e.splits ?? []).find((s) => s.memberId === userId);
      if (myPart) g.myShare += myPart.amount;
      g.count += 1;
      byGroupMap.set(gid, g);
    }

    if (filter.groupId && e.paidBy) {
      const pid = e.paidBy.id;
      const p = topPayersMap.get(pid) ?? {
        id: pid,
        name: e.paidBy.name,
        total: 0,
        count: 0,
      };
      p.total += e.amount;
      p.count += 1;
      topPayersMap.set(pid, p);
    }
  }

  let days = 1;
  if (filter.dateFrom && filter.dateTo) {
    days = Math.max(
      1,
      Math.round(
        (new Date(filter.dateTo).getTime() -
          new Date(filter.dateFrom).getTime()) /
          86400000
      ) + 1
    );
  } else if (expenses.length > 0 && isFinite(minDate) && isFinite(maxDate)) {
    days = Math.max(1, Math.round((maxDate - minDate) / 86400000) + 1);
  }

  const totalCount = expenses.length;
  const paidByOthers = totalAmount - paidByMe;
  const averagePerTransaction = totalCount > 0 ? totalAmount / totalCount : 0;
  const averagePerDay = days > 0 ? totalAmount / days : 0;

  return {
    totalAmount: round(totalAmount),
    totalCount,
    myShare: round(myShare),
    paidByMe: round(paidByMe),
    paidByOthers: round(paidByOthers),
    personalTotal: round(personalTotal),
    groupTotal: round(groupTotal),
    averagePerDay: round(averagePerDay),
    averagePerTransaction: round(averagePerTransaction),
    daysCovered: days,
    largest: largest
      ? { ...largest, amount: round(largest.amount) }
      : null,
    byCategory: Array.from(byCategoryMap.values())
      .sort((a, b) => b.total - a.total)
      .map((c) => ({ ...c, total: round(c.total) })),
    byMonth: Array.from(byMonthMap.values())
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .map((m) => ({ ...m, total: round(m.total) })),
    byDayOfWeek: byDayOfWeek.map((d) => ({ ...d, total: round(d.total) })),
    byGroup: Array.from(byGroupMap.values())
      .sort((a, b) => b.total - a.total)
      .map((g) => ({
        ...g,
        total: round(g.total),
        myShare: round(g.myShare),
      })),
    topPayers: Array.from(topPayersMap.values())
      .sort((a, b) => b.total - a.total)
      .map((p) => ({ ...p, total: round(p.total) })),
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

  const oid = toObjectId(groupId, "groupId");
  const expenses = await Expense.find({
    groupId: oid,
    type: "group",
    $or: [{ settledAt: null }, { settledAt: { $exists: false } }],
  }).lean();
  const balances = calculateBalances(expenses as ExpenseDoc[]);
  const settlements = calculateSettlements(balances);

  return { balances, settlements };
}

export async function settleGroup(groupId: string, auth: JWTPayload) {
  await connectDB();

  const group = await Group.findById(groupId).lean();
  if (!group || !group.members.some((m) => m.userId === auth.userId)) {
    throw new Error("Group not found or access denied");
  }

  const oid = toObjectId(groupId, "groupId");
  const settlementId = `settle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  const unsettledFilter = {
    groupId: oid,
    type: "group",
    $or: [{ settledAt: null }, { settledAt: { $exists: false } }],
  };

  const updateResult = await Expense.updateMany(unsettledFilter, {
    $set: { settledAt: now, settlementId },
  });

  if (updateResult.modifiedCount === 0) {
    throw new Error("No unsettled expenses in this group");
  }

  const settled = await Expense.find({ settlementId }).lean();
  const balances = calculateBalances(settled as ExpenseDoc[]);
  const settlementPlan = calculateSettlements(balances);

  return {
    settlementId,
    settledAt: now,
    expenseCount: updateResult.modifiedCount,
    balances,
    settlements: settlementPlan,
  };
}

export async function getSettlementHistory(groupId: string, auth: JWTPayload) {
  await connectDB();

  const group = await Group.findById(groupId).lean();
  if (!group || !group.members.some((m) => m.userId === auth.userId)) {
    throw new Error("Group not found or access denied");
  }

  const oid = toObjectId(groupId, "groupId");

  const settled = await Expense.find({
    groupId: oid,
    type: "group",
    settledAt: { $ne: null },
  })
    .sort({ settledAt: -1, date: -1 })
    .lean();

  const grouped = new Map<
    string,
    { settlementId: string; settledAt: Date; expenses: typeof settled }
  >();

  for (const exp of settled) {
    const sid = exp.settlementId ?? "unknown";
    if (!grouped.has(sid)) {
      grouped.set(sid, {
        settlementId: sid,
        settledAt: exp.settledAt!,
        expenses: [],
      });
    }
    grouped.get(sid)!.expenses.push(exp);
  }

  return Array.from(grouped.values());
}

// ── Personal settlement ─────────────────────────────

export async function settlePersonal(auth: JWTPayload) {
  await connectDB();

  const settlementId = `psettle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  const unsettledFilter = {
    createdBy: auth.userId,
    type: "personal",
    $or: [{ settledAt: null }, { settledAt: { $exists: false } }],
  };

  const updateResult = await Expense.updateMany(unsettledFilter, {
    $set: { settledAt: now, settlementId },
  });

  if (updateResult.modifiedCount === 0) {
    throw new Error("No unsettled personal expenses");
  }

  return {
    settlementId,
    settledAt: now,
    expenseCount: updateResult.modifiedCount,
  };
}

export async function getPersonalSettlementHistory(auth: JWTPayload) {
  await connectDB();

  const settled = await Expense.find({
    createdBy: auth.userId,
    type: "personal",
    settledAt: { $ne: null },
  })
    .sort({ settledAt: -1, date: -1 })
    .lean();

  const grouped = new Map<
    string,
    { settlementId: string; settledAt: Date; expenses: typeof settled }
  >();

  for (const exp of settled) {
    const sid = exp.settlementId ?? "unknown";
    if (!grouped.has(sid)) {
      grouped.set(sid, {
        settlementId: sid,
        settledAt: exp.settledAt!,
        expenses: [],
      });
    }
    grouped.get(sid)!.expenses.push(exp);
  }

  return Array.from(grouped.values());
}
