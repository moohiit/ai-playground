import { NextResponse } from "next/server";
import { setGroupMuted } from "@/modules/expense-tracker/service";
import { muteGroupSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type Params = { params: { id: string } };

/** Switch pushes about this group's activity on or off for the caller. */
export async function PUT(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = muteGroupSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const result = await setGroupMuted(params.id, parsed.data.muted, auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
