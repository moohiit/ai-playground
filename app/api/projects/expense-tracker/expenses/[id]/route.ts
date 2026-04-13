import { NextResponse } from "next/server";
import { deleteExpense, updateExpense } from "@/modules/expense-tracker/service";
import { createExpenseSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function PUT(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json();
    const input = createExpenseSchema.partial().parse(body);
    const expense = await updateExpense(params.id, input, auth);
    return NextResponse.json({ expense });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    await deleteExpense(params.id, auth);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
