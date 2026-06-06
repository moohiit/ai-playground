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
    const forecast = await getForecast(auth);
    return NextResponse.json(forecast);
  } catch (err) {
    return handleRouteError(err);
  }
}
