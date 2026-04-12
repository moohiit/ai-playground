import { NextResponse } from "next/server";
import { createGroup, listGroups } from "@/modules/expense-tracker/service";
import { createGroupSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const groups = await listGroups(auth);
    return NextResponse.json({ groups });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = createGroupSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const group = await createGroup(parsed.data, auth);
    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
