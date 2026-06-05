import { connectDB } from "@/lib/db";
import { vision } from "@/lib/llm";
import type { JWTPayload } from "@/lib/auth";
import { User } from "@/models/User";
import mongoose from "mongoose";
import { Group, Expense, UserPrefs, type ExpenseDoc } from "./models";

function toObjectId(id: string, label = "ID"): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) {
    throw new Error(`Invalid ${label}: ${id}`);
  }
  return new mongoose.Types.ObjectId(id);
}

// Escape user input before using it inside a RegExp (prevents invalid/abusive patterns).
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Quote a CSV field; also neutralises spreadsheet formula injection (=, +, -, @).
function csvField(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function expensesToCsv(expenses: ExpenseDoc[]): string {
  const headers = [
    "Date",
    "Description",
    "Category",
    "Direction",
    "Type",
    "Paid By",
    "Amount",
    "Currency",
    "Amount (base)",
    "Split Among",
    "Settled",
  ];
  const rows = expenses.map((e) => [
    new Date(e.date).toISOString().slice(0, 10),
    e.description,
    e.category,
    e.direction ?? "expense",
    e.type,
    e.paidBy?.name ?? "",
    e.amount.toFixed(2),
    e.currency ?? "INR",
    (e.amountBase ?? e.amount).toFixed(2),
    (e.splitAmong ?? []).map((m) => m.name).join("; "),
    e.settledAt ? "yes" : "no",
  ]);
  return [headers, ...rows]
    .map((cols) => cols.map(csvField).join(","))
    .join("\r\n");
}
import {
  type CreateGroupInput,
  type CreateExpenseInput,
  type ExpenseFilter,
  type ReportFilter,
  type ReceiptResult,
  type UpdatePrefsInput,
  geminiReceiptSchema,
  receiptResultSchema,
  DEFAULT_PREFS,
  INCOME_CATEGORIES,
} from "./schemas";
import {
  calculateSplits,
  calculateBalances,
  calculateSettlements,
  type MemberBalance,
  type Settlement,
} from "./balance";
import { RECEIPT_SYSTEM_PROMPT, RECEIPT_PROMPT } from "./prompts";
import { convert } from "./rates";

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

  // Currency: default to the creator's base; freeze amountBase at write time.
  const { baseCurrency } = await getPrefs(auth);
  const currency = input.currency ?? baseCurrency;
  const amountBase = await convert(input.amount, currency, baseCurrency);

  const expense = await Expense.create({
    type: input.type,
    direction: input.direction ?? "expense",
    groupId: input.type === "group" ? input.groupId ?? null : null,
    createdBy: auth.userId,
    paidBy: input.paidBy,
    amount: input.amount,
    currency,
    amountBase,
    description: input.description,
    category: input.category,
    date: new Date(input.date),
    splitAmong,
    splits,
    items: input.items ?? [],
  });

  return expense.toObject();
}

// Shared query builder for the expense list + CSV export, so both apply identical
// scoping/filtering. Verifies group access; does NOT page (callers add skip/limit).
type ExpenseQueryFilter = Pick<
  ExpenseFilter,
  "groupId" | "type" | "direction" | "category" | "q" | "dateFrom" | "dateTo" | "settled"
>;

async function buildExpenseQuery(
  filter: ExpenseQueryFilter,
  auth: JWTPayload
): Promise<Record<string, unknown>> {
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

  // Direction filter. Pre-1A rows have no `direction` field, so "expense" also
  // matches missing/null. "all" (or undefined) applies no direction constraint.
  if (filter.direction === "income") {
    query.direction = "income";
  } else if (filter.direction === "expense") {
    query.$and = [
      ...(Array.isArray(query.$and) ? query.$and : []),
      { $or: [{ direction: "expense" }, { direction: { $exists: false } }, { direction: null }] },
    ];
  }

  if (filter.category) query.category = filter.category;
  if (filter.q) {
    // Case-insensitive substring search across description, line items, and category.
    // Regex (not a $text index) so partial words match ("coff" → "coffee") with no migration.
    const rx = new RegExp(escapeRegex(filter.q), "i");
    query.$and = [
      ...(Array.isArray(query.$and) ? query.$and : []),
      { $or: [{ description: rx }, { "items.name": rx }, { category: rx }] },
    ];
  }
  if (filter.dateFrom || filter.dateTo) {
    query.date = {};
    if (filter.dateFrom)
      (query.date as Record<string, unknown>).$gte = new Date(filter.dateFrom);
    if (filter.dateTo)
      (query.date as Record<string, unknown>).$lte = new Date(filter.dateTo);
  }

  return query;
}

export async function listExpenses(
  filter: ExpenseFilter,
  auth: JWTPayload
) {
  await connectDB();
  const query = await buildExpenseQuery(filter, auth);

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

// Hard cap on a single CSV export to bound memory/response size.
const CSV_EXPORT_LIMIT = 5000;

export async function exportExpensesCsv(
  filter: ExpenseQueryFilter,
  auth: JWTPayload
): Promise<string> {
  await connectDB();
  const query = await buildExpenseQuery(filter, auth);
  const expenses = await Expense.find(query)
    .sort({ date: -1 })
    .limit(CSV_EXPORT_LIMIT)
    .lean();
  return expensesToCsv(expenses);
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

  // 2. Determine the effective target (direction/type/group) after this update.
  // Income is personal-only (D-6), so it always forces type "personal".
  const newDirection = input.direction ?? expense.direction ?? "expense";
  const newType =
    newDirection === "income" ? "personal" : input.type ?? expense.type;
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
  expense.direction = newDirection;

  // Re-freeze the base-currency amount whenever amount/currency changes (or backfill
  // a pre-1B row that has no amountBase yet).
  const { baseCurrency } = await getPrefs(auth);
  const newCurrency = input.currency ?? expense.currency ?? baseCurrency;
  expense.currency = newCurrency;
  if (
    input.amount !== undefined ||
    input.currency !== undefined ||
    expense.amountBase == null
  ) {
    expense.amountBase = await convert(expense.amount, newCurrency, baseCurrency);
  }

  // Guard: a row marked income must carry an income category (covers partial
  // PATCHes that flip direction without resending a matching category).
  if (
    newDirection === "income" &&
    !(INCOME_CATEGORIES as readonly string[]).includes(expense.category)
  ) {
    throw new Error("Income must use an income category");
  }

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
  if (filter.q) {
    const rx = new RegExp(escapeRegex(filter.q), "i");
    match.$and = [
      ...((match.$and as unknown[]) ?? []),
      { $or: [{ description: rx }, { "items.name": rx }, { category: rx }] },
    ];
  }

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

  let totalAmount = 0; // spending only (excludes income)
  let incomeAmount = 0;
  let incomeCount = 0;
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
    // All aggregation is in the viewer's base currency. `amountBase` is frozen at
    // write; pre-1B rows fall back to `amount`. Split amounts are stored in the
    // entry currency, so scale them by the same base/entry ratio.
    const baseAmt = e.amountBase ?? e.amount;
    const ratio = e.amount > 0 ? baseAmt / e.amount : 1;

    // Income is tracked separately and never counts toward spending aggregates,
    // breakdowns, or the spending date range (used for averagePerDay).
    if (e.direction === "income") {
      incomeAmount += baseAmt;
      incomeCount += 1;
      continue;
    }

    totalAmount += baseAmt;

    if (e.paidBy?.id === userId) paidByMe += baseAmt;

    if (e.type === "personal") {
      personalTotal += baseAmt;
      myShare += baseAmt;
    } else {
      groupTotal += baseAmt;
      const myPart = (e.splits ?? []).find((s) => s.memberId === userId);
      if (myPart) myShare += myPart.amount * ratio;
    }

    if (!largest || baseAmt > largest.amount) {
      largest = {
        description: e.description,
        amount: baseAmt,
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
    cat.total += baseAmt;
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
    m.total += baseAmt;
    m.count += 1;
    byMonthMap.set(monthKey, m);

    byDayOfWeek[d.getUTCDay()].total += baseAmt;
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
      g.total += baseAmt;
      const myPart = (e.splits ?? []).find((s) => s.memberId === userId);
      if (myPart) g.myShare += myPart.amount * ratio;
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
      p.total += baseAmt;
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

  const totalCount = expenses.length - incomeCount; // spending entries only
  const paidByOthers = totalAmount - paidByMe;
  const averagePerTransaction = totalCount > 0 ? totalAmount / totalCount : 0;
  const averagePerDay = days > 0 ? totalAmount / days : 0;

  return {
    totalAmount: round(totalAmount),
    totalCount,
    incomeAmount: round(incomeAmount),
    incomeCount,
    netAmount: round(incomeAmount - totalAmount),
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

// ── Account deletion ────────────────────────────────

export async function deleteAccount(auth: JWTPayload) {
  await connectDB();
  const userId = auth.userId;

  // Groups the user created — these and their expenses are removed entirely.
  const ownGroups = await Group.find({ createdBy: userId }, { _id: 1 }).lean();
  const ownGroupIds = ownGroups.map((g) => g._id);

  // Delete the user's personal expenses + all expenses in groups they own.
  await Expense.deleteMany({
    $or: [
      { createdBy: userId, type: "personal" },
      { groupId: { $in: ownGroupIds } },
    ],
  });

  // Delete the groups they own.
  await Group.deleteMany({ createdBy: userId });

  // Remove the user from groups owned by others (their past group expenses
  // stay for those groups' balance accuracy, per the privacy policy).
  await Group.updateMany(
    { "members.userId": userId },
    { $pull: { members: { userId } } } as never
  );

  // Finally, delete the account itself.
  await User.findByIdAndDelete(userId);

  return { deleted: true };
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

// ── Preferences ─────────────────────────────────────

export async function getPrefs(auth: JWTPayload) {
  await connectDB();
  const prefs = await UserPrefs.findOne({ userId: auth.userId }).lean();
  // No row yet → return defaults without persisting; first write upserts.
  return {
    baseCurrency: prefs?.baseCurrency ?? DEFAULT_PREFS.baseCurrency,
    locale: prefs?.locale ?? DEFAULT_PREFS.locale,
    weekStart: prefs?.weekStart ?? DEFAULT_PREFS.weekStart,
  };
}

export async function updatePrefs(input: UpdatePrefsInput, auth: JWTPayload) {
  await connectDB();
  const prev = await UserPrefs.findOne({ userId: auth.userId }).lean();
  const prevBase = prev?.baseCurrency ?? DEFAULT_PREFS.baseCurrency;

  const prefs = await UserPrefs.findOneAndUpdate(
    { userId: auth.userId },
    { $set: input },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  // Changing the base currency re-freezes every owned row's `amountBase` against
  // the new base, so historical amounts don't show old numbers with a new symbol.
  if (input.baseCurrency && input.baseCurrency !== prevBase) {
    await recomputeAmountBase(auth.userId, prefs!.baseCurrency);
  }

  return {
    baseCurrency: prefs!.baseCurrency,
    locale: prefs!.locale,
    weekStart: prefs!.weekStart,
  };
}

// Re-convert amountBase for every expense the user owns into `base`. FX rates are
// cached per source currency, so this is one network call per distinct currency.
async function recomputeAmountBase(userId: string, base: string) {
  const docs = await Expense.find({ createdBy: userId })
    .select("amount currency")
    .lean();
  for (const d of docs) {
    const newBase = await convert(d.amount, d.currency ?? "INR", base);
    await Expense.updateOne({ _id: d._id }, { $set: { amountBase: newBase } });
  }
}
