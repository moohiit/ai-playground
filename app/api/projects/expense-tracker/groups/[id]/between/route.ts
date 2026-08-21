import { NextResponse } from "next/server";
import { getExpensesBetween } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type Params = { params: { id: string } };

/** Expenses two members share, and what that leaves between them. */
export async function GET(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const q = new URL(req.url).searchParams;
    const a = q.get("a");
    const b = q.get("b");
    if (!a || !b) throw new ApiError(400, "Pick two members");
    const settled = q.get("settled");
    const data = await getExpensesBetween(params.id, a, b, auth, {
      settled:
        settled === "true" || settled === "all" ? settled : "false",
    });
    return NextResponse.json(data);
  } catch (err) {
    return handleRouteError(err);
  }
}
