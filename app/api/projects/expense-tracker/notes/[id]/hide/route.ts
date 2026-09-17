import { NextResponse } from "next/server";
import { hideMoneyNote } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type Params = { params: { id: string } };

/** Remove someone else's note about you from your own list. */
export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    return NextResponse.json(await hideMoneyNote(params.id, auth));
  } catch (err) {
    return handleRouteError(err);
  }
}
