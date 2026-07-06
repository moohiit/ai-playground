import { NextResponse } from "next/server";
import { updateMoneyNote, removeMoneyNote } from "@/modules/expense-tracker/service";
import { updateMoneyNoteSchema } from "@/modules/expense-tracker/schemas";
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
    const parsed = updateMoneyNoteSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const note = await updateMoneyNote(params.id, parsed.data, auth);
    return NextResponse.json({ note });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const result = await removeMoneyNote(params.id, auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
