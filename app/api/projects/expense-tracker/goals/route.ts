import { NextResponse } from "next/server";
import { listGoals, createGoal } from "@/modules/expense-tracker/service";
import { createGoalSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const goals = await listGoals(auth);
    return NextResponse.json({ goals });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = createGoalSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const goal = await createGoal(parsed.data, auth);
    return NextResponse.json({ goal }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
