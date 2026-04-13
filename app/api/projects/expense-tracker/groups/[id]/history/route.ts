import { NextResponse } from "next/server";
import { getSettlementHistory } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const history = await getSettlementHistory(params.id, auth);
    return NextResponse.json({ history });
  } catch (err) {
    return handleRouteError(err);
  }
}
