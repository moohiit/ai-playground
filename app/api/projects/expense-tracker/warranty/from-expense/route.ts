import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleRouteError, ApiError } from "@/lib/apiError";
import { createWarrantiesFromExpense } from "@/modules/expense-tracker/warranty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const { expenseId } = body as { expenseId?: unknown };
    if (!expenseId || typeof expenseId !== "string") {
      throw new ApiError(400, "expenseId required");
    }
    return NextResponse.json(
      await createWarrantiesFromExpense(expenseId, auth),
      { status: 201 }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
