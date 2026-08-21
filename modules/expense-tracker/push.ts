import { connectDB } from "@/lib/db";
import { Budget, Expense, UserPrefs } from "./models";
import { budgetStatus } from "./budget";
import { convert } from "./rates";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type PushConfig = { token: string; baseCurrency: string };

export async function getUserPushConfig(
  userId: string
): Promise<PushConfig | null> {
  await connectDB();
  const prefs = await UserPrefs.findOne({ userId })
    .select("expoPushToken baseCurrency")
    .lean();
  if (!prefs?.expoPushToken) return null;
  return {
    token: prefs.expoPushToken,
    baseCurrency: prefs.baseCurrency ?? "INR",
  };
}

/**
 * Push configs for several users at once.
 *
 * Group notifications go to everyone except the person who acted, so fetching
 * them one at a time would be a query per member on every group expense.
 */
export async function getPushConfigs(
  userIds: string[]
): Promise<Map<string, PushConfig>> {
  if (userIds.length === 0) return new Map();
  await connectDB();
  const rows = await UserPrefs.find({
    userId: { $in: userIds },
    expoPushToken: { $nin: [null, ""] },
  })
    .select("userId expoPushToken baseCurrency")
    .lean();
  return new Map(
    rows.map((r) => [
      r.userId,
      { token: r.expoPushToken as string, baseCurrency: r.baseCurrency ?? "INR" },
    ])
  );
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
  await sendExpoPush(
    config.token,
    "Group invite 👥",
    `${inviterName} invited you to join "${groupName}" — open Groups to accept or decline.`,
    { type: "group-invite", screen: "groups" }
  );
}

export async function checkAndNotifyBudget(
  userId: string,
  config: PushConfig,
  category: string
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

    const label = budget.scope === "overall" ? "Overall" : category;
    const pct = Math.round((spent / budget.amount) * 100);

    if (status === "warn") {
      await sendExpoPush(
        config.token,
        "Budget Warning ⚠️",
        `${label} budget at ${pct}% — ${fmt(spent, config.baseCurrency)} of ${fmt(budget.amount, config.baseCurrency)}`,
        { screen: "budgets" }
      );
    } else {
      await sendExpoPush(
        config.token,
        "Budget Exceeded 🚨",
        `${label} budget exceeded! ${fmt(spent, config.baseCurrency)} of ${fmt(budget.amount, config.baseCurrency)}`,
        { screen: "budgets" }
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
    await sendExpoPush(
      config.token,
      "Unusual Expense Detected 👀",
      `${description} (${fmt(amountBase, config.baseCurrency)}) is much higher than your usual ${category} spend`,
      { screen: "expenses" }
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
    await sendExpoPush(
      config.token,
      "Bill Due 📋",
      `${r.template.description} — ${fmt(amount, config.baseCurrency)} is due`,
      { screen: "recurring" }
    );
  } else {
    await sendExpoPush(
      config.token,
      `${rules.length} Bills Due 📋`,
      rules.map((r) => r.template.description).join(", "),
      { screen: "recurring" }
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
async function notifyGroupMembers(
  memberIds: string[],
  actorId: string,
  fromCurrency: string,
  amountBase: number | null,
  build: (money: string) => { title: string; body: string }
) {
  const recipients = memberIds.filter(
    // Never notify the person who just did it, and guests have no account.
    (id) => id !== actorId && !id.startsWith("guest:")
  );
  const configs = await getPushConfigs(recipients);
  if (configs.size === 0) return;

  await Promise.all(
    Array.from(configs.values()).map(async (config) => {
      let money = "";
      if (amountBase !== null) {
        const converted = await convert(
          amountBase,
          fromCurrency,
          config.baseCurrency
        ).catch(() => amountBase);
        money = fmt(converted, config.baseCurrency);
      }
      const { title, body } = build(money);
      await sendExpoPush(config.token, title, body, { screen: "groups" }).catch(
        () => undefined
      );
    })
  );
}

/** A new expense landed in a shared group. */
export async function notifyGroupExpense(opts: {
  memberIds: string[];
  actorId: string;
  actorName: string;
  groupName: string;
  description: string;
  amountBase: number;
  currency: string;
}) {
  await notifyGroupMembers(
    opts.memberIds,
    opts.actorId,
    opts.currency,
    opts.amountBase,
    (money) => ({
      title: `${opts.groupName} 🧾`,
      body: `${opts.actorName} added "${opts.description}" — ${money}`,
    })
  );
}

/** One member recorded paying another back. */
export async function notifyGroupPayment(opts: {
  memberIds: string[];
  actorId: string;
  fromName: string;
  toName: string;
  groupName: string;
  amountBase: number;
  currency: string;
}) {
  await notifyGroupMembers(
    opts.memberIds,
    opts.actorId,
    opts.currency,
    opts.amountBase,
    (money) => ({
      title: `${opts.groupName} 🤝`,
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
  expenseCount: number;
}) {
  await notifyGroupMembers(
    opts.memberIds,
    opts.actorId,
    "",
    null,
    () => ({
      title: `${opts.groupName} ✅`,
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
  expenseCount: number;
}) {
  await notifyGroupMembers(opts.memberIds, opts.actorId, "", null, () => ({
    title: `${opts.groupName} ↩️`,
    body: `${opts.actorName} reopened the last settlement — ${opts.expenseCount} ${
      opts.expenseCount === 1 ? "expense is" : "expenses are"
    } active again.`,
  }));
}
