import { NextResponse } from "next/server";
import { getSharedGroup } from "@/modules/expense-tracker/service";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// PUBLIC — no auth. Read-only "who owes whom" for a shared group link.
export async function GET(_req: Request, { params }: { params: { shareId: string } }) {
  try {
    const data = await getSharedGroup(params.shareId);
    return NextResponse.json(data);
  } catch (err) {
    return handleRouteError(err);
  }
}
