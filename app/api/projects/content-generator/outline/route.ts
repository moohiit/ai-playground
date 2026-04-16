import { NextResponse } from "next/server";
import { generateOutline } from "@/modules/content-generator/service";
import { briefInputSchema } from "@/modules/content-generator/schemas";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";
import { connectDB } from "@/lib/db";
import { Usage } from "@/models/Usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PROJECT_SLUG = "content-generator";
const ACTION = "outline";

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
    const parsed = briefInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid brief"
      );
    }

    const outline = await generateOutline(parsed.data);

    logUsage({
      success: true,
      latencyMs: Date.now() - started,
      clientKey,
    }).catch(() => {});

    return NextResponse.json({ outline });
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
