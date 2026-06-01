import { NextResponse } from "next/server";
import { settlePersonal } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const result = await settlePersonal(auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
