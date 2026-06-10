import { connectDB } from "@/lib/db";
import { Budget, Expense, UserPrefs } from "./models";
import { budgetStatus } from "./budget";

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
        direction: "expense",
        date: { $gte: start, $lt: end },
      },
    },
    { $group: { _id: "$category", total: { $sum: "$amountBase" } } },
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
    direction: "expense",
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
  rules: Array<{ template: { description: string; amount: number } }>
) {
  if (rules.length === 0) return;

  if (rules.length === 1) {
    const r = rules[0];
    await sendExpoPush(
      config.token,
      "Bill Due 📋",
      `${r.template.description} — ${fmt(r.template.amount, config.baseCurrency)} is due`,
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
