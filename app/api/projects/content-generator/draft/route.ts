import { streamDraft } from "@/modules/content-generator/service";
import { draftInputSchema } from "@/modules/content-generator/schemas";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";
import { connectDB } from "@/lib/db";
import { Usage } from "@/models/Usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROJECT_SLUG = "content-generator";
const ACTION = "draft";

export async function POST(req: Request) {
  const started = Date.now();
  const clientKey = getClientKey(req);

  try {
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

    const body = await req.json().catch(() => null);
    const parsed = draftInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid draft input"
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of streamDraft(parsed.data)) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
          logUsage({
            success: true,
            latencyMs: Date.now() - started,
            clientKey,
          }).catch(() => {});
        } catch (err) {
          controller.error(err);
          logUsage({
            success: false,
            latencyMs: Date.now() - started,
            clientKey,
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
    logUsage({
      success: false,
      latencyMs: Date.now() - started,
      clientKey,
      errorMessage: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
    return handleRouteError(err);
  }
}

async function logUsage(opts: {
  success: boolean;
  latencyMs: number;
  clientKey: string;
  errorMessage?: string;
}) {
  try {
    await connectDB();
    await Usage.create({
      projectSlug: PROJECT_SLUG,
      action: ACTION,
      clientKey: opts.clientKey,
      latencyMs: opts.latencyMs,
      success: opts.success,
      errorMessage: opts.errorMessage,
    });
  } catch (err) {
    console.warn("[usage] failed to log", err);
  }
}
