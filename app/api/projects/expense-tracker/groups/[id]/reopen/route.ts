import { NextResponse } from "next/server";
import { reopenSettlement } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Params = { params: { id: string } };

/** Undo the group's most recent settlement. */
export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    return NextResponse.json(await reopenSettlement(params.id, auth));
  } catch (err) {
    return handleRouteError(err);
  }
}
