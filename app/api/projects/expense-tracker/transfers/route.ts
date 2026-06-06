import { NextResponse } from "next/server";
import { listTransfers, createTransfer } from "@/modules/expense-tracker/service";
import { createTransferSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const transfers = await listTransfers(auth);
    return NextResponse.json({ transfers });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = createTransferSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const transfer = await createTransfer(parsed.data, auth);
    return NextResponse.json({ transfer }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
