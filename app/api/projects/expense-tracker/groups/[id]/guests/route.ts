import { NextResponse } from "next/server";
import { z } from "zod";
import { addGuestMember } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type Params = { params: { id: string } };

const schema = z.object({ name: z.string().min(1).max(60) }).strict();

// Add a non-user (guest) member to a group by name — no account required.
export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const group = await addGuestMember(params.id, parsed.data.name, auth);
    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
