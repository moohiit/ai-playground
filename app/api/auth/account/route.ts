import { NextResponse } from "next/server";
import { deleteAccount } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function DELETE(req: Request) {
  try {
    const auth = await requireAuth(req);
    const result = await deleteAccount(auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
