import { connectDB } from "@/lib/db";
import { Budget, Expense, UserPrefs, WebPushSubscription } from "./models";
import { sendWebPush, type WebSub } from "./webPush";
import { budgetStatus } from "./budget";
import { convert } from "./rates";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Everywhere one user can be reached: their phone, and any browsers that opted in. */
export type PushConfig = { token: string | null; baseCurrency: string; web: WebSub[] };

export async function getUserPushConfig(
  userId: string
): Promise<PushConfig | null> {
  return (await getPushConfigs([userId])).get(userId) ?? null;
}

/**
 * Push configs for several users at once.
 *
 * Group notifications go to everyone except the person who acted, so fetching
 * them one at a time would be a query per member on every group expense.
 * Someone with no phone token but a subscribed browser still gets a config —
 * a web-only user is as reachable as anyone.
 */
export async function getPushConfigs(
  userIds: string[]
): Promise<Map<string, PushConfig>> {
  if (userIds.length === 0) return new Map();
  await connectDB();
  const [prefs, subs] = await Promise.all([
    UserPrefs.find({ userId: { $in: userIds } })
      .select("userId expoPushToken baseCurrency")
      .lean(),
    WebPushSubscription.find({ userId: { $in: userIds } })
      .select("userId endpoint keys")
      .lean(),
  ]);

  const webByUser = new Map<string, WebSub[]>();
  for (const s of subs) {
    const list = webByUser.get(s.userId) ?? [];
    list.push({ endpoint: s.endpoint, keys: s.keys });
    webByUser.set(s.userId, list);
  }
  const prefsByUser = new Map(prefs.map((r) => [r.userId, r]));

  const out = new Map<string, PushConfig>();
  for (const userId of userIds) {
    const pref = prefsByUser.get(userId);
    const token = pref?.expoPushToken || null;
    const web = webByUser.get(userId) ?? [];
    if (!token && web.length === 0) continue;
    out.set(userId, { token, baseCurrency: pref?.baseCurrency ?? "INR", web });
  }
  return out;
}

/** One notification, to every place this user can be reached. Never throws. */
async function deliver(
  config: PushConfig,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
) {
  await Promise.all([
    config.token
      ? sendExpoPush(config.token, title, body, data).catch(() => undefined)
      : Promise.resolve(),
    sendWebPush(config.web, title, body, data).catch(() => undefined),
  ]);
}

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      to: token,
      title,
      body,
      data: data ?? {},
      sound: "default",
      channelId: "expense-tracker",
    }),
  });
}

export type GroupTab = "active" | "settled" | "report";

/**
 * What a tap on a group push should open. `screen: "groups"` is what app
 * versions up to 1.12 understand (they open the list); newer ones see
 * `groupId` and go straight to that group, on `tab`. No groupId — the group is
 * gone, or the reader is no longer in it — means the list for everyone.
 */
function groupLink(type: string, groupId?: string, tab: GroupTab = "active") {
  return groupId
    ? { type, screen: "groups", groupId, tab }
    : { type, screen: "groups" };
}

function fmt(n: number, currency: string) {
  return `${Math.round(n).toLocaleString("en")} ${currency}`;
}

/** Notify a user they've been invited to a group (best-effort). */
export async function notifyGroupInvite(
  userId: string,
  groupName: string,
  inviterName: string
) {
  const config = await getUserPushConfig(userId);
  if (!config) return;
  await deliver(config,
    "Group invite 👥",
    `${inviterName} invited you to join "${groupName}" — open Groups to accept or decline.`,
    { type: "group-invite", screen: "groups" }
  );
}

export async function checkAndNotifyBudget(
  userId: string,
  config: PushConfig,
  category: string,
  /** The expense that was just saved, in base currency. */
  amountBase: number
) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const budgets = await Budget.find({
    userId,
    $or: [{ scope: "overall" }, { scope: "category", category }],
  }).lean();
  if (budgets.length === 0) return;

  const agg = await Expense.aggregate<{ _id: string | null; total: number }>([
    {
      $match: {
        createdBy: userId,
        type: "personal",
        // Pre-1A rows have no `direction`; buildExpenseQuery treats those as
        // expenses, and so must this or they vanish from the budget total.
        $or: [
          { direction: "expense" },
          { direction: { $exists: false } },
          { direction: null },
        ],
        date: { $gte: start, $lt: end },
      },
    },
    // $ifNull, matching every other aggregation in the codebase: rows written
    // before multi-currency have no amountBase, and $sum treats a missing
    // field as nothing — so those entries counted as zero towards the budget.
    {
      $group: {
        _id: "$category",
        total: { $sum: { $ifNull: ["$amountBase", "$amount"] } },
      },
    },
  ]);

  let overallTotal = 0;
  const catTotals = new Map<string, number>();
  for (const r of agg) {
    if (r._id) catTotals.set(r._id, r.total);
    overallTotal += r.total;
  }

  for (const budget of budgets) {
    const spent =
      budget.scope === "overall"
        ? overallTotal
        : (catTotals.get(category) ?? 0);
    const status = budgetStatus(spent, budget.amount);
    if (status === "ok") continue;
    // Only when THIS expense is the one that crossed the line. `spent` already
    // includes it; without this every purchase after 80% re-sent the warning.
    if (budgetStatus(spent - amountBase, budget.amount) === status) continue;

    const label = budget.scope === "overall" ? "Overall" : category;
    const pct = Math.round((spent / budget.amount) * 100);

    if (status === "warn") {
      await deliver(config,
        "Budget Warning ⚠️",
        `${label} budget at ${pct}% — ${fmt(spent, config.baseCurrency)} of ${fmt(budget.amount, config.baseCurrency)}`,
        { type: "budget", screen: "budgets" }
      );
    } else {
      await deliver(config,
        "Budget Exceeded 🚨",
        `${label} budget exceeded! ${fmt(spent, config.baseCurrency)} of ${fmt(budget.amount, config.baseCurrency)}`,
        { type: "budget", screen: "budgets" }
      );
    }
  }
}

export async function checkAndNotifyAnomaly(
  userId: string,
  config: PushConfig,
  category: string,
  amountBase: number,
  description: string
) {
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const recent = await Expense.find({
    createdBy: userId,
    // Personal only: a group bill the user logged is the whole table's total,
    // not their own spending, and it dragged the baseline up.
    type: "personal",
    category,
    // Same legacy-row treatment as above — excluding them shrank the sample
    // and suppressed the anomaly alert entirely for users with older data.
    $or: [
      { direction: "expense" },
      { direction: { $exists: false } },
      { direction: null },
    ],
    date: { $gte: since },
  })
    .select("amountBase amount")
    .lean();

  // Need enough history to establish a baseline
  if (recent.length < 4) return;

  const amounts = recent
    .map((e) => e.amountBase ?? e.amount)
    .sort((a, b) => a - b);
  const mid = Math.floor(amounts.length / 2);
  const median =
    amounts.length % 2 !== 0
      ? amounts[mid]
      : (amounts[mid - 1] + amounts[mid]) / 2;

  if (median > 0 && amountBase >= median * 3) {
    await deliver(config,
      "Unusual Expense Detected 👀",
      `${description} (${fmt(amountBase, config.baseCurrency)}) is much higher than your usual ${category} spend`,
      { type: "anomaly", screen: "expenses" }
    );
  }
}

export async function notifyBillsDue(
  config: PushConfig,
  rules: Array<{
    template: { description: string; amount: number; currency?: string };
  }>
) {
  if (rules.length === 0) return;

  if (rules.length === 1) {
    const r = rules[0];
    // A rule keeps its own currency. Printing that amount with the user's base
    // currency code turned a $40 subscription into "40 INR is due" — off by
    // roughly 85x, and labelled wrongly.
    const amount = await convert(
      r.template.amount,
      r.template.currency || config.baseCurrency,
      config.baseCurrency
    ).catch(() => r.template.amount);
    await deliver(config,
      "Bill Due 📋",
      `${r.template.description} — ${fmt(amount, config.baseCurrency)} is due`,
      { type: "bills-due", screen: "recurring" }
    );
  } else {
    await deliver(config,
      `${rules.length} Bills Due 📋`,
      rules.map((r) => r.template.description).join(", "),
      { type: "bills-due", screen: "recurring" }
    );
  }
}

/**
 * Tell the rest of a group that something happened to their shared money.
 *
 * Every notification in this app was gated behind personal expenses, so the
 * one case where other people genuinely need to know — someone spending from
 * a shared pot — was silent.
 *
 * `amountBase` is the payer's base-currency figure. Each recipient may have a
 * different base, so the amount is converted per recipient rather than
 * labelled with someone else's currency.
 */
type PushParts = { title: string; body: string; data?: Record<string, unknown> };

async function notifyGroupMembers(
  memberIds: string[],
  actorId: string,
  fromCurrency: string,
  amountBase: number | null,
  build: (ctx: {
    /** The group total, in this recipient's currency. */
    money: string;
    /** This recipient's own share, in their currency. "" when not applicable. */
    share: string;
    recipientId: string;
    /** Any other amount in `fromCurrency`, rendered in this recipient's currency. */
    toTheirs: (amount: number) => Promise<string>;
  }) => PushParts | Promise<PushParts>,
  /** memberId -> that member's share, in `fromCurrency`. */
  sharesBase?: Record<string, number>
) {
  const recipients = memberIds.filter(
    // Never notify the person who just did it, and guests have no account.
    (id) => id !== actorId && !id.startsWith("guest:")
  );
  const configs = await getPushConfigs(recipients);
  if (configs.size === 0) return;

  await Promise.all(
    // entries(), not values(): the message is built per recipient, so each
    // one's own share can go in it.
    Array.from(configs.entries()).map(async ([recipientId, config]) => {
      const toTheirs = async (amount: number) =>
        fmt(
          await convert(amount, fromCurrency, config.baseCurrency).catch(
            () => amount
          ),
          config.baseCurrency
        );

      const money = amountBase !== null ? await toTheirs(amountBase) : "";
      const own = sharesBase?.[recipientId];
      const share = own !== undefined && own > 0 ? await toTheirs(own) : "";

      const { title, body, data } = await build({ money, share, recipientId, toTheirs });
      await deliver(config, title, body, data ?? groupLink("group"));
    })
  );
}

/** A new expense landed in a shared group. */
export async function notifyGroupExpense(opts: {
  memberIds: string[];
  actorId: string;
  actorName: string;
  groupName: string;
  /** Opens this group when the push is tapped. */
  groupId?: string;
  description: string;
  amountBase: number;
  currency: string;
  /** memberId -> their share of this expense, in `currency`. */
  sharesBase?: Record<string, number>;
  /** Far above what this group usually spends — worth a second look. */
  unusual?: boolean;
}) {
  await notifyGroupMembers(
    opts.memberIds,
    opts.actorId,
    opts.currency,
    opts.amountBase,
    ({ money, share }) => ({
      title: `${opts.groupName} 🧾`,
      data: groupLink("expense-added", opts.groupId),
      // The group total answers "how big was it"; their own share answers
      // "what does it cost me", which is the question they actually have.
      body:
        (share
          ? `${opts.actorName} added "${opts.description}" — ${money}, your share ${share}`
          : `${opts.actorName} added "${opts.description}" — ${money}`) +
        (opts.unusual ? " · well above this group's usual 👀" : ""),
    }),
    opts.sharesBase
  );
}

/** One member recorded paying another back. */
export async function notifyGroupPayment(opts: {
  memberIds: string[];
  actorId: string;
  fromName: string;
  toName: string;
  groupName: string;
  /** Opens this group when the push is tapped. */
  groupId?: string;
  amountBase: number;
  currency: string;
}) {
  await notifyGroupMembers(
    opts.memberIds,
    opts.actorId,
    opts.currency,
    opts.amountBase,
    ({ money }) => ({
      title: `${opts.groupName} 🤝`,
      data: groupLink("payment", opts.groupId),
      body: `${opts.fromName} paid ${opts.toName} ${money}`,
    })
  );
}

/** The group's active window was closed — everything moved to settled history. */
export async function notifyGroupSettled(opts: {
  memberIds: string[];
  actorId: string;
  actorName: string;
  groupName: string;
  /** Opens this group when the push is tapped. */
  groupId?: string;
  expenseCount: number;
}) {
  await notifyGroupMembers(
    opts.memberIds,
    opts.actorId,
    "",
    null,
    () => ({
      title: `${opts.groupName} ✅`,
      data: groupLink("settled", opts.groupId, "settled"),
      body: `${opts.actorName} settled the group — ${opts.expenseCount} ${
        opts.expenseCount === 1 ? "expense" : "expenses"
      } moved to settled history.`,
    })
  );
}

/** A settled batch was put back into the active window. */
export async function notifyGroupReopened(opts: {
  memberIds: string[];
  actorId: string;
  actorName: string;
  groupName: string;
  /** Opens this group when the push is tapped. */
  groupId?: string;
  expenseCount: number;
}) {
  await notifyGroupMembers(opts.memberIds, opts.actorId, "", null, () => ({
    title: `${opts.groupName} ↩️`,
    data: groupLink("reopened", opts.groupId),
    body: `${opts.actorName} reopened the last settlement — ${opts.expenseCount} ${
      opts.expenseCount === 1 ? "expense is" : "expenses are"
    } active again.`,
  }));
}

/**
 * One thing that changed on an expense, for the edit notification.
 *
 * Money changes carry raw numbers in the CREATOR's base currency (the currency
 * amountBase is frozen in) so they can be rendered per recipient; everything
 * else is already text.
 */
export type ExpenseChange =
  | { kind: "text"; label: string; from: string; to: string }
  | { kind: "money"; label: string; from: number; to: number };

/**
 * Someone edited a shared expense — say what changed, from what, and by whom.
 *
 * The body leads with the recipient's OWN share if it moved, because that is
 * the change that costs them something; the rest of the diff follows. Push
 * bodies get cut after a few lines on Android, so only the first few changes
 * are spelled out and the remainder is counted.
 */
export async function notifyGroupExpenseEdited(opts: {
  memberIds: string[];
  actorId: string;
  actorName: string;
  groupName: string;
  /** Opens this group when the push is tapped. */
  groupId?: string;
  description: string;
  amountBase: number;
  currency: string;
  changes: ExpenseChange[];
  /** memberId -> share before the edit, in `currency`. */
  sharesBefore: Record<string, number>;
  /** memberId -> share after the edit, in `currency`. */
  sharesAfter: Record<string, number>;
}) {
  if (opts.changes.length === 0) return;

  await notifyGroupMembers(
    opts.memberIds,
    opts.actorId,
    opts.currency,
    opts.amountBase,
    async ({ recipientId, toTheirs }) => {
      const parts: string[] = [];

      const before = opts.sharesBefore[recipientId] ?? 0;
      const after = opts.sharesAfter[recipientId] ?? 0;
      if (Math.abs(before - after) >= 0.01) {
        parts.push(`your share ${await toTheirs(before)} → ${await toTheirs(after)}`);
      }

      const shown = opts.changes.slice(0, 3);
      for (const c of shown) {
        parts.push(
          c.kind === "money"
            ? `${c.label} ${await toTheirs(c.from)} → ${await toTheirs(c.to)}`
            : `${c.label} ${c.from} → ${c.to}`
        );
      }
      const more = opts.changes.length - shown.length;
      if (more > 0) parts.push(`+${more} more`);

      return {
        title: `${opts.groupName} ✏️`,
        data: groupLink("expense-edited", opts.groupId),
        body: `${opts.actorName} edited "${opts.description}" — ${parts.join(", ")}`,
      };
    }
  );
}

/** An expense left the group — deleted, or moved to personal / another group. */
export async function notifyGroupExpenseRemoved(opts: {
  memberIds: string[];
  actorId: string;
  actorName: string;
  groupName: string;
  /** Opens this group when the push is tapped. */
  groupId?: string;
  description: string;
  amountBase: number;
  currency: string;
  /** memberId -> the share they no longer carry, in `currency`. */
  sharesBase: Record<string, number>;
  reason: "deleted" | "moved";
}) {
  await notifyGroupMembers(
    opts.memberIds,
    opts.actorId,
    opts.currency,
    opts.amountBase,
    ({ money, share }) => ({
      title: `${opts.groupName} 🗑️`,
      data: groupLink("expense-removed", opts.groupId),
      body: `${opts.actorName} ${opts.reason === "deleted" ? "deleted" : "moved out"} "${opts.description}" — ${money}${
        share ? `, your share was ${share}` : ""
      }`,
    }),
    opts.sharesBase
  );
}

/**
 * A creditor pressed "Remind". The debtor hears it even with the group muted:
 * it is addressed to them, and the person asking expects it to land.
 */
export async function notifyDebtReminder(opts: {
  debtorId: string;
  creditorId: string;
  creditorName: string;
  groupName: string;
  /** Opens this group when the push is tapped. */
  groupId?: string;
  amountBase: number;
  currency: string;
}) {
  await notifyGroupMembers(
    [opts.debtorId],
    opts.creditorId,
    opts.currency,
    opts.amountBase,
    ({ money }) => ({
      title: `${opts.groupName} 💸`,
      data: groupLink("debt-reminder", opts.groupId),
      body: `${opts.creditorName} is asking you to settle ${money} in ${opts.groupName}.`,
    })
  );
}

/**
 * The daily job's nudge: one push per debtor per group, however many people
 * they owe in it — a settle-up plan can route one person's debt to three
 * creditors, and three pushes from one group in a morning reads as nagging.
 */
export async function notifyDebtNudge(opts: {
  debtorId: string;
  groupName: string;
  /** Opens this group when the push is tapped. */
  groupId?: string;
  currency: string;
  daysQuiet: number;
  creditors: { name: string; amount: number }[];
}) {
  const total = opts.creditors.reduce((sum, c) => sum + c.amount, 0);
  await notifyGroupMembers(
    [opts.debtorId],
    "",
    opts.currency,
    total,
    async ({ money, toTheirs }) => {
      let owed: string;
      if (opts.creditors.length === 1) {
        owed = `You owe ${opts.creditors[0].name} ${money} in ${opts.groupName}`;
      } else {
        const parts = await Promise.all(
          opts.creditors.map(async (c) => `${c.name} ${await toTheirs(c.amount)}`)
        );
        owed = `You owe ${money} across ${opts.creditors.length} people in ${opts.groupName} (${parts.join(", ")})`;
      }
      return {
        title: `${opts.groupName} 💸`,
        data: groupLink("debt-nudge", opts.groupId),
        body: `${owed} — nothing has moved for ${opts.daysQuiet} days.`,
      };
    }
  );
}

/** Someone joined, was added, or was removed. The wording is per recipient
 *  so an inviter can hear "accepted your invite" while others hear "joined". */
export async function notifyGroupMemberEvent(opts: {
  memberIds: string[];
  actorId: string;
  groupName: string;
  /** Opens this group when the push is tapped. */
  groupId?: string;
  body: (recipientId: string) => string;
}) {
  await notifyGroupMembers(opts.memberIds, opts.actorId, "", null, ({ recipientId }) => ({
    title: `${opts.groupName} 👥`,
    data: groupLink("member-event", opts.groupId),
    body: opts.body(recipientId),
  }));
}

/** Monday morning: what the group spent last week, and where the reader stands. */
export async function notifyGroupDigest(opts: {
  recipientId: string;
  groupName: string;
  /** Opens this group when the push is tapped. */
  groupId?: string;
  count: number;
  totalBase: number;
  shareBase: number;
  /** The reader's current net position in the group: + owed, − owing. */
  netBase: number;
  currency: string;
}) {
  await notifyGroupMembers(
    [opts.recipientId],
    "",
    opts.currency,
    opts.totalBase,
    async ({ money, share, toTheirs }) => {
      const standing =
        opts.netBase > 0.01
          ? `You're owed ${await toTheirs(opts.netBase)}.`
          : opts.netBase < -0.01
          ? `You owe ${await toTheirs(-opts.netBase)}.`
          : "You're all square.";
      return {
        title: `${opts.groupName} 📊`,
        data: groupLink("digest", opts.groupId, "report"),
        body: `Last week: ${opts.count} ${opts.count === 1 ? "expense" : "expenses"}, ${money} total${
          share ? `, your share ${share}` : ""
        }. ${standing}`,
      };
    },
    { [opts.recipientId]: opts.shareBase }
  );
}

/** A month of silence with money still outstanding: suggest closing the books. */
export async function notifySettleUpSuggestion(opts: {
  memberIds: string[];
  groupName: string;
  /** Opens this group when the push is tapped. */
  groupId?: string;
  outstandingBase: number;
  currency: string;
  daysQuiet: number;
}) {
  await notifyGroupMembers(
    opts.memberIds,
    "",
    opts.currency,
    opts.outstandingBase,
    ({ money }) => ({
      title: `${opts.groupName} 🤝`,
      data: groupLink("settle-suggestion", opts.groupId),
      body: `${opts.groupName} has been quiet for ${opts.daysQuiet} days with ${money} still unsettled — time to settle up?`,
    })
  );
}

/** The whole group is gone. Told to everyone, muted or not: there is nothing
 *  left to mute, and balances they were tracking have vanished with it. */
export async function notifyGroupDeleted(opts: {
  memberIds: string[];
  actorId: string;
  actorName: string;
  groupName: string;
}) {
  await notifyGroupMembers(opts.memberIds, opts.actorId, "", null, () => ({
    title: `${opts.groupName} 🗑️`,
    body: `${opts.actorName} deleted the group "${opts.groupName}" and everything in it.`,
    data: groupLink("group-deleted"),
  }));
}

/** A member wants the group gone and only the creator can do it. Sent to the
 *  creator alone, muted or not: it is a question put to them personally. */
export async function notifyGroupDeleteRequest(opts: {
  creatorId: string;
  requesterId: string;
  requesterName: string;
  groupName: string;
  groupId?: string;
}) {
  await notifyGroupMembers([opts.creatorId], opts.requesterId, "", null, () => ({
    title: `${opts.groupName} 🗑️`,
    body: `${opts.requesterName} is asking you to delete "${opts.groupName}". Open the group's settings to delete it or dismiss the request.`,
    data: groupLink("delete-request", opts.groupId),
  }));
}

/**
 * Something happened on a money note that names the reader: it was written,
 * they are being reminded, or it was marked returned. `amount` is in the
 * note's own currency and is shown in it — a note is a record of what was
 * actually handed over, not a figure to re-price.
 */
export async function notifyMoneyNote(opts: {
  recipientId: string;
  actorName: string;
  kind: "created" | "reminder" | "settled";
  /** From the ACTOR's side: "lent" means the actor gave the reader money. */
  direction: "lent" | "borrowed";
  amount: number;
  currency: string;
  description?: string;
  dueBy?: Date | null;
}) {
  const config = await getUserPushConfig(opts.recipientId);
  if (!config) return;
  const money = fmt(opts.amount, opts.currency);
  const what = opts.description ? ` for "${opts.description}"` : "";
  const due = opts.dueBy
    ? ` — due ${new Date(opts.dueBy).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}`
    : "";
  let title: string;
  let body: string;
  if (opts.kind === "reminder") {
    title = "Money reminder 💸";
    body = `${opts.actorName} is reminding you about ${money}${what} you took${due}.`;
  } else if (opts.kind === "settled") {
    title = "Money note settled ✅";
    body = `${opts.actorName} marked ${money}${what} as settled.`;
  } else {
    title = "New money note 📝";
    body =
      opts.direction === "lent"
        ? `${opts.actorName} noted giving you ${money}${what}${due}.`
        : `${opts.actorName} noted taking ${money}${what} from you${due}.`;
  }
  await deliver(config, title, body, { type: `note-${opts.kind}`, screen: "notes" });
}
