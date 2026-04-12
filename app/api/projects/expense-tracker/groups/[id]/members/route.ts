import { NextResponse } from "next/server";
import { addMember, removeMember } from "@/modules/expense-tracker/service";
import { addMemberSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = addMemberSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const group = await addMember(params.id, parsed.data.email, auth);
    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId");
    if (!memberId) {
      throw new ApiError(400, "memberId query parameter is required");
    }
    const group = await removeMember(params.id, memberId, auth);
    return NextResponse.json({ group });
  } catch (err) {
    return handleRouteError(err);
  }
}
