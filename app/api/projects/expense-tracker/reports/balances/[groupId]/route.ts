import { NextResponse } from "next/server";
import { getGroupBalances } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { groupId: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const result = await getGroupBalances(params.groupId, auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
