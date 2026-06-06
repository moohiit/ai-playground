import { NextResponse } from "next/server";
import { getBudgets, createBudget } from "@/modules/expense-tracker/service";
import { createBudgetSchema, monthSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const month = monthSchema.parse(searchParams.get("month") ?? undefined);
    const result = await getBudgets(month, auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = createBudgetSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const budget = await createBudget(parsed.data, auth);
    return NextResponse.json({ budget }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
