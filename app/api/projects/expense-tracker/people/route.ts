import { NextResponse } from "next/server";
import { listKnownPeople } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * People the caller already shares a group with, for suggesting members
 * instead of making them type an email address every time.
 *
 * `?excludeGroupId=` drops anyone already in that group.
 */
export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const excludeGroupId =
      new URL(req.url).searchParams.get("excludeGroupId") ?? undefined;
    const people = await listKnownPeople(auth, { excludeGroupId });
    return NextResponse.json({ people });
  } catch (err) {
    return handleRouteError(err);
  }
}
