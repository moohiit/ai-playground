import { NextResponse } from "next/server";
import { chat } from "@/modules/voice-assistant/service";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const schema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .max(20)
    .default([]),
});

export async function POST(req: Request) {
  const clientKey = getClientKey(req);

  try {
    const limit = rateLimit(`voice-assistant:${clientKey}`, 30, 60 * 60 * 1000);
    if (!limit.allowed) {
      throw new ApiError(429, "Rate limit exceeded");
    }

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const reply = await chat(parsed.data.history, parsed.data.message);
    return NextResponse.json({ reply });
  } catch (err) {
    return handleRouteError(err);
  }
}
