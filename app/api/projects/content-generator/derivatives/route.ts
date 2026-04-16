import { NextResponse } from "next/server";
import { z } from "zod";
import { generateDerivatives } from "@/modules/content-generator/service";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";
import { connectDB } from "@/lib/db";
import { Usage } from "@/models/Usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PROJECT_SLUG = "content-generator";
const ACTION = "derivatives";

const inputSchema = z.object({
  article: z.string().min(100, "Article is too short").max(20_000),
});

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
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid input"
      );
    }

    const derivatives = await generateDerivatives(parsed.data.article);

    logUsage({
      success: true,
      latencyMs: Date.now() - started,
      clientKey,
    }).catch(() => {});

    return NextResponse.json({ derivatives });
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
