import { NextResponse } from "next/server";
import { getGroup, updateGroup, deleteGroup } from "@/modules/expense-tracker/service";
import { updateGroupSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const group = await getGroup(params.id, auth);
    return NextResponse.json({ group });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = updateGroupSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const group = await updateGroup(params.id, parsed.data, auth);
    return NextResponse.json({ group });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    await deleteGroup(params.id, auth);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
