import { NextResponse } from "next/server";
import { runDueRecurring } from "@/modules/expense-tracker/service";

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
    const result = await runDueRecurring(new Date());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/recurring]", err);
    return NextResponse.json({ error: "Cron run failed" }, { status: 500 });
  }
}
