import { NextResponse } from "next/server";
import { getPrefs, updatePrefs } from "@/modules/expense-tracker/service";
import { updatePrefsSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const prefs = await getPrefs(auth);
    return NextResponse.json({ prefs });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = updatePrefsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const prefs = await updatePrefs(parsed.data, auth);
    return NextResponse.json({ prefs });
  } catch (err) {
    return handleRouteError(err);
  }
}
