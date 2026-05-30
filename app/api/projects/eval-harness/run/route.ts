import { NextResponse } from "next/server";
import { runSuite, getAvailableProjects } from "@/modules/eval-harness/service";
import { runSuiteInputSchema } from "@/modules/eval-harness/schemas";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const clientKey = getClientKey(req);

  try {
    const limit = rateLimit(`eval-harness:${clientKey}`, 3, 60 * 60 * 1000);
    if (!limit.allowed) {
      throw new ApiError(429, "Rate limit exceeded (evals are expensive). Try again later.");
    }

    const body = await req.json().catch(() => null);
    const parsed = runSuiteInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const result = await runSuite(parsed.data.projectSlug);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function GET() {
  return NextResponse.json({ projects: getAvailableProjects() });
}
