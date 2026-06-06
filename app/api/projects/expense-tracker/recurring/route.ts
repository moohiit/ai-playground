import { NextResponse } from "next/server";
import { getRecurring, createRecurring } from "@/modules/expense-tracker/service";
import { createRecurringSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const result = await getRecurring(auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = createRecurringSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const recurring = await createRecurring(parsed.data, auth);
    return NextResponse.json({ recurring }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
