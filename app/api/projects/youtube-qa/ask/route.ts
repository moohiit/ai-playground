import { NextResponse } from "next/server";
import { answerQuestion } from "@/modules/youtube-qa/service";
import { askInputSchema } from "@/modules/youtube-qa/schemas";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";
import { requireAuth } from "@/lib/auth";
import { logAiUsage, requireAiUsageSlot } from "@/lib/usageLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PROJECT_SLUG = "youtube-qa";
const ACTION = "ask";

export async function POST(req: Request) {
  const started = Date.now();
  const clientKey = getClientKey(req);
  let userId: string | null = null;

  try {
    const auth = await requireAuth(req);
    userId = auth.userId;

    const limit = rateLimit(
      `${PROJECT_SLUG}:${clientKey}`,
      30,
      60 * 60 * 1000
    );
    if (!limit.allowed) {
      throw new ApiError(429, "Rate limit exceeded. Try again later.");
    }

    await requireAiUsageSlot(userId, PROJECT_SLUG);

    const body = await req.json().catch(() => null);
    const parsed = askInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid input"
      );
    }

    const result = await answerQuestion({
      userId,
      videoId: parsed.data.videoId,
      question: parsed.data.question,
      history: parsed.data.history,
    });

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
