import { NextResponse } from "next/server";
import { getDashboardSummaries } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * Everything the dashboard needs, in one request.
 *
 * Both clients used to open the dashboard with six round trips — five summary
 * variants plus the personal settle history — which on mobile over cellular
 * meant six sequential handshakes before anything rendered.
 */
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const data = await getDashboardSummaries(auth);
    return NextResponse.json(data);
  } catch (err) {
    return handleRouteError(err);
  }
}
