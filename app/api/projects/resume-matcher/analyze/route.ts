import { NextResponse } from "next/server";
import { analyzeResume } from "@/modules/resume-matcher/service";
import { analyzeInputSchema } from "@/modules/resume-matcher/schemas";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";
import { requireAuth } from "@/lib/auth";
import { logAiUsage, requireAiUsageSlot } from "@/lib/usageLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PROJECT_SLUG = "resume-matcher";
const ACTION = "analyze";

export async function POST(req: Request) {
  const started = Date.now();
  const clientKey = getClientKey(req);
  let userId: string | null = null;

  try {
    const auth = await requireAuth(req);
    userId = auth.userId;

    const limit = rateLimit(
      `${PROJECT_SLUG}:${clientKey}`,
      10,
      60 * 60 * 1000
    );
    if (!limit.allowed) {
      throw new ApiError(
        429,
        `Rate limit exceeded. Try again after ${new Date(
          limit.resetAt
        ).toISOString()}`
      );
    }

    await requireAiUsageSlot(userId, PROJECT_SLUG);

    const body = await req.json().catch(() => null);
    const parsed = analyzeInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const result = await analyzeResume(parsed.data);

    logAiUsage({
      userId,
      clientKey,
      slug: PROJECT_SLUG,
      action: ACTION,
      success: true,
      latencyMs: Date.now() - started,
    }).catch(() => {});

    return NextResponse.json({ result });
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
