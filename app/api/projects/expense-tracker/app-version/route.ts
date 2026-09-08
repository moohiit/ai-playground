import { NextResponse } from "next/server";
import { MIN_SUPPORTED_MOBILE_VERSION } from "@/modules/expense-tracker/appVersion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated: the app asks this before login, on every launch.
 * Nothing here is sensitive — it is one version string — and it is cached at
 * the edge for five minutes so a fleet of launches costs nothing.
 */
export async function GET() {
  return NextResponse.json(
    { minSupportedVersion: MIN_SUPPORTED_MOBILE_VERSION },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } }
  );
}
