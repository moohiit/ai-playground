import { NextResponse } from "next/server";
import { updateAccount, removeAccount } from "@/modules/expense-tracker/service";
import { updateAccountSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = updateAccountSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const account = await updateAccount(params.id, parsed.data, auth);
    return NextResponse.json({ account });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    await removeAccount(params.id, auth);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
