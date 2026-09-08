import { NextResponse } from "next/server";
import { remindDebt } from "@/modules/expense-tracker/service";
import { remindDebtSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type Params = { params: { id: string } };

/**
 * The caller, who is owed, nudges one debtor to settle. Once a day per
 * debtor; only debts in the current settle-up plan qualify.
 * Returns { ok: true, remindedAt } or a 4xx { error } explaining why not.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = remindDebtSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const result = await remindDebt(params.id, parsed.data.debtorId, auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
