import { NextResponse } from "next/server";
import { deleteExpense } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    await deleteExpense(params.id, auth);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
