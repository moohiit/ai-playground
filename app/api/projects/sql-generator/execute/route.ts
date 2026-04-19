import { NextResponse } from "next/server";
import { executeSql } from "@/modules/sql-generator/service";
import { executeInputSchema } from "@/modules/sql-generator/schemas";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(req: Request) {
  const clientKey = getClientKey(req);

  try {
    await requireAuth(req);

    const limit = rateLimit(
      `sql-generator-execute:${clientKey}`,
      30,
      60 * 60 * 1000
    );
    if (!limit.allowed) {
      throw new ApiError(429, "Execute rate limit exceeded");
    }

    const body = await req.json().catch(() => null);
    const parsed = executeInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid input"
      );
    }

    const result = await executeSql(parsed.data);
    return NextResponse.json({ result });
  } catch (err) {
    return handleRouteError(err);
  }
}
