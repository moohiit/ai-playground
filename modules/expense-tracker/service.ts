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
  Warranty,
  MoneyNote,
  Todo,
  GroupInvite,
  GroupSettlement,
  type ExpenseDoc,
  type GroupDoc,
  type RecurringRuleDoc,
} from "./models";
import {
  notifyGroupInvite,
  getUserPushConfig,
  checkAndNotifyBudget,
  checkAndNotifyAnomaly,
  notifyGroupExpense,
  notifyGroupPayment,
  notifyGroupSettled,
} from "./push";
import { evaluateBudget } from "./budget";
import { advance, dueOccurrences, isDue } from "./recurring";
import { goalProgress } from "./goal";

/**
 * Group membership, for authorization.
 *
 * removeMember DEACTIVATES a member who appears in the group's expenses rather
 * than deleting them, so their name survives in old splits — which means a
 * plain `members.some(m => m.userId === id)` still matches someone who was
 * removed. Every access check must ask whether they are *active*.
 *
 * `isActive !== false` rather than `=== true`: member subdocuments written
 * before the field existed have it undefined, and those people are still in
 * the group.
 */
function isActiveMember(
  group: { members: { userId: string; isActive?: boolean }[] },
  userId: string
): boolean {
  return group.members.some((m) => m.userId === userId && m.isActive !== false);
}

/** Mongo filter for the groups a user is still an active member of. Someone
 *  removed from a group must stop seeing its expenses, not just its detail page. */
function activeMemberFilter(userId: string) {
  return { members: { $elemMatch: { userId, isActive: { $ne: false } } } };
}

/**
 * Date-range filter bounds.
 *
 * An expense's `date` is stored as UTC midnight of the day it happened, while
 * the clients build dateFrom/dateTo from LOCAL midnight and send an instant.
 * West of UTC that instant lands *after* the stored midnight, so the first day
 * of every range silently dropped out (and east of UTC the previous evening
 * crept in). Snap both ends to whole UTC days so the range means the days the
 * user picked, wherever they are.
 */
function dayStart(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayEnd(iso: string): Date {
  const d = new Date(iso);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)
  );
}

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
    // Settlement records keep their own copy of the payer/payee names, so a
    // rename otherwise left the settled-history "settled via" rows showing the
    // old name forever.
    GroupSettlement.updateMany(
      { "transfers.from.id": userId },
      { $set: { "transfers.$[t].from.name": name } },
      { arrayFilters: [{ "t.from.id": userId }] }
    ),
    GroupSettlement.updateMany(
      { "transfers.to.id": userId },
      { $set: { "transfers.$[t].to.name": name } },
      { arrayFilters: [{ "t.to.id": userId }] }
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
  type CreateMoneyNoteInput,
  type UpdateMoneyNoteInput,
  type CreateTodoInput,
  type UpdateTodoInput,
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
  splitValuesFromItems,
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

  // Only the creator joins outright. Everyone else is INVITED, exactly as
  // addMember does for an existing group — adding them directly meant anyone
  // who knew your email address could put you in a group without asking, and
  // createExpense then included you in splits by default.
  const group = await Group.create({
    name: input.name,
    description: input.description,
    createdBy: auth.userId,
    members: [
      {
        userId: auth.userId,
        name: creator?.name ?? auth.name,
        email: creator?.email ?? auth.email,
        isActive: true,
      },
    ],
  });

  const invitees = users.filter((u) => u._id.toString() !== auth.userId);
  const inviterName = creator?.name ?? auth.name;
  const invites = await GroupInvite.insertMany(
    invitees.map((u) => ({
      groupId: group._id,
      groupName: group.name,
      invitedUserId: u._id.toString(),
      invitedEmail: u.email,
      invitedBy: { id: auth.userId, name: inviterName },
    }))
  );

  // Best-effort push — the invites work without it.
  await Promise.all(
    invitees.map((u) =>
      notifyGroupInvite(u._id.toString(), group.name, inviterName).catch(
        () => undefined
      )
    )
  );

  return { ...group.toObject(), invitedCount: invites.length };
}

export async function listGroups(auth: JWTPayload) {
  await connectDB();
  const groups = await Group.find(activeMemberFilter(auth.userId)).lean();
  if (groups.length === 0) return [];

  // Ordering follows activity, not age: the group someone just added an
  // expense to belongs on top. `createdAt` (when the entry was recorded)
  // rather than `date` — a backdated expense is not fresh activity.
  const rows = await Expense.aggregate<{ _id: mongoose.Types.ObjectId; lastExpenseAt: Date }>([
    { $match: { groupId: { $in: groups.map((g) => g._id) } } },
    { $group: { _id: "$groupId", lastExpenseAt: { $max: "$createdAt" } } },
  ]);
  const lastById = new Map(
    rows.map((r) => [r._id.toString(), r.lastExpenseAt?.getTime() ?? 0])
  );

  return groups
    .map((g) => {
      const last = lastById.get(g._id.toString()) ?? 0;
      return {
        ...g,
        // null for a group with no expenses yet — clients show "no expenses yet".
        lastExpenseAt: last ? new Date(last).toISOString() : null,
      };
    })
    .sort((a, b) => {
      // Groups with no expenses fall back to their own creation time, so a
      // brand-new empty group still surfaces above long-dormant ones.
      const at = a.lastExpenseAt ? Date.parse(a.lastExpenseAt) : new Date(a.createdAt).getTime();
      const bt = b.lastExpenseAt ? Date.parse(b.lastExpenseAt) : new Date(b.createdAt).getTime();
      return bt - at;
    });
}

export async function getGroup(id: string, auth: JWTPayload) {
  await connectDB();
  const group = await Group.findById(id).lean();
  if (!group) throw new Error("Group not found");
  if (!isActiveMember(group, auth.userId)) {
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
  const renamed = typeof data.name === "string" && data.name !== group.name;
  Object.assign(group, data);
  await group.save();

  // Pending invites carry a copy of the name for the invitee's banner.
  if (renamed) {
    await GroupInvite.updateMany(
      { groupId: group._id, status: "pending" },
      { $set: { groupName: group.name } }
    );
  }
  return group.toObject();
}

// Adding a registered user now sends an INVITE they must accept (in-app +
// push) instead of silently adding them. Guests (no account) are exempt and
// still added directly via addGuestMember.
export async function addMember(
  groupId: string,
  email: string,
  auth: JWTPayload
) {
  await connectDB();
  const group = await Group.findById(groupId);
  if (!group) throw new Error("Group not found");
  if (!isActiveMember(group, auth.userId)) {
    throw new Error("You are not a member of this group");
  }

  const user = await User.findOne({ email: email.toLowerCase() }).lean();
  if (!user) throw new Error("User not found. They need to register first.");
  const invitedUserId = user._id.toString();

  const existing = group.members.find((m) => m.userId === invitedUserId);
  if (existing?.isActive) throw new Error("User is already in this group");
  // (An inactive "left" member also goes through an invite — rejoining is
  // their choice; accepting reactivates their original entry.)

  const pending = await GroupInvite.findOne({
    groupId: group._id,
    invitedUserId,
    status: "pending",
  }).lean();
  if (pending) throw new Error("An invite is already pending for this user");

  const inviter = await User.findById(auth.userId).select("name").lean();
  const invite = await GroupInvite.create({
    groupId: group._id,
    groupName: group.name,
    invitedUserId,
    invitedEmail: user.email,
    invitedBy: { id: auth.userId, name: inviter?.name ?? auth.name },
  });

  // Best-effort push — the invite works without it.
  try {
    await notifyGroupInvite(invitedUserId, group.name, inviter?.name ?? auth.name);
  } catch {
    /* push is optional */
  }

  return { invited: true, invite: invite.toObject() };
}

/** Pending invites addressed to the signed-in user (newest first). */
export async function listMyInvites(auth: JWTPayload) {
  await connectDB();
  const invites = await GroupInvite.find({
    invitedUserId: auth.userId,
    status: "pending",
  })
    .sort({ createdAt: -1 })
    .lean();
  return invites.map((i) => ({ ...i, _id: i._id.toString() }));
}

/** Accept or reject an invite. Accepting joins (or reactivates) the member. */
export async function respondToInvite(
  inviteId: string,
  accept: boolean,
  auth: JWTPayload
) {
  await connectDB();
  // Atomically claim the pending invite (double-tap / two devices safe).
  const invite = await GroupInvite.findOneAndUpdate(
    {
      _id: toObjectId(inviteId, "inviteId"),
      invitedUserId: auth.userId,
      status: "pending",
    },
    {
      $set: {
        status: accept ? "accepted" : "rejected",
        respondedAt: new Date(),
      },
    },
    { new: true }
  );
  if (!invite) throw new Error("Invite not found (it may already be answered)");

  if (!accept) return { status: "rejected" as const };

  // The invite is already claimed at this point. If joining fails — the group
  // was deleted, or the write errors — hand the invite back, or the user is
  // left with an error and no invite: it has dropped out of their pending list
  // for good and only the creator can issue another.
  try {
    const group = await Group.findById(invite.groupId);
    if (!group) throw new Error("That group no longer exists");

    const user = await User.findById(auth.userId).select("name email").lean();
    const existing = group.members.find((m) => m.userId === auth.userId);
    if (existing) {
      existing.isActive = true;
      if (user) {
        existing.name = user.name;
        existing.email = user.email;
      }
    } else {
      group.members.push({
        userId: auth.userId,
        name: user?.name ?? auth.name,
        email: user?.email ?? auth.email,
        isActive: true,
      });
    }
    await group.save();
    return { status: "accepted" as const, group: group.toObject() };
  } catch (err) {
    await GroupInvite.updateOne(
      { _id: invite._id, status: "accepted" },
      { $set: { status: "pending", respondedAt: null } }
    ).catch(() => undefined);
    throw err;
  }
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
  if (!isActiveMember(group, auth.userId)) {
    throw new Error("You are not a member of this group");
  }
  // Scoped to GUESTS. Matching on name alone meant that adding a guest called
  // "Rahul" reactivated a removed member of the same name — handing a real
  // account its group access back, silently, from an action that is supposed
  // to create a placeholder.
  const sameName = group.members.find(
    (m) => m.isGuest && m.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (sameName) {
    // A guest who "left" (kept for history) can rejoin under the same name.
    if (sameName.isActive) {
      throw new Error("A guest with that name is already in this group");
    }
    sameName.isActive = true;
    await group.save();
    return group.toObject();
  }

  // A registered member with this name is a different person from a guest of
  // the same name; say so rather than silently creating a confusing duplicate.
  const realMember = group.members.find(
    (m) => !m.isGuest && m.isActive !== false &&
      m.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (realMember) {
    throw new Error(
      `${realMember.name} is already a member of this group — add the guest under a different name`
    );
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
  if (memberId === group.createdBy) {
    throw new Error("The group creator can't be removed — delete the group instead");
  }

  // If the member appears in any of this group's expenses (as payer or in a
  // split), hard-removing them would orphan that history: their name would
  // vanish from Members/balances and editing those expenses would fail
  // validation. Deactivate instead — name & details stay, they're excluded
  // from new splits, and re-adding them reactivates the same entry.
  const hasExpenses = await Expense.exists({
    groupId: group._id,
    $or: [
      { "paidBy.id": memberId },
      { "splitAmong.memberId": memberId },
      { "splits.memberId": memberId },
    ],
  });

  if (hasExpenses) {
    const member = group.members.find((m) => m.userId === memberId);
    if (!member) throw new Error("Member not found in this group");
    member.isActive = false;
  } else {
    group.members = group.members.filter(
      (m) => m.userId !== memberId
    ) as typeof group.members;
  }
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
  await GroupInvite.deleteMany({ groupId: id });
  await GroupSettlement.deleteMany({ groupId: id });
  await Group.findByIdAndDelete(id);
}

// ── Expenses ────────────────────────────────────────

/**
 * Budget-threshold and anomaly notifications for a newly written expense.
 *
 * This used to live in the POST /expenses route, so expenses posted by the
 * recurring cron — rent, EMIs, subscriptions, the largest and most
 * budget-relevant entries there are — silently blew through budgets with no
 * alert. Sitting in the service, every write path gets it.
 *
 * Always best effort: a push failure must never fail the save.
 */
export async function notifyForExpense(
  userId: string,
  expense: {
    type: string;
    direction?: string;
    category: string;
    amount: number;
    amountBase?: number;
    description: string;
  }
) {
  if (expense.type !== "personal" || expense.direction !== "expense") return;
  try {
    const config = await getUserPushConfig(userId);
    if (!config) return;
    await Promise.all([
      checkAndNotifyBudget(userId, config, expense.category),
      checkAndNotifyAnomaly(
        userId,
        config,
        expense.category,
        expense.amountBase ?? expense.amount,
        expense.description
      ),
    ]);
  } catch {
    /* notifications are optional */
  }
}

export async function createExpense(
  input: CreateExpenseInput,
  auth: JWTPayload
) {
  await connectDB();

  let splitAmong = input.splitAmong ?? [];
  let splits: { memberId: string; name: string; amount: number }[] = [];
  // What the split actually resolved to — for an item split this is derived,
  // so it is not simply what the client sent.
  let resolvedSplitValues: { memberId: string; value: number }[] | undefined;
  // Held beyond the branch so the group can be notified after the write.
  let group: GroupDoc | null = null;

  if (input.type === "group") {
    if (!input.groupId) {
      throw new Error("A group is required for a group expense");
    }
    group = await Group.findById(input.groupId).lean();
    if (!group) throw new Error("Group not found");
    if (!isActiveMember(group, auth.userId)) {
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

    // An item split is derived here, never trusted from the client: the
    // values must follow from the lines actually stored on the expense, or the
    // receipt and the division could disagree.
    const mode = input.splitMode ?? "equal";
    const values =
      mode === "items"
        ? splitValuesFromItems(input.amount, input.items ?? [], splitAmong)
        : input.splitValues;
    splits = calculateSplits(input.amount, splitAmong, mode, values);
    resolvedSplitValues = values;
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
    splitMode: input.type === "group" ? input.splitMode ?? "equal" : "equal",
    splitValues: input.type === "group" ? resolvedSplitValues ?? [] : [],
    items: input.items ?? [],
  });

  const created = expense.toObject();
  await notifyForExpense(auth.userId, created);

  // Tell the rest of the group. Best effort — a push failure must never fail
  // the save, and the group was already loaded above.
  if (created.type === "group" && group) {
    try {
      const { baseCurrency: actorBase } = await getPrefs(auth);
      await notifyGroupExpense({
        memberIds: group.members.filter((m) => m.isActive).map((m) => m.userId),
        actorId: auth.userId,
        actorName: created.paidBy?.name ?? auth.name,
        groupName: group.name,
        description: created.description,
        amountBase: created.amountBase ?? created.amount,
        currency: actorBase,
      });
    } catch {
      /* notifications are optional */
    }
  }

  return created;
}

// "Only mine": personal entries (always wholly mine) plus group entries I am
// actually split into. A group entry split among other members only costs me
// nothing, so it drops out.
function mineClause(userId: string) {
  return {
    $or: [
      { type: "personal", createdBy: userId },
      { "splits.memberId": userId },
    ],
  };
}

// Shared query builder for the expense list + CSV export, so both apply identical
// scoping/filtering. Verifies group access; does NOT page (callers add skip/limit).
type ExpenseQueryFilter = Pick<
  ExpenseFilter,
  "groupId" | "type" | "direction" | "category" | "q" | "dateFrom" | "dateTo" | "settled"
> & { mine?: "true" | "false"; includeSettlements?: "true" | "false" };

async function buildExpenseQuery(
  filter: ExpenseQueryFilter,
  auth: JWTPayload
): Promise<Record<string, unknown>> {
  if (filter.groupId) {
    const group = await Group.findById(filter.groupId).lean();
    if (!group || !isActiveMember(group, auth.userId)) {
      throw new Error("Group not found or access denied");
    }
  }

  const query: Record<string, unknown> = {};

  // Settlement payments are balance entries, not spending. getSummary drops
  // them (`match.isSettlement = { $ne: true }`), so the list, its count and
  // the CSV export must drop them as well — otherwise the header total and
  // the rows underneath describe different sets of entries, and a repayment
  // received shows up as if the recipient had spent it.
  if (filter.includeSettlements !== "true") {
    query.isSettlement = { $ne: true };
  }

  if (filter.groupId) {
    query.groupId = filter.groupId;
  } else if (filter.type === "personal") {
    query.createdBy = auth.userId;
    query.type = "personal";
  } else if (filter.type === "group") {
    const userGroups = await Group.find(
      activeMemberFilter(auth.userId),
      { _id: 1 }
    ).lean();
    query.groupId = { $in: userGroups.map((g) => g._id) };
  } else {
    const userGroups = await Group.find(
      activeMemberFilter(auth.userId),
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

  if (filter.mine === "true") {
    query.$and = [
      ...(Array.isArray(query.$and) ? query.$and : []),
      mineClause(auth.userId),
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
      (query.date as Record<string, unknown>).$gte = dayStart(filter.dateFrom);
    if (filter.dateTo)
      (query.date as Record<string, unknown>).$lte = dayEnd(filter.dateTo);
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
      // Newest expense date first; within the same day, most-recently-added
      // first. createdAt (then _id) is a stable tiebreaker so ordering is
      // deterministic and pagination doesn't shuffle same-date rows.
      .sort({ date: -1, createdAt: -1, _id: -1 })
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
    .sort({ date: -1, createdAt: -1, _id: -1 })
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
    if (!group || !isActiveMember(group, auth.userId)) {
      throw new Error("Access denied");
    }
  } else if (expense.createdBy !== auth.userId) {
    throw new Error("Access denied");
  }

  // Settled rows are part of a recorded settlement — editing them would
  // silently rewrite settlement history (getSettlementHistory re-reads live
  // rows) without resetting settledAt.
  if (expense.settledAt) {
    throw new Error(
      "This expense is already settled — settled records can't be edited"
    );
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
    if (!target || !isActiveMember(target, auth.userId)) {
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
    // A partial update may change the amount, the members, the mode or the
    // values independently — fall back to what is stored for whatever it does
    // not carry, then recompute from the combination. Editing the amount of a
    // percentage split has to redistribute; editing it on an EXACT split
    // cannot, because the stored amounts no longer add up, so that falls back
    // to an equal division rather than silently keeping stale numbers.
    const splitMode = input.splitMode ?? expense.splitMode ?? "equal";
    const amountChanged =
      input.amount !== undefined && input.amount !== expense.amount;

    let effectiveMode = splitMode;
    let effectiveValues: { memberId: string; value: number }[] | undefined;

    if (splitMode === "items") {
      // Always re-derived from the lines being stored, so editing an item's
      // price or reassigning it redistributes without the client resending
      // anything.
      const items = (input.items ??
        (expense.items as { price: number; quantity?: number; assignedTo?: string[] }[])) ??
        [];
      effectiveValues = splitValuesFromItems(amount, items, splitAmong ?? []);
    } else {
      const stored = expense.splitValues as
        | { memberId: string; value: number }[]
        | undefined;
      const splitValues = input.splitValues ?? stored;
      // Changing the amount of an EXACT split without resending the values
      // leaves numbers that no longer add up, so fall back to an equal
      // division rather than keeping them.
      const staleExact =
        splitMode === "exact" && amountChanged && input.splitValues === undefined;
      effectiveMode = staleExact ? "equal" : splitMode;
      effectiveValues = staleExact ? undefined : splitValues;
    }

    expense.splitAmong = splitAmong as typeof expense.splitAmong;
    expense.splits = calculateSplits(
      amount,
      splitAmong ?? [],
      effectiveMode,
      effectiveValues
    );
    expense.splitMode = effectiveMode;
    expense.splitValues = (effectiveValues ??
      []) as typeof expense.splitValues;
    expense.groupId = toObjectId(newGroupId, "groupId");
  } else {
    // Personal expenses carry no group / splits.
    expense.groupId = null;
    expense.splitAmong = [] as typeof expense.splitAmong;
    expense.splits = [];
    expense.splitMode = "equal";
    expense.splitValues = [] as typeof expense.splitValues;
  }

  if (input.amount !== undefined) expense.amount = input.amount;
  if (input.description !== undefined) expense.description = input.description;
  if (input.category !== undefined) expense.category = input.category;
  if (input.date !== undefined) expense.date = new Date(input.date);
  if (input.paidBy !== undefined) expense.paidBy = input.paidBy;
  expense.type = newType;
  expense.direction = newDirection;

  // Re-freeze the base-currency amount whenever amount/currency changes (or backfill
  // a pre-1B row that has no amountBase yet). amountBase is always frozen in the
  // CREATOR's base currency — group expenses are editable by any member, and using
  // the editor's base here would corrupt the creator's summaries/reports.
  const baseCurrency = await getBaseCurrency(expense.createdBy);
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
  // Mirror guard: flipping income → expense used to keep the income category
  // (e.g. a "Salary" spending row), polluting byCategory and never matching
  // any category budget.
  if (
    newDirection === "expense" &&
    !(CATEGORIES as readonly string[]).includes(expense.category)
  ) {
    throw new Error("Spending must use an expense category");
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
    if (!group || !isActiveMember(group, auth.userId)) {
      throw new Error("Access denied");
    }
  } else if (expense.createdBy !== auth.userId) {
    throw new Error("Access denied");
  }

  // Settled rows belong to a recorded settlement batch. Editing one is already
  // refused (updateExpense); deleting one silently rewrote the same history,
  // because getSettlementHistory re-reads the live rows to rebuild each batch's
  // Paid/Share table.
  if (expense.settledAt) {
    throw new Error(
      "This expense is already settled — settled records can't be deleted"
    );
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

  // Normalize against our enums, exactly as parseNaturalExpense does. The
  // model answers with free text, so a near-miss like "Dining" or "Groceries"
  // matched no option in the category picker: the web <select> fell back to
  // its first entry and the mobile chips showed nothing selected, silently
  // recategorising the expense. A date it cannot read did the same.
  const r = parsed.data;
  return {
    ...r,
    category: (CATEGORIES as readonly string[]).includes(r.category)
      ? r.category
      : "Other",
    date: !isNaN(Date.parse(r.date))
      ? r.date.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  };
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
    if (!group || !isActiveMember(group, auth.userId)) {
      throw new Error("Group not found or access denied");
    }
    match.groupId = group._id;
    groupNameById.set(group._id.toString(), group.name);
  } else {
    const userGroups = await Group.find(
      activeMemberFilter(auth.userId),
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

  // Settlement payments (member repaying member) are balance entries, not
  // spending — keep them out of every summary/report figure.
  match.isSettlement = { $ne: true };

  if (filter.mine === "true") {
    match.$and = [...((match.$and as unknown[]) ?? []), mineClause(auth.userId)];
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
      (match.date as Record<string, unknown>).$gte = dayStart(filter.dateFrom);
    if (filter.dateTo)
      (match.date as Record<string, unknown>).$lte = dayEnd(filter.dateTo);
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
  const { weekStart } = await getPrefs(auth);
  const round = (n: number) => Math.round(n * 100) / 100;

  let totalAmount = 0; // spending only (excludes income)
  let incomeAmount = 0;
  let incomeCount = 0;
  let myShare = 0;
  let myCount = 0;
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
    { category: string; total: number; myShare: number; count: number }
  >();
  const byMonthMap = new Map<
    string,
    { year: number; month: number; total: number; myShare: number; count: number }
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

    // What this entry cost the viewer: personal entries in full, group
    // entries only for their split. Tracked per row so breakdowns can report
    // my share the same way the headline figures do.
    let mine = 0;
    if (e.type === "personal") {
      personalTotal += baseAmt;
      mine = baseAmt;
    } else {
      groupTotal += baseAmt;
      const myPart = (e.splits ?? []).find((s) => s.memberId === userId);
      if (myPart) mine = myPart.amount * ratio;
    }
    myShare += mine;
    // Entries the viewer is actually part of — the denominator for their own
    // per-transaction average. A group entry split only among other members
    // costs them nothing and must not dilute it.
    if (mine > 0) myCount += 1;

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
      myShare: 0,
      count: 0,
    };
    cat.total += baseAmt;
    cat.myShare += mine;
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
      myShare: 0,
      count: 0,
    };
    m.total += baseAmt;
    m.myShare += mine;
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
    // Same whole-day snapping the filter itself uses, or a range built from
    // local midnight counted a fractional day and skewed averagePerDay.
    days = Math.max(
      1,
      Math.round(
        (dayStart(filter.dateTo).getTime() - dayStart(filter.dateFrom).getTime()) /
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
  // The same two averages restricted to the viewer's own share. Per-day spans
  // the same window as the overall figure so the two are directly comparable;
  // per-transaction divides by the entries that include them, not by all of them.
  const myAveragePerTransaction = myCount > 0 ? myShare / myCount : 0;
  const myAveragePerDay = days > 0 ? myShare / days : 0;

  return {
    totalAmount: round(totalAmount),
    totalCount,
    incomeAmount: round(incomeAmount),
    incomeCount,
    netAmount: round(incomeAmount - totalAmount),
    myShare: round(myShare),
    myCount,
    paidByMe: round(paidByMe),
    paidByOthers: round(paidByOthers),
    personalTotal: round(personalTotal),
    groupTotal: round(groupTotal),
    averagePerDay: round(averagePerDay),
    averagePerTransaction: round(averagePerTransaction),
    myAveragePerDay: round(myAveragePerDay),
    myAveragePerTransaction: round(myAveragePerTransaction),
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
    // Ordered from the user's chosen first day. The preference was stored,
    // validated and settable on both clients but read by nothing, so the
    // Settings toggle moved and no chart ever changed. Rotating here fixes
    // both clients at once; labels follow each entry's own `day` index.
    byDayOfWeek: [
      ...byDayOfWeek.slice(weekStart),
      ...byDayOfWeek.slice(0, weekStart),
    ].map((d) => ({ ...d, total: round(d.total) })),
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
  if (!group || !isActiveMember(group, auth.userId)) {
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

/**
 * "Do I owe anyone anything right now?" — across every group at once.
 *
 * Balances have always been computed one group at a time, so the app could
 * answer "what is my position in Room B4" but never the question people
 * actually open it with. Each group's minimal-transfer plan is computed as
 * usual and the rows involving the viewer are netted BY PERSON across groups,
 * so a flatmate who owes you in one group and is owed in another shows up once
 * with the difference, not twice with two halves that need mental arithmetic.
 *
 * Everything is in the viewer's base currency (calculateBalances works on
 * amountBase), which is what makes netting across groups meaningful at all.
 */
export async function getMyBalances(auth: JWTPayload) {
  await connectDB();

  const groups = await Group.find(activeMemberFilter(auth.userId)).lean();
  if (groups.length === 0) {
    return { owedToMe: 0, iOwe: 0, net: 0, byPerson: [], byGroup: [] };
  }

  const expenses = await Expense.find({
    groupId: { $in: groups.map((g) => g._id) },
    type: "group",
    $or: [{ settledAt: null }, { settledAt: { $exists: false } }],
  }).lean();

  const byGroupExpenses = new Map<string, ExpenseDoc[]>();
  for (const e of expenses) {
    const key = e.groupId?.toString();
    if (!key) continue;
    const list = byGroupExpenses.get(key) ?? [];
    list.push(e as ExpenseDoc);
    byGroupExpenses.set(key, list);
  }

  const perPerson = new Map<string, { id: string; name: string; net: number }>();
  const byGroup: {
    groupId: string;
    groupName: string;
    net: number;
    owedToMe: number;
    iOwe: number;
  }[] = [];

  for (const group of groups) {
    const gid = group._id.toString();
    const plan = calculateSettlements(
      calculateBalances(byGroupExpenses.get(gid) ?? [])
    );

    let owedToMe = 0;
    let iOwe = 0;
    for (const t of plan) {
      // Positive = they owe me, negative = I owe them.
      const delta =
        t.to.id === auth.userId
          ? t.amount
          : t.from.id === auth.userId
            ? -t.amount
            : 0;
      if (delta === 0) continue;

      const other = t.to.id === auth.userId ? t.from : t.to;
      const entry = perPerson.get(other.id) ?? {
        id: other.id,
        name: other.name,
        net: 0,
      };
      entry.net = Math.round((entry.net + delta) * 100) / 100;
      perPerson.set(other.id, entry);

      if (delta > 0) owedToMe += delta;
      else iOwe += -delta;
    }

    if (owedToMe > 0.01 || iOwe > 0.01) {
      byGroup.push({
        groupId: gid,
        groupName: group.name,
        net: Math.round((owedToMe - iOwe) * 100) / 100,
        owedToMe: Math.round(owedToMe * 100) / 100,
        iOwe: Math.round(iOwe * 100) / 100,
      });
    }
  }

  // A person can net to zero across groups — that is a real answer ("you two
  // are square"), but it does not belong in a list of outstanding debts.
  const people = Array.from(perPerson.values())
    .filter((p) => Math.abs(p.net) > 0.01)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  const owedToMe = people
    .filter((p) => p.net > 0)
    .reduce((s, p) => s + p.net, 0);
  const iOwe = people.filter((p) => p.net < 0).reduce((s, p) => s - p.net, 0);

  return {
    owedToMe: Math.round(owedToMe * 100) / 100,
    iOwe: Math.round(iOwe * 100) / 100,
    net: Math.round((owedToMe - iOwe) * 100) / 100,
    byPerson: people,
    byGroup: byGroup.sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
  };
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

  // Balances need the settle-up payments (that is how the nets offset), but
  // the headline total and count must not: a repayment is money moving
  // between members, not group spending. Counting it made the public link
  // disagree with what members see inside the app.
  const balances = calculateBalances(expenses as ExpenseDoc[]);
  const settlements = calculateSettlements(balances);
  const spend = expenses.filter((e) => !e.isSettlement);

  // Dominant currency among the group's expenses (groups are single-currency in v1).
  const counts = new Map<string, number>();
  for (const e of spend) {
    const c = e.currency ?? "INR";
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const currency =
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "INR";
  const total = spend.reduce((s, e) => s + e.amount, 0);

  return {
    groupName: group.name,
    currency,
    expenseCount: spend.length,
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

/**
 * Individual settle-up: record that one member paid another. Modeled as a
 * settlement entry — payer's "paid" rises, receiver's "share" rises by the
 * same amount, so their nets offset and the derived transfer plan drops (or
 * shrinks) that row. Original expenses are untouched; the entry is excluded
 * from spending summaries (isSettlement) and gets swept into settled history
 * with the batch when the group is fully settled.
 */
export async function recordSettlementPayment(
  groupId: string,
  input: { fromMemberId: string; toMemberId: string; amount: number },
  auth: JWTPayload
) {
  await connectDB();
  const group = await Group.findById(groupId).lean();
  if (!group) throw new Error("Group not found");
  if (!isActiveMember(group, auth.userId)) {
    throw new Error("You are not a member of this group");
  }
  const from = group.members.find((m) => m.userId === input.fromMemberId);
  const to = group.members.find((m) => m.userId === input.toMemberId);
  if (!from || !to) {
    throw new Error("Both people must be members of this group");
  }
  if (from.userId === to.userId) {
    throw new Error("Payer and receiver must be different members");
  }
  if (!(input.amount > 0)) throw new Error("Amount must be positive");

  const { baseCurrency } = await getPrefs(auth);
  const amount = Math.round(input.amount * 100) / 100;

  const expense = await Expense.create({
    type: "group",
    direction: "expense",
    groupId: group._id,
    createdBy: auth.userId,
    paidBy: { id: from.userId, name: from.name },
    amount,
    currency: baseCurrency,
    amountBase: amount,
    description: `${from.name} paid ${to.name}`,
    category: "Settlement",
    date: new Date(),
    splitAmong: [{ memberId: to.userId, name: to.name }],
    splits: [{ memberId: to.userId, name: to.name, amount }],
    isSettlement: true,
  });

  // Tell the group someone paid someone back — best effort.
  try {
    await notifyGroupPayment({
      memberIds: group.members.filter((m) => m.isActive).map((m) => m.userId),
      actorId: auth.userId,
      fromName: from.name,
      toName: to.name,
      groupName: group.name,
      amountBase: amount,
      currency: baseCurrency,
    });
  } catch {
    /* notifications are optional */
  }

  // Settling the last outstanding transfer leaves everyone square, and there
  // was no way to then close the window short of also pressing "Mark as
  // Settled". Once nobody owes anybody, close it automatically.
  const active = await Expense.find({
    groupId: group._id,
    type: "group",
    $or: [{ settledAt: null }, { settledAt: { $exists: false } }],
  }).lean();

  const balances = calculateBalances(active as ExpenseDoc[]);
  const squared =
    balances.length > 0 && balances.every((b) => Math.abs(b.netBalance) < 0.01);
  // A window holding nothing but settle-up payments has no spend to settle.
  const hasSpend = active.some((e) => !e.isSettlement);

  if (squared && hasSpend) {
    const settlement = await closeActiveWindow(group, auth);
    return { expense: expense.toObject(), autoSettled: true, settlement };
  }

  return { expense: expense.toObject(), autoSettled: false };
}

/**
 * Close the group's active window: real expenses move into a settled batch,
 * and the individual settle-up payments recorded along the way are lifted out
 * of the expense list into a GroupSettlement record.
 *
 * Keeping those payment rows in the batch made the history table lie — a
 * member who paid ₹612 and was repaid ₹612 showed Paid and Share both
 * inflated and a net of zero, hiding what the group actually spent. The
 * payments are still preserved, just as transfers rather than expenses.
 */
async function closeActiveWindow(
  group: { _id: mongoose.Types.ObjectId },
  auth: JWTPayload
) {
  const oid = group._id;
  const settlementId = `settle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  // Claim the window atomically before reading it. Two members pressing
  // Settle at the same moment (or a settle racing the auto-close that fires
  // on the last settle-up payment) would otherwise both read the same rows
  // and write two settlement records for one batch.
  const claim = await Expense.updateMany(
    {
      groupId: oid,
      type: "group",
      isSettlement: { $ne: true },
      $or: [{ settledAt: null }, { settledAt: { $exists: false } }],
    },
    { $set: { settledAt: now, settlementId } }
  );

  if (claim.modifiedCount === 0) {
    throw new Error("No unsettled expenses in this group");
  }

  const spend = await Expense.find({ settlementId }).lean();
  // Payments are claimed separately: whoever won the spend rows takes them.
  const payments = await Expense.find({
    groupId: oid,
    type: "group",
    isSettlement: true,
    $or: [{ settledAt: null }, { settledAt: { $exists: false } }],
  }).lean();

  const transfers = payments.map((p) => ({
    from: { id: p.paidBy.id, name: p.paidBy.name },
    to: {
      id: p.splits?.[0]?.memberId ?? "",
      name: p.splits?.[0]?.name ?? "-",
    },
    amount: p.amountBase ?? p.amount,
    paidAt: p.date,
  }));

  // The spend rows are already stamped (that was the claim). Record the batch
  // before dropping the payment rows, so a failure between the two leaves the
  // transfers recorded rather than lost.
  await GroupSettlement.create({
    groupId: oid,
    settlementId,
    settledAt: now,
    settledBy: auth.userId,
    transfers,
  });

  if (payments.length > 0) {
    await Expense.deleteMany({ _id: { $in: payments.map((p) => p._id) } });
  }

  const balances = calculateBalances(spend as ExpenseDoc[]);
  const settlementPlan = calculateSettlements(balances);

  // Closing the window affects everyone's ledger, so everyone hears about it.
  try {
    const full = await Group.findById(oid).lean();
    if (full) {
      const actor = await User.findById(auth.userId).select("name").lean();
      await notifyGroupSettled({
        memberIds: full.members.filter((m) => m.isActive).map((m) => m.userId),
        actorId: auth.userId,
        actorName: actor?.name ?? auth.name,
        groupName: full.name,
        expenseCount: spend.length,
      });
    }
  } catch {
    /* notifications are optional */
  }

  return {
    settlementId,
    settledAt: now,
    expenseCount: spend.length,
    balances,
    settlements: settlementPlan,
    transfers,
  };
}

export async function settleGroup(groupId: string, auth: JWTPayload) {
  await connectDB();

  const group = await Group.findById(groupId).lean();
  if (!group || !isActiveMember(group, auth.userId)) {
    throw new Error("Group not found or access denied");
  }

  return closeActiveWindow(group, auth);
}

/**
 * The five summary variants the dashboard renders, plus the personal settle
 * history, resolved together.
 *
 * The clients fired these as six separate requests on every focus — six round
 * trips before the first figure appeared. They still run as six queries here,
 * but in parallel inside one request, so the client waits for the slowest
 * rather than the sum.
 */
export async function getDashboardSummaries(auth: JWTPayload) {
  const [all, active, settled, personalActive, groupActive, history] =
    await Promise.all([
      getSummary({ scope: "all", settled: "all", mine: "false" }, auth),
      getSummary({ scope: "all", settled: "false", mine: "false" }, auth),
      getSummary({ scope: "all", settled: "true", mine: "false" }, auth),
      getSummary({ scope: "personal", settled: "false", mine: "false" }, auth),
      getSummary({ scope: "group", settled: "false", mine: "false" }, auth),
      getPersonalSettlementHistory(auth),
    ]);

  return {
    all,
    active,
    settled,
    personalActive,
    groupActive,
    lastPersonalSettle: history[0]?.settledAt ?? null,
  };
}

export async function getSettlementHistory(groupId: string, auth: JWTPayload) {
  await connectDB();

  const group = await Group.findById(groupId).lean();
  if (!group || !isActiveMember(group, auth.userId)) {
    throw new Error("Group not found or access denied");
  }

  const oid = toObjectId(groupId, "groupId");

  const settled = await Expense.find({
    groupId: oid,
    type: "group",
    settledAt: { $ne: null },
  })
    .sort({ settledAt: -1, date: -1, createdAt: -1, _id: -1 })
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

  // How the group actually squared up, for batches closed after the payment
  // rows were lifted out. Older batches have no record and fall back to the
  // plan the clients recompute from Paid − Share.
  const records = await GroupSettlement.find({
    settlementId: { $in: Array.from(grouped.keys()) },
  }).lean();
  const transfersById = new Map(records.map((r) => [r.settlementId, r.transfers]));

  return Array.from(grouped.values()).map((batch) => ({
    ...batch,
    transfers: transfersById.get(batch.settlementId) ?? [],
  }));
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

  await GroupSettlement.deleteMany({ groupId: { $in: ownGroupIds } });

  // Delete the groups they own.
  await Group.deleteMany({ createdBy: userId });

  // Remove the user's accounts/wallets, transfers, budgets, recurring, goals,
  // warranties, prefs. (Warranties were previously missed — orphaned personal
  // data surviving account deletion is a privacy defect.)
  await Account.deleteMany({ userId });
  await Transfer.deleteMany({ userId });
  await Budget.deleteMany({ userId });
  await RecurringRule.deleteMany({ userId });
  await Goal.deleteMany({ userId });
  await Warranty.deleteMany({ userId });
  await MoneyNote.deleteMany({ userId });
  await Todo.deleteMany({ userId });
  await GroupInvite.deleteMany({
    $or: [{ invitedUserId: userId }, { "invitedBy.id": userId }],
  });
  await UserPrefs.deleteMany({ userId });

  // Deactivate the user in groups owned by others. Their past group expenses
  // stay for those groups' balance accuracy (per the privacy policy), and
  // those expenses still name them in splits — hard-pulling the member left
  // those rows referencing someone the group no longer knows, which breaks
  // editing them and erases the name from every balance table.
  await Group.updateMany(
    { "members.userId": userId },
    { $set: { "members.$[m].isActive": false } },
    { arrayFilters: [{ "m.userId": userId }] }
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
    .sort({ settledAt: -1, date: -1, createdAt: -1, _id: -1 })
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
    // Accounts, transfers, budgets, and goals are all stored in the BASE
    // currency too — leaving them alone turned an ₹80,000 opening balance
    // into "$80,000" after an INR→USD switch (and budgets/goals likewise
    // kept old-base numbers compared against new-base spending).
    await rebaseBaseCurrencyDocs(auth.userId, prevBase, prefs!.baseCurrency);
  }

  return {
    baseCurrency: prefs!.baseCurrency,
    locale: prefs!.locale,
    weekStart: prefs!.weekStart,
  };
}

// Convert every base-currency-denominated document (account opening balances,
// transfers, budget limits, goal targets/saved) from the old base to the new one.
async function rebaseBaseCurrencyDocs(
  userId: string,
  fromBase: string,
  toBase: string
) {
  if (fromBase === toBase) return;

  const [accounts, transfers, budgets, goals] = await Promise.all([
    Account.find({ userId }).select("openingBalance").lean(),
    Transfer.find({ userId }).select("amount").lean(),
    Budget.find({ userId }).select("amount").lean(),
    Goal.find({ userId }).select("target savedAmount").lean(),
  ]);

  for (const a of accounts) {
    await Account.updateOne(
      { _id: a._id },
      { $set: { openingBalance: await convert(a.openingBalance ?? 0, fromBase, toBase), currency: toBase } }
    );
  }
  for (const t of transfers) {
    await Transfer.updateOne(
      { _id: t._id },
      { $set: { amount: await convert(t.amount, fromBase, toBase) } }
    );
  }
  for (const b of budgets) {
    await Budget.updateOne(
      { _id: b._id },
      { $set: { amount: await convert(b.amount, fromBase, toBase) } }
    );
  }
  for (const g of goals) {
    await Goal.updateOne(
      { _id: g._id },
      {
        $set: {
          target: await convert(g.target, fromBase, toBase),
          savedAmount: await convert(g.savedAmount ?? 0, fromBase, toBase),
        },
      }
    );
  }
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
  // Recurring templates that paid from this account would otherwise keep
  // stamping new expenses with a dead accountId — those rows silently vanish
  // from every account balance.
  await RecurringRule.updateMany(
    { userId: auth.userId, "template.accountId": account._id },
    { $set: { "template.accountId": null } }
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

// A transfer row reads as gibberish without the two account names, and the
// clients can't fill them in from their own account list: that list hides
// archived accounts, which an older transfer may well point at.
export async function listTransfers(auth: JWTPayload) {
  await connectDB();
  const [transfers, accounts] = await Promise.all([
    Transfer.find({ userId: auth.userId }).sort({ date: -1 }).lean(),
    Account.find({ userId: auth.userId }).select("name").lean(),
  ]);
  const nameById = new Map(accounts.map((a) => [a._id.toString(), a.name]));
  return transfers.map((t) => ({
    ...t,
    fromName: nameById.get(t.fromAccountId.toString()) ?? "Unknown account",
    toName: nameById.get(t.toAccountId.toString()) ?? "Unknown account",
  }));
}

// Balances are derived on every read by computeBalanceDeltas, which sums the
// surviving Transfer rows — so dropping the row is all it takes for both the
// sending and the receiving account to go back to their pre-transfer figures.
export async function removeTransfer(id: string, auth: JWTPayload) {
  await connectDB();
  const res = await Transfer.deleteOne({
    _id: toObjectId(id, "transferId"),
    userId: auth.userId,
  });
  if (res.deletedCount === 0) throw new Error("Transfer not found");
  return { deleted: true };
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

  const expense = await Expense.create({
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

  await notifyForExpense(rule.userId, expense.toObject());
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
    if (dates.length === 0) {
      // A rule whose endDate passed before nextRunAt yields no occurrences
      // but still matches the cron filter (active, nextRunAt <= now) — it
      // would be re-scanned every day forever. Retire it.
      if (rule.endDate && rule.endDate.getTime() < rule.nextRunAt.getTime()) {
        await RecurringRule.updateOne(
          { _id: rule._id, active: true },
          { $set: { active: false } }
        );
      }
      continue;
    }
    // Atomically CLAIM the batch before creating expenses: advance nextRunAt
    // only if it still holds the value we read. Concurrent invocations (daily
    // cron overlapping a lazy-on-open run, or two devices) then can't both
    // post the same occurrences — the loser's compare-and-swap misses and it
    // skips. Claiming first also means a crash mid-run can at worst miss a
    // posting (recoverable) instead of double-charging (silent corruption).
    const claim = await RecurringRule.findOneAndUpdate(
      { _id: rule._id, active: true, nextRunAt: rule.nextRunAt },
      {
        $set: {
          nextRunAt,
          lastRunAt: dates[dates.length - 1],
          ...(rule.endDate && nextRunAt.getTime() > rule.endDate.getTime()
            ? { active: false }
            : {}),
        },
      }
    );
    if (!claim) continue;
    for (const d of dates) {
      await createExpenseFromRule(rule, d);
      created += 1;
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
  const next = advance(date, rule.cadence);
  // Claim the occurrence atomically (same compare-and-swap as runDueRecurring)
  // so a double-tap on "Post now" or a concurrent cron run can't post it twice.
  const claim = await RecurringRule.findOneAndUpdate(
    { _id: rule._id, userId: auth.userId, active: true, nextRunAt: date },
    {
      $set: {
        lastRunAt: date,
        nextRunAt: next,
        ...(rule.endDate && next.getTime() > rule.endDate.getTime()
          ? { active: false }
          : {}),
      },
    },
    { new: true }
  );
  if (!claim) throw new Error("This occurrence was already posted");
  await createExpenseFromRule(rule, date);
  return claim.toObject();
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
/**
 * @param today The caller's local date as "YYYY-MM-DD". The server runs in UTC
 * and cannot know the user's timezone, so on the 1st of a month an IST user
 * (before 05:30) was shown last month's projection, and a user west of UTC saw
 * next month's empty one late on the last day. The clients send their own date;
 * anything missing or malformed falls back to the server's.
 */
export async function getForecast(auth: JWTPayload, today?: string) {
  await connectDB();
  const local = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : null;
  const now = local ? new Date(`${local}T00:00:00.000Z`) : new Date();
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
    getSummary({ scope: "all", settled: "all", mine: "false" }, auth),
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

export async function listGoals(
  auth: JWTPayload,
  opts: { includeArchived?: boolean } = {}
) {
  await connectDB();
  // Mirrors listAccounts. Without a way to read archived goals back, archiving
  // one would hide it permanently — which is why neither client offered the
  // action even though updateGoalSchema accepts the flag.
  const filter: Record<string, unknown> = { userId: auth.userId };
  if (!opts.includeArchived) filter.archived = false;

  const goals = await Goal.find(filter).sort({ createdAt: 1 }).lean();

  // Account-linked goals track that account's live balance. Include archived
  // accounts — archiving an account shouldn't zero a linked goal's progress
  // (the money didn't move, only the visibility flag).
  const needBalances = goals.some((g) => g.linkedAccountId);
  const balanceById = new Map<string, number>();
  if (needBalances) {
    const accounts = await listAccounts(auth, { includeArchived: true });
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

// ── Money notes (informal lent/borrowed) ────────────

export async function listMoneyNotes(auth: JWTPayload) {
  await connectDB();
  const notes = await MoneyNote.find({ userId: auth.userId }).lean();
  const now = Date.now();
  // Outstanding first (soonest due at the top, no-due-date last), then
  // settled ones newest-first.
  const open = notes
    .filter((n) => !n.settledAt)
    .sort((a, b) => {
      const ad = a.dueBy ? new Date(a.dueBy).getTime() : Infinity;
      const bd = b.dueBy ? new Date(b.dueBy).getTime() : Infinity;
      return ad - bd;
    });
  const settled = notes
    .filter((n) => n.settledAt)
    .sort(
      (a, b) =>
        new Date(b.settledAt!).getTime() - new Date(a.settledAt!).getTime()
    );
  return [...open, ...settled].map((n) => ({
    ...n,
    _id: n._id.toString(),
    // A note is overdue only AFTER its due date, not on it. dueBy is stored at
    // UTC midnight, so comparing it to "now" flagged the note as overdue from
    // the first moment of the day it was actually due.
    overdue:
      !n.settledAt &&
      !!n.dueBy &&
      new Date(n.dueBy).getTime() + 86_400_000 <= now,
  }));
}

export async function createMoneyNote(
  input: CreateMoneyNoteInput,
  auth: JWTPayload
) {
  await connectDB();
  const currency = input.currency ?? (await getBaseCurrency(auth.userId));
  const note = await MoneyNote.create({
    userId: auth.userId,
    direction: input.direction,
    personName: input.personName.trim(),
    amount: input.amount,
    currency,
    description: input.description,
    givenOn: new Date(input.givenOn),
    dueBy: input.dueBy ? new Date(input.dueBy) : null,
  });
  return note.toObject();
}

export async function updateMoneyNote(
  id: string,
  input: UpdateMoneyNoteInput,
  auth: JWTPayload
) {
  await connectDB();
  const note = await MoneyNote.findOne({
    _id: toObjectId(id, "noteId"),
    userId: auth.userId,
  });
  if (!note) throw new Error("Money note not found");

  if (input.direction !== undefined) note.direction = input.direction;
  if (input.personName !== undefined) note.personName = input.personName.trim();
  if (input.amount !== undefined) note.amount = input.amount;
  if (input.currency !== undefined) note.currency = input.currency;
  if (input.description !== undefined) note.description = input.description;
  if (input.givenOn !== undefined) note.givenOn = new Date(input.givenOn);
  if (input.dueBy !== undefined)
    note.dueBy = input.dueBy ? new Date(input.dueBy) : null;
  // settled: true stamps now (idempotent); false re-opens the note.
  if (input.settled !== undefined)
    note.settledAt = input.settled ? note.settledAt ?? new Date() : null;

  await note.save();
  return note.toObject();
}

export async function removeMoneyNote(id: string, auth: JWTPayload) {
  await connectDB();
  const res = await MoneyNote.deleteOne({
    _id: toObjectId(id, "noteId"),
    userId: auth.userId,
  });
  if (res.deletedCount === 0) throw new Error("Money note not found");
  return { deleted: true };
}

// ── To-dos ──────────────────────────────────────────

export async function listTodos(auth: JWTPayload) {
  await connectDB();
  // Open items first (oldest due first, then newest created), done items last.
  const todos = await Todo.find({ userId: auth.userId })
    .sort({ done: 1, dueDate: 1, createdAt: -1 })
    .lean();
  return todos.map((t) => ({ ...t, _id: t._id.toString() }));
}

export async function createTodo(input: CreateTodoInput, auth: JWTPayload) {
  await connectDB();
  const todo = await Todo.create({
    userId: auth.userId,
    text: input.text.trim(),
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
  });
  return todo.toObject();
}

export async function updateTodo(
  id: string,
  input: UpdateTodoInput,
  auth: JWTPayload
) {
  await connectDB();
  const todo = await Todo.findOne({
    _id: toObjectId(id, "todoId"),
    userId: auth.userId,
  });
  if (!todo) throw new Error("To-do not found");

  if (input.text !== undefined) todo.text = input.text.trim();
  if (input.dueDate !== undefined)
    todo.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (input.done !== undefined) {
    todo.done = input.done;
    todo.doneAt = input.done ? todo.doneAt ?? new Date() : null;
  }

  await todo.save();
  return todo.toObject();
}

export async function removeTodo(id: string, auth: JWTPayload) {
  await connectDB();
  const res = await Todo.deleteOne({
    _id: toObjectId(id, "todoId"),
    userId: auth.userId,
  });
  if (res.deletedCount === 0) throw new Error("To-do not found");
  return { deleted: true };
}
