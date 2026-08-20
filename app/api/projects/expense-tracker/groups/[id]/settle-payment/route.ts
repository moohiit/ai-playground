import { NextResponse } from "next/server";
import { recordSettlementPayment } from "@/modules/expense-tracker/service";
import { settlePaymentSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = settlePaymentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    // Returns { expense, autoSettled, settlement? } — settling the last
    // outstanding transfer closes the active window in the same call.
    const result = await recordSettlementPayment(params.id, parsed.data, auth);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
