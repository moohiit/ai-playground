import { NextResponse } from "next/server";
import { listDocuments } from "@/modules/pdf-chat/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const documents = await listDocuments(auth.userId);
    return NextResponse.json({ documents });
  } catch (err) {
    return handleRouteError(err);
  }
}
