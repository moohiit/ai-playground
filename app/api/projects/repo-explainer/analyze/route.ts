import { NextResponse } from "next/server";
import { analyzeRepo } from "@/modules/repo-explainer/service";
import { repoInputSchema } from "@/modules/repo-explainer/schemas";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const clientKey = getClientKey(req);

  try {
    const limit = rateLimit(`repo-explainer:${clientKey}`, 5, 60 * 60 * 1000);
    if (!limit.allowed) {
      throw new ApiError(429, "Rate limit exceeded. Try again later.");
    }

    const body = await req.json().catch(() => null);
    const parsed = repoInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const result = await analyzeRepo(parsed.data.repoUrl);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
