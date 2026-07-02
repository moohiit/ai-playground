import { NextResponse } from "next/server";
import { coachReply } from "@/modules/expense-tracker/service";
import { coachSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";
import { logAiUsage, requireAiUsageSlot } from "@/lib/usageLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PROJECT_SLUG = "expense-tracker";
const ACTION = "coach";

// Spending Coach: answers grounded in a server-built financial summary (Phase 3).
// The heaviest AI endpoint (several aggregations + a Gemini completion per call),
// so it's rate-limited and metered exactly like /scan.
export async function POST(req: Request) {
  const started = Date.now();
  const clientKey = getClientKey(req);
  let userId: string | null = null;

  try {
    const auth = await requireAuth(req);
    userId = auth.userId;

    const limit = rateLimit(
      `expense-tracker-coach:${clientKey}`,
      20,
      60 * 60 * 1000
    );
    if (!limit.allowed) {
      throw new ApiError(429, "Coach rate limit exceeded — try again later");
    }

    await requireAiUsageSlot(userId, PROJECT_SLUG);

    const body = await req.json().catch(() => null);
    const parsed = coachSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const result = await coachReply(parsed.data, auth);

    logAiUsage({
      userId,
      clientKey,
      slug: PROJECT_SLUG,
      action: ACTION,
      success: true,
      latencyMs: Date.now() - started,
    }).catch(() => {});

    return NextResponse.json(result);
  } catch (err) {
    logAiUsage({
      userId,
      clientKey,
      slug: PROJECT_SLUG,
      action: ACTION,
      success: false,
      latencyMs: Date.now() - started,
      errorMessage: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
    return handleRouteError(err);
  }
}
