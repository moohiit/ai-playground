import { NextResponse } from "next/server";
import { parseNaturalExpense } from "@/modules/expense-tracker/service";
import { parseTextSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Natural-language entry: text → structured draft (not saved; the client confirms it).
export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = parseTextSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const result = await parseNaturalExpense(parsed.data.text, auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
