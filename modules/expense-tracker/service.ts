import { randomBytes } from "crypto";
import { connectDB } from "@/lib/db";
import { vision, completeJSON, complete } from "@/lib/llm";
import type { JWTPayload } from "@/lib/auth";
import { User } from "@/models/User";
import mongoose from "mongoose";
import {
  Group,
  Expense,
  UserPrefs,
  Account,
  Transfer,
  Budget,
  RecurringRule,
  Goal,
  type ExpenseDoc,
  type RecurringRuleDoc,
} from "./models";
import { evaluateBudget } from "./budget";
import { advance, dueOccurrences, isDue } from "./recurring";
import { goalProgress } from "./goal";

function toObjectId(id: string, label = "ID"): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) {
    throw new Error(`Invalid ${label}: ${id}`);
  }
  return new mongoose.Types.ObjectId(id);
}

/**
 * A user's display name is denormalized into group memberships, expense payers,
 * and split entries (captured at write time). When the user renames themselves,
 * those copies go stale — e.g. a group keeps showing the old "Michael" instead
 * of the new "Mohit Patel". Call this after a profile-name change to rewrite
 * every copy for that user. Assumes the DB connection is already open.
 */
export async function propagateUserName(userId: string, rawName: string) {
  const name = rawName.trim();
  if (!name) return;
  await Promise.all([
    Group.updateMany(
      { "members.userId": userId },
      { $set: { "members.$[m].name": name } },
      { arrayFilters: [{ "m.userId": userId }] }
    ),
    Expense.updateMany(
      { "paidBy.id": userId },
      { $set: { "paidBy.name": name } }
    ),
    Expense.updateMany(
      { "splitAmong.memberId": userId },
      { $set: { "splitAmong.$[m].name": name } },
      { arrayFilters: [{ "m.memberId": userId }] }
    ),
    Expense.updateMany(
      { "splits.memberId": userId },
      { $set: { "splits.$[m].name": name } },
      { arrayFilters: [{ "m.memberId": userId }] }
    ),
  ]);
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
  type CreateAccountInput,
  type UpdateAccountInput,
  type CreateTransferInput,
  type CreateBudgetInput,
  type UpdateBudgetInput,
  type CreateRecurringInput,
  type UpdateRecurringInput,
  type CoachInput,
  type CreateGoalInput,
  type UpdateGoalInput,
  type ContributeGoalInput,
  geminiReceiptSchema,
  receiptResultSchema,
  geminiNlSchema,
  nlResultSchema,
  type NlResult,
  CATEGORIES,
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
import {
  RECEIPT_SYSTEM_PROMPT,
  RECEIPT_PROMPT,
  NL_SYSTEM_PROMPT,
  nlPrompt,
  coachSystem,
} from "./prompts";
import { convert } from "./rates";
import { isSupportedCurrency } from "./currencies";
import { projectMonthEnd } from "./forecast";
import {
  detectSubscriptions,
  detectAnomalies,
  type InsightExpense,
} from "./insights";

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

  // Use the creator's live name (the JWT copy can be stale after a rename).
  const creator = await User.findById(auth.userId).lean();
  const members = [
    {
      userId: auth.userId,
      name: creator?.name ?? auth.name,
      email: creator?.email ?? auth.email,
      isActive: true,
    },
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

export async function addGuestMember(
  groupId: string,
  name: string,
  auth: JWTPayload
) {
  await connectDB();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A name is required for a guest");

  const group = await Group.findById(groupId);
  if (!group) throw new Error("Group not found");
  if (!group.members.some((m) => m.userId === auth.userId)) {
    throw new Error("You are not a member of this group");
  }
  if (
    group.members.some(
      (m) => m.name.trim().toLowerCase() === trimmed.toLowerCase()
    )
  ) {
    throw new Error("A member with that name is already in this group");
  }

  // Guests have no account: a synthetic userId keyed for splits/balances.
  group.members.push({
    userId: `guest:${randomBytes(9).toString("base64url")}`,
    name: trimmed,
    email: "",
    isActive: true,
    isGuest: true,
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

  // Account (personal-only, D-6): verify it belongs to the user before linking.
  const accountId =
    input.type === "personal"
      ? await resolveAccountId(input.accountId, auth.userId)
      : null;

  const expense = await Expense.create({
    type: input.type,
    direction: input.direction ?? "expense",
    groupId: input.type === "group" ? input.groupId ?? null : null,
    createdBy: auth.userId,
    paidBy: input.paidBy,
    amount: input.amount,
    currency,
    amountBase,
    accountId,
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

  // Account link (personal-only). Group expenses never carry an account.
  if (newType !== "personal") {
    expense.accountId = null;
  } else if (input.accountId !== undefined) {
    expense.accountId = await resolveAccountId(input.accountId, auth.userId);
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

// ── Shareable bill-split link (Phase 4B) ────────────

export async function enableGroupShare(groupId: string, auth: JWTPayload) {
  await connectDB();
  const group = await Group.findById(groupId);
  if (!group) throw new Error("Group not found");
  if (group.createdBy !== auth.userId) {
    throw new Error("Only the group creator can share it");
  }
  if (!group.shareId) {
    group.shareId = randomBytes(12).toString("base64url");
    await group.save();
  }
  return { shareId: group.shareId };
}

export async function disableGroupShare(groupId: string, auth: JWTPayload) {
  await connectDB();
  const group = await Group.findById(groupId);
  if (!group) throw new Error("Group not found");
  if (group.createdBy !== auth.userId) {
    throw new Error("Only the group creator can manage sharing");
  }
  group.shareId = null;
  await group.save();
  return { disabled: true };
}

// PUBLIC (no auth): read-only "who owes whom" for a shared group. Exposes only display
// names + balances + the settlement plan — no emails, user ids, or raw transactions.
export async function getSharedGroup(shareId: string) {
  await connectDB();
  const group = await Group.findOne({ shareId }).lean();
  if (!group) throw new Error("Share link not found");

  const expenses = await Expense.find({
    groupId: group._id,
    type: "group",
    $or: [{ settledAt: null }, { settledAt: { $exists: false } }],
  }).lean();

  const balances = calculateBalances(expenses as ExpenseDoc[]);
  const settlements = calculateSettlements(balances);

  // Dominant currency among the group's expenses (groups are single-currency in v1).
  const counts = new Map<string, number>();
  for (const e of expenses) {
    const c = e.currency ?? "INR";
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const currency =
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "INR";
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return {
    groupName: group.name,
    currency,
    expenseCount: expenses.length,
    total: Math.round(total * 100) / 100,
    members: balances.map((b) => ({
      name: b.name,
      paid: b.totalPaid,
      owed: b.totalOwed,
      net: b.netBalance,
    })),
    settlements: settlements.map((s) => ({
      from: s.from.name,
      to: s.to.name,
      amount: s.amount,
    })),
  };
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

  // Remove the user's accounts/wallets, transfers, budgets, recurring, goals, prefs.
  await Account.deleteMany({ userId });
  await Transfer.deleteMany({ userId });
  await Budget.deleteMany({ userId });
  await RecurringRule.deleteMany({ userId });
  await Goal.deleteMany({ userId });
  await UserPrefs.deleteMany({ userId });

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

// Base currency by userId (for server-side flows like recurring/cron without a JWT).
async function getBaseCurrency(userId: string): Promise<string> {
  const prefs = await UserPrefs.findOne({ userId }).select("baseCurrency").lean();
  return prefs?.baseCurrency ?? DEFAULT_PREFS.baseCurrency;
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

// ── Accounts / wallets (Phase 1C) ───────────────────

// Validate that an account id (if given) belongs to the user; returns the ObjectId
// or null. Throws if the id is malformed or not the user's account.
async function resolveAccountId(
  accountId: string | null | undefined,
  userId: string
): Promise<mongoose.Types.ObjectId | null> {
  if (!accountId) return null;
  const acc = await Account.findOne({
    _id: toObjectId(accountId, "accountId"),
    userId,
  })
    .select("_id")
    .lean();
  if (!acc) throw new Error("Account not found");
  return acc._id;
}

// Per-account balance delta from transactions + transfers (excludes openingBalance).
// All sums are in the base currency (amountBase). Returns accountId → delta.
async function computeBalanceDeltas(
  userId: string
): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  const grouped = await Expense.aggregate<{
    _id: { acc: mongoose.Types.ObjectId; dir: string | null };
    total: number;
  }>([
    { $match: { createdBy: userId, accountId: { $ne: null } } },
    {
      $group: {
        _id: { acc: "$accountId", dir: "$direction" },
        total: { $sum: { $ifNull: ["$amountBase", "$amount"] } },
      },
    },
  ]);
  for (const row of grouped) {
    const acc = row._id.acc.toString();
    const signed = (row._id.dir ?? "expense") === "income" ? row.total : -row.total;
    map.set(acc, (map.get(acc) ?? 0) + signed);
  }

  const transfers = await Transfer.find({ userId })
    .select("fromAccountId toAccountId amount")
    .lean();
  for (const t of transfers) {
    const from = t.fromAccountId.toString();
    const to = t.toAccountId.toString();
    map.set(from, (map.get(from) ?? 0) - t.amount);
    map.set(to, (map.get(to) ?? 0) + t.amount);
  }

  return map;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function listAccounts(
  auth: JWTPayload,
  opts: { includeArchived?: boolean } = {}
) {
  await connectDB();
  const filter: Record<string, unknown> = { userId: auth.userId };
  if (!opts.includeArchived) filter.archived = false;

  const [accounts, deltas] = await Promise.all([
    Account.find(filter).sort({ createdAt: 1 }).lean(),
    computeBalanceDeltas(auth.userId),
  ]);

  return accounts.map((a) => ({
    ...a,
    balance: round2(a.openingBalance + (deltas.get(a._id.toString()) ?? 0)),
  }));
}

export async function createAccount(input: CreateAccountInput, auth: JWTPayload) {
  await connectDB();
  const { baseCurrency } = await getPrefs(auth);
  const account = await Account.create({
    userId: auth.userId,
    name: input.name,
    kind: input.kind,
    currency: input.currency ?? baseCurrency,
    openingBalance: input.openingBalance,
  });
  return { ...account.toObject(), balance: round2(input.openingBalance) };
}

export async function updateAccount(
  id: string,
  input: UpdateAccountInput,
  auth: JWTPayload
) {
  await connectDB();
  const account = await Account.findOne({
    _id: toObjectId(id, "accountId"),
    userId: auth.userId,
  });
  if (!account) throw new Error("Account not found");
  Object.assign(account, input);
  await account.save();
  return account.toObject();
}

// Unlink the account from any transactions and remove its transfers, then delete it.
export async function removeAccount(id: string, auth: JWTPayload) {
  await connectDB();
  const account = await Account.findOne({
    _id: toObjectId(id, "accountId"),
    userId: auth.userId,
  });
  if (!account) throw new Error("Account not found");
  await Expense.updateMany(
    { createdBy: auth.userId, accountId: account._id },
    { $set: { accountId: null } }
  );
  await Transfer.deleteMany({
    userId: auth.userId,
    $or: [{ fromAccountId: account._id }, { toAccountId: account._id }],
  });
  await Goal.updateMany(
    { userId: auth.userId, linkedAccountId: account._id },
    { $set: { linkedAccountId: null } }
  );
  await Account.findByIdAndDelete(account._id);
  return { deleted: true };
}

export async function createTransfer(
  input: CreateTransferInput,
  auth: JWTPayload
) {
  await connectDB();
  const [from, to] = await Promise.all([
    Account.findOne({
      _id: toObjectId(input.fromAccountId, "fromAccountId"),
      userId: auth.userId,
    }).select("_id"),
    Account.findOne({
      _id: toObjectId(input.toAccountId, "toAccountId"),
      userId: auth.userId,
    }).select("_id"),
  ]);
  if (!from || !to) throw new Error("Account not found");

  const transfer = await Transfer.create({
    userId: auth.userId,
    fromAccountId: from._id,
    toAccountId: to._id,
    amount: input.amount,
    date: new Date(input.date),
    note: input.note,
  });
  return transfer.toObject();
}

export async function listTransfers(auth: JWTPayload) {
  await connectDB();
  return Transfer.find({ userId: auth.userId }).sort({ date: -1 }).lean();
}

// ── Budgets (Phase 2A) ──────────────────────────────

function monthBounds(month?: string) {
  let y: number;
  let m: number; // 0-based
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yy, mm] = month.split("-").map(Number);
    y = yy;
    m = mm - 1;
  } else {
    const now = new Date();
    y = now.getUTCFullYear();
    m = now.getUTCMonth();
  }
  return {
    start: new Date(Date.UTC(y, m, 1)),
    end: new Date(Date.UTC(y, m + 1, 1)),
    month: `${y}-${String(m + 1).padStart(2, "0")}`,
  };
}

// Personal expense spending (base currency) for one month, grouped by category.
async function monthlySpendingByCategory(
  userId: string,
  start: Date,
  end: Date
): Promise<{ byCategory: Map<string, number>; total: number }> {
  const rows = await Expense.aggregate<{ _id: string; total: number }>([
    {
      $match: {
        createdBy: userId,
        type: "personal",
        date: { $gte: start, $lt: end },
        $or: [
          { direction: "expense" },
          { direction: { $exists: false } },
          { direction: null },
        ],
      },
    },
    {
      $group: {
        _id: "$category",
        total: { $sum: { $ifNull: ["$amountBase", "$amount"] } },
      },
    },
  ]);

  const byCategory = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    byCategory.set(r._id, r.total);
    total += r.total;
  }
  return { byCategory, total };
}

export async function getBudgets(month: string | undefined, auth: JWTPayload) {
  await connectDB();
  const { start, end, month: resolved } = monthBounds(month);

  const [budgets, spending] = await Promise.all([
    Budget.find({ userId: auth.userId }).sort({ scope: 1, category: 1 }).lean(),
    monthlySpendingByCategory(auth.userId, start, end),
  ]);

  const items = budgets.map((b) => {
    const spent =
      b.scope === "overall"
        ? spending.total
        : spending.byCategory.get(b.category ?? "") ?? 0;
    return {
      _id: b._id.toString(),
      scope: b.scope,
      category: b.category,
      amount: b.amount,
      rollover: b.rollover,
      ...evaluateBudget(b.amount, spent),
    };
  });

  return {
    month: resolved,
    budgets: items,
    totalSpent: Math.round(spending.total * 100) / 100,
  };
}

export async function createBudget(input: CreateBudgetInput, auth: JWTPayload) {
  await connectDB();
  const category = input.scope === "category" ? input.category ?? null : null;
  try {
    const budget = await Budget.create({
      userId: auth.userId,
      scope: input.scope,
      category,
      amount: input.amount,
      rollover: input.rollover,
    });
    return budget.toObject();
  } catch (err) {
    if (err instanceof Error && err.message.includes("E11000")) {
      throw new Error(
        input.scope === "overall"
          ? "You already have an overall budget"
          : `You already have a budget for ${category}`
      );
    }
    throw err;
  }
}

export async function updateBudget(
  id: string,
  input: UpdateBudgetInput,
  auth: JWTPayload
) {
  await connectDB();
  const budget = await Budget.findOne({
    _id: toObjectId(id, "budgetId"),
    userId: auth.userId,
  });
  if (!budget) throw new Error("Budget not found");
  if (input.amount !== undefined) budget.amount = input.amount;
  if (input.rollover !== undefined) budget.rollover = input.rollover;
  await budget.save();
  return budget.toObject();
}

export async function removeBudget(id: string, auth: JWTPayload) {
  await connectDB();
  const res = await Budget.deleteOne({
    _id: toObjectId(id, "budgetId"),
    userId: auth.userId,
  });
  if (res.deletedCount === 0) throw new Error("Budget not found");
  return { deleted: true };
}

// ── Recurring rules (Phase 2B) ──────────────────────

// Create one expense from a recurring rule for a given date (used by manual post +
// the autoPost cron). Reuses the FX conversion; links back via recurringId.
async function createExpenseFromRule(rule: RecurringRuleDoc, date: Date) {
  const base = await getBaseCurrency(rule.userId);
  const currency = rule.template.currency || base;
  const amountBase = await convert(rule.template.amount, currency, base);
  const user = await User.findById(rule.userId).select("name").lean();

  await Expense.create({
    type: "personal",
    direction: rule.template.direction,
    createdBy: rule.userId,
    paidBy: { id: rule.userId, name: user?.name ?? "Me" },
    amount: rule.template.amount,
    currency,
    amountBase,
    accountId: rule.template.accountId ?? null,
    recurringId: rule._id,
    description: rule.template.description,
    category: rule.template.category,
    date,
    splitAmong: [],
    splits: [],
    items: [],
  });
}

export async function createRecurring(
  input: CreateRecurringInput,
  auth: JWTPayload
) {
  await connectDB();
  const accountId = await resolveAccountId(input.accountId, auth.userId);

  const rule = await RecurringRule.create({
    userId: auth.userId,
    template: {
      amount: input.amount,
      currency: input.currency ?? (await getBaseCurrency(auth.userId)),
      category: input.category,
      description: input.description,
      direction: input.direction,
      accountId,
    },
    cadence: input.cadence,
    nextRunAt: new Date(input.startDate),
    autoPost: input.autoPost,
    endDate: input.endDate ? new Date(input.endDate) : null,
  });
  return rule.toObject();
}

// Generate due autoPost occurrences as expenses and advance nextRunAt. Scoped to one
// user (lazy-on-open) or all users (daily cron). `now` is injected for testability.
export async function runDueRecurring(
  now: Date,
  opts: { userId?: string } = {}
): Promise<{ created: number; rules: number }> {
  await connectDB();
  const filter: Record<string, unknown> = {
    autoPost: true,
    active: true,
    nextRunAt: { $lte: now },
  };
  if (opts.userId) filter.userId = opts.userId;

  const rules = await RecurringRule.find(filter);
  let created = 0;
  for (const rule of rules) {
    const { dates, nextRunAt } = dueOccurrences(
      rule.nextRunAt,
      rule.cadence,
      now,
      rule.endDate
    );
    for (const d of dates) {
      await createExpenseFromRule(rule, d);
      created += 1;
    }
    if (dates.length > 0) {
      rule.lastRunAt = dates[dates.length - 1];
      rule.nextRunAt = nextRunAt;
      if (rule.endDate && nextRunAt.getTime() > rule.endDate.getTime()) {
        rule.active = false;
      }
      await rule.save();
    }
  }
  return { created, rules: rules.length };
}

// List rules with a computed `due` flag. Materializes any due autoPost rules first
// (lazy-on-open), so opening the Recurring screen posts bills without waiting on cron.
export async function getRecurring(auth: JWTPayload) {
  await connectDB();
  const now = new Date();
  await runDueRecurring(now, { userId: auth.userId });

  const rules = await RecurringRule.find({ userId: auth.userId })
    .sort({ nextRunAt: 1 })
    .lean();

  return {
    recurring: rules.map((r) => ({
      ...r,
      due: isDue(r.nextRunAt, now, r.active, r.endDate),
    })),
  };
}

// Manually post the current occurrence of a rule (for autoPost:false rules), then
// advance to the next period.
export async function postRecurring(id: string, auth: JWTPayload) {
  await connectDB();
  const rule = await RecurringRule.findOne({
    _id: toObjectId(id, "recurringId"),
    userId: auth.userId,
  });
  if (!rule) throw new Error("Recurring rule not found");
  if (!rule.active) throw new Error("This recurring rule is paused");

  const date = rule.nextRunAt;
  await createExpenseFromRule(rule, date);
  rule.lastRunAt = date;
  rule.nextRunAt = advance(date, rule.cadence);
  if (rule.endDate && rule.nextRunAt.getTime() > rule.endDate.getTime()) {
    rule.active = false;
  }
  await rule.save();
  return rule.toObject();
}

export async function updateRecurring(
  id: string,
  input: UpdateRecurringInput,
  auth: JWTPayload
) {
  await connectDB();
  const rule = await RecurringRule.findOne({
    _id: toObjectId(id, "recurringId"),
    userId: auth.userId,
  });
  if (!rule) throw new Error("Recurring rule not found");

  if (input.amount !== undefined) rule.template.amount = input.amount;
  if (input.description !== undefined) rule.template.description = input.description;
  if (input.category !== undefined) rule.template.category = input.category;
  if (input.cadence !== undefined) rule.cadence = input.cadence;
  if (input.autoPost !== undefined) rule.autoPost = input.autoPost;
  if (input.active !== undefined) rule.active = input.active;
  if (input.endDate !== undefined)
    rule.endDate = input.endDate ? new Date(input.endDate) : null;

  await rule.save();
  return rule.toObject();
}

export async function removeRecurring(id: string, auth: JWTPayload) {
  await connectDB();
  const res = await RecurringRule.deleteOne({
    _id: toObjectId(id, "recurringId"),
    userId: auth.userId,
  });
  if (res.deletedCount === 0) throw new Error("Recurring rule not found");
  return { deleted: true };
}

// ── AI: natural-language entry + forecast (Phase 3) ──

// Parse a free-text note into a personal-transaction draft (NOT saved — the client
// confirms it in the add form). Mirrors the receipt-scan pattern with Gemini.
export async function parseNaturalExpense(text: string, auth: JWTPayload) {
  const { baseCurrency } = await getPrefs(auth);
  const today = new Date().toISOString().slice(0, 10);

  const raw = await completeJSON<NlResult>(
    nlPrompt(text, today, baseCurrency),
    geminiNlSchema,
    { system: NL_SYSTEM_PROMPT, temperature: 0.2, maxOutputTokens: 512 }
  );

  const parsed = nlResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Couldn't understand that — try rephrasing, e.g. '250 coffee'.");
  }
  const r = parsed.data;

  // Normalize against our enums so the draft is always valid for the add form.
  const direction = r.direction;
  const catList = direction === "income" ? INCOME_CATEGORIES : CATEGORIES;
  const category = (catList as readonly string[]).includes(r.category)
    ? r.category
    : "Other";
  const currency =
    r.currency && isSupportedCurrency(r.currency) ? r.currency : baseCurrency;
  const date = !isNaN(Date.parse(r.date)) ? r.date.slice(0, 10) : today;

  return {
    draft: {
      type: "personal" as const,
      direction,
      amount: Math.round(r.amount * 100) / 100,
      currency,
      category,
      description: r.description.slice(0, 200),
      date,
    },
  };
}

// Month-end spend projection: run-rate from month-to-date personal spending, plus the
// known upcoming recurring bills and overall-budget comparison.
export async function getForecast(auth: JWTPayload) {
  await connectDB();
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 1));
  const todayMidnight = new Date(Date.UTC(y, m, now.getUTCDate()));
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const daysElapsed = now.getUTCDate();

  const { total: monthToDate } = await monthlySpendingByCategory(
    auth.userId,
    start,
    end
  );
  const forecast = projectMonthEnd(monthToDate, daysElapsed, daysInMonth);

  const baseCurrency = await getBaseCurrency(auth.userId);
  const upcomingRules = await RecurringRule.find({
    userId: auth.userId,
    active: true,
    "template.direction": "expense",
    nextRunAt: { $gte: todayMidnight, $lt: end },
  }).lean();
  let upcomingRecurring = 0;
  for (const rule of upcomingRules) {
    upcomingRecurring += await convert(
      rule.template.amount,
      rule.template.currency || baseCurrency,
      baseCurrency
    );
  }
  upcomingRecurring = Math.round(upcomingRecurring * 100) / 100;

  const overallBudgetDoc = await Budget.findOne({
    userId: auth.userId,
    scope: "overall",
  })
    .select("amount")
    .lean();
  const overallBudget = overallBudgetDoc?.amount ?? null;

  return {
    ...forecast,
    upcomingRecurring,
    overallBudget,
    projectedVsBudget:
      overallBudget != null
        ? Math.round((forecast.projectedTotal - overallBudget) * 100) / 100
        : null,
  };
}

// Smart insights: likely subscriptions (not already tracked) + spend anomalies, over
// the user's personal expense history (base currency).
export async function getInsights(auth: JWTPayload) {
  await connectDB();
  const DAY = 86400000;
  const since = new Date(Date.now() - 365 * DAY);

  const rows = await Expense.find({
    createdBy: auth.userId,
    type: "personal",
    date: { $gte: since },
    $or: [
      { direction: "expense" },
      { direction: { $exists: false } },
      { direction: null },
    ],
  })
    .select("description category amount amountBase date recurringId")
    .lean();

  const mapped: InsightExpense[] = rows.map((r) => ({
    _id: r._id.toString(),
    description: r.description,
    category: r.category,
    amount: r.amountBase ?? r.amount,
    date: new Date(r.date).toISOString(),
    recurringId: r.recurringId ? r.recurringId.toString() : null,
  }));

  const rules = await RecurringRule.find({ userId: auth.userId })
    .select("template.description")
    .lean();
  const trackedKeys = new Set(
    rules.map((r) =>
      r.template.description.trim().toLowerCase().replace(/\s+/g, " ")
    )
  );

  const subscriptions = detectSubscriptions(mapped, trackedKeys);
  const recentCutoff = Date.now() - 90 * DAY;
  const anomalies = detectAnomalies(
    mapped.filter((e) => Date.parse(e.date) >= recentCutoff)
  );

  return { subscriptions, anomalies };
}

// ── Spending Coach chat (Phase 3) ───────────────────

// A compact financial summary the model answers from — reuses existing analytics so
// we never hand raw transactions to the LLM.
async function buildCoachContext(auth: JWTPayload): Promise<string> {
  const [all, budgets, forecast, insights, accounts] = await Promise.all([
    getSummary({ scope: "all", settled: "all" }, auth),
    getBudgets(undefined, auth),
    getForecast(auth),
    getInsights(auth),
    listAccounts(auth),
  ]);
  const base = await getBaseCurrency(auth.userId);
  const m = (n: number) => `${base} ${Math.round(n)}`;

  const topCats = all.byCategory
    .slice(0, 6)
    .map((c) => `${c.category} ${m(c.total)} (${c.count})`)
    .join(", ");
  const months = all.byMonth
    .slice(-4)
    .map((mo) => `${mo.year}-${String(mo.month).padStart(2, "0")} ${m(mo.total)}`)
    .join(", ");
  const budgetLines =
    budgets.budgets
      .map((b) => `${b.scope === "overall" ? "Overall" : b.category} ${m(b.spent)}/${m(b.limit)} (${b.status})`)
      .join("; ") || "none set";
  const subs =
    insights.subscriptions.slice(0, 8).map((s) => `${s.description} ${m(s.amount)}/${s.cadence}`).join(", ") ||
    "none detected";
  const anomalies =
    insights.anomalies.slice(0, 5).map((a) => `${a.description} ${m(a.amount)} (${a.ratio}x usual ${a.category})`).join(", ") ||
    "none";
  const netWorth = accounts.reduce((s, a) => s + a.balance, 0);

  return [
    `Total spend (all time): ${m(all.totalAmount)} over ${all.totalCount} entries.`,
    `Income (all time): ${m(all.incomeAmount)}. Net (income - spend): ${m(all.netAmount)}.`,
    `Top spend categories: ${topCats}.`,
    `Recent monthly spend: ${months}.`,
    `This month so far ${m(forecast.monthToDate)}; projected month-end ${m(forecast.projectedTotal)}${forecast.overallBudget != null ? `; overall budget ${m(forecast.overallBudget)}` : ""}.`,
    `Budgets: ${budgetLines}.`,
    all.largest ? `Largest single expense: ${all.largest.description} ${m(all.largest.amount)} (${all.largest.category}).` : "",
    `Detected subscriptions: ${subs}.`,
    `Spend anomalies: ${anomalies}.`,
    `Accounts net worth: ${m(netWorth)} across ${accounts.length} account(s).`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function coachReply(input: CoachInput, auth: JWTPayload) {
  const base = (await getPrefs(auth)).baseCurrency;
  const today = new Date().toISOString().slice(0, 10);
  const context = await buildCoachContext(auth);
  const system = `${coachSystem(base, today)}\n\n=== USER FINANCIAL SUMMARY ===\n${context}`;

  const convo = input.messages
    .slice(-10)
    .map((mm) => `${mm.role === "user" ? "User" : "Coach"}: ${mm.content}`)
    .join("\n");

  const reply = await complete(`${convo}\nCoach:`, {
    system,
    temperature: 0.4,
    maxOutputTokens: 700,
  });
  return { reply: reply.trim() };
}

// ── Savings goals (Phase 4) ─────────────────────────

export async function listGoals(auth: JWTPayload) {
  await connectDB();
  const goals = await Goal.find({ userId: auth.userId, archived: false })
    .sort({ createdAt: 1 })
    .lean();

  // Account-linked goals track that account's live balance.
  const needBalances = goals.some((g) => g.linkedAccountId);
  const balanceById = new Map<string, number>();
  if (needBalances) {
    const accounts = await listAccounts(auth);
    for (const a of accounts) balanceById.set(a._id.toString(), a.balance);
  }

  const now = new Date();
  return goals.map((g) => {
    const linkedId = g.linkedAccountId?.toString() ?? null;
    const saved = linkedId ? balanceById.get(linkedId) ?? 0 : g.savedAmount;
    return {
      _id: g._id.toString(),
      name: g.name,
      deadline: g.deadline ? new Date(g.deadline).toISOString().slice(0, 10) : null,
      linkedAccountId: linkedId,
      ...goalProgress(g.target, saved, g.deadline ?? null, now),
    };
  });
}

export async function createGoal(input: CreateGoalInput, auth: JWTPayload) {
  await connectDB();
  const linkedAccountId = await resolveAccountId(input.linkedAccountId, auth.userId);
  const goal = await Goal.create({
    userId: auth.userId,
    name: input.name,
    target: input.target,
    savedAmount: linkedAccountId ? 0 : input.savedAmount,
    deadline: input.deadline ? new Date(input.deadline) : null,
    linkedAccountId,
  });
  return goal.toObject();
}

export async function updateGoal(
  id: string,
  input: UpdateGoalInput,
  auth: JWTPayload
) {
  await connectDB();
  const goal = await Goal.findOne({
    _id: toObjectId(id, "goalId"),
    userId: auth.userId,
  });
  if (!goal) throw new Error("Goal not found");
  if (input.name !== undefined) goal.name = input.name;
  if (input.target !== undefined) goal.target = input.target;
  if (input.savedAmount !== undefined) goal.savedAmount = input.savedAmount;
  if (input.deadline !== undefined)
    goal.deadline = input.deadline ? new Date(input.deadline) : null;
  if (input.archived !== undefined) goal.archived = input.archived;
  await goal.save();
  return goal.toObject();
}

// Top up (or withdraw with a negative amount) a manual goal's saved balance.
export async function contributeGoal(
  id: string,
  input: ContributeGoalInput,
  auth: JWTPayload
) {
  await connectDB();
  const goal = await Goal.findOne({
    _id: toObjectId(id, "goalId"),
    userId: auth.userId,
  });
  if (!goal) throw new Error("Goal not found");
  if (goal.linkedAccountId) {
    // "must" → handleRouteError maps this to 400, not a 500.
    throw new Error("A linked goal must be funded through its account, not a contribution.");
  }
  goal.savedAmount = Math.max(0, goal.savedAmount + input.amount);
  await goal.save();
  return goal.toObject();
}

export async function removeGoal(id: string, auth: JWTPayload) {
  await connectDB();
  const res = await Goal.deleteOne({
    _id: toObjectId(id, "goalId"),
    userId: auth.userId,
  });
  if (res.deletedCount === 0) throw new Error("Goal not found");
  return { deleted: true };
}
