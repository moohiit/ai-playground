import { NextResponse } from "next/server";
import { coachReply } from "@/modules/expense-tracker/service";
import { coachSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Spending Coach: answers grounded in a server-built financial summary (Phase 3).
export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = coachSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const result = await coachReply(parsed.data, auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
