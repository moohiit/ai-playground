import { NextResponse } from "next/server";
import { deleteDocument } from "@/modules/pdf-chat/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(req);
    await deleteDocument({ userId: auth.userId, documentId: params.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
