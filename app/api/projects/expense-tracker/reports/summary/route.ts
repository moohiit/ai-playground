import { NextResponse } from "next/server";
import { getSummary } from "@/modules/expense-tracker/service";
import { reportFilterSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const filter = reportFilterSchema.parse(Object.fromEntries(searchParams));
    const summary = await getSummary(filter, auth);
    return NextResponse.json(summary);
  } catch (err) {
    return handleRouteError(err);
  }
}
