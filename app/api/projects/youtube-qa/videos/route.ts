import { NextResponse } from "next/server";
import { listVideos } from "@/modules/youtube-qa/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const videos = await listVideos(auth.userId);
    return NextResponse.json({ videos });
  } catch (err) {
    return handleRouteError(err);
  }
}
