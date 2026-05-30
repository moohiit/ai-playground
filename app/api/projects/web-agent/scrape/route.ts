import { NextResponse } from "next/server";
import { scrapeUrl } from "@/modules/web-agent/service";
import { scrapeInputSchema } from "@/modules/web-agent/schemas";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const clientKey = getClientKey(req);

  try {
    const limit = rateLimit(`web-agent:${clientKey}`, 10, 60 * 60 * 1000);
    if (!limit.allowed) {
      throw new ApiError(429, "Rate limit exceeded. Try again later.");
    }

    const body = await req.json().catch(() => null);
    const parsed = scrapeInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const result = await scrapeUrl(parsed.data);
    return NextResponse.json({ result });
  } catch (err) {
    return handleRouteError(err);
  }
}
