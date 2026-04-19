import { streamDraft } from "@/modules/content-generator/service";
import { draftInputSchema } from "@/modules/content-generator/schemas";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";
import { requireAuth } from "@/lib/auth";
import { logAiUsage, requireAiUsageSlot } from "@/lib/usageLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROJECT_SLUG = "content-generator";
const ACTION = "draft";

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
    const parsed = draftInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid draft input"
      );
    }

    const encoder = new TextEncoder();
    const capturedUserId = userId;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of streamDraft(parsed.data)) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
          logAiUsage({
            userId: capturedUserId,
            clientKey,
            slug: PROJECT_SLUG,
            action: ACTION,
            success: true,
            latencyMs: Date.now() - started,
          }).catch(() => {});
        } catch (err) {
          controller.error(err);
          logAiUsage({
            userId: capturedUserId,
            clientKey,
            slug: PROJECT_SLUG,
            action: ACTION,
            success: false,
            latencyMs: Date.now() - started,
            errorMessage: err instanceof Error ? err.message : String(err),
          }).catch(() => {});
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
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
