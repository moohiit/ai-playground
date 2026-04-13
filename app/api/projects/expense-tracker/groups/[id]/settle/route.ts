import { NextResponse } from "next/server";
import { settleGroup } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const result = await settleGroup(params.id, auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
