import { NextResponse } from "next/server";
import { getForecast } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    // The client sends its own local date — the server runs in UTC and would
    // otherwise project the wrong month around the boundary.
    const today = new URL(req.url).searchParams.get("today") ?? undefined;
    const forecast = await getForecast(auth, today);
    return NextResponse.json(forecast);
  } catch (err) {
    return handleRouteError(err);
  }
}
