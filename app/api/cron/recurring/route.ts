import { NextResponse } from "next/server";
import { runDueRecurring } from "@/modules/expense-tracker/service";
import { connectDB } from "@/lib/db";
import { RecurringRule } from "@/modules/expense-tracker/models";
import { getUserPushConfig, notifyBillsDue } from "@/modules/expense-tracker/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily Vercel Cron (see vercel.json). Materializes due autoPost recurring rules for
// ALL users. Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET
// is set in the project env — we require it so the endpoint can't be triggered openly.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const now = new Date();
    const result = await runDueRecurring(now);

    // Notify users with due non-autoPost rules (bills they need to confirm)
    try {
      await connectDB();
      const dueRules = await RecurringRule.find({
        autoPost: false,
        active: true,
        nextRunAt: { $lte: now },
      }).lean();

      const byUser = new Map<string, typeof dueRules>();
      for (const rule of dueRules) {
        if (!byUser.has(rule.userId)) byUser.set(rule.userId, []);
        byUser.get(rule.userId)!.push(rule);
      }

      await Promise.all(
        Array.from(byUser.entries()).map(async ([userId, rules]) => {
          const config = await getUserPushConfig(userId);
          if (!config) return;
          await notifyBillsDue(config, rules);
        })
      );
    } catch (err) {
      console.error("[cron/recurring] push notifications failed", err);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/recurring]", err);
    return NextResponse.json({ error: "Cron run failed" }, { status: 500 });
  }
}
