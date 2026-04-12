import { NextResponse } from "next/server";
import { getGroupBalances } from "@/modules/expense-tracker/service";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { groupId: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const result = await getGroupBalances(params.groupId);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
