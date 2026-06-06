import { NextResponse } from "next/server";
import { postRecurring } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const recurring = await postRecurring(params.id, auth);
    return NextResponse.json({ recurring });
  } catch (err) {
    return handleRouteError(err);
  }
}
