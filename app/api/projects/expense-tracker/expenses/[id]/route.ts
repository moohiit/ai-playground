import { NextResponse } from "next/server";
import { deleteExpense } from "@/modules/expense-tracker/service";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await deleteExpense(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
