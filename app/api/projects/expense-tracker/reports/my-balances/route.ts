import { NextResponse } from "next/server";
import { getMyBalances } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** What the viewer owes and is owed across every group, netted per person. */
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    return NextResponse.json(await getMyBalances(auth));
  } catch (err) {
    return handleRouteError(err);
  }
}
