import { NextResponse } from "next/server";
import { listMoneyNotes, createMoneyNote } from "@/modules/expense-tracker/service";
import { createMoneyNoteSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const notes = await listMoneyNotes(auth);
    return NextResponse.json({ notes });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = createMoneyNoteSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const note = await createMoneyNote(parsed.data, auth);
    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
