import { NextResponse } from "next/server";
import { ingestPdf } from "@/modules/pdf-chat/service";
import { MAX_PDF_BYTES } from "@/modules/pdf-chat/schemas";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";
import { requireAuth } from "@/lib/auth";
import { logAiUsage, requireAiUsageSlot } from "@/lib/usageLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROJECT_SLUG = "pdf-chat";
const ACTION = "upload";

export async function POST(req: Request) {
  const started = Date.now();
  const clientKey = getClientKey(req);
  let userId: string | null = null;

  try {
    const auth = await requireAuth(req);
    userId = auth.userId;

    const limit = rateLimit(
      `pdf-chat-upload:${clientKey}`,
      6,
      60 * 60 * 1000
    );
    if (!limit.allowed) {
      throw new ApiError(429, "Upload rate limit exceeded");
    }

    await requireAiUsageSlot(userId, PROJECT_SLUG);

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      throw new ApiError(400, "Missing 'file' in form data");
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      throw new ApiError(400, "Only PDF files are supported");
    }
    if (file.size > MAX_PDF_BYTES) {
      throw new ApiError(
        413,
        `PDF exceeds ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB`
      );
    }

    const doc = await ingestPdf({
      userId,
      name: file.name,
      file,
    });

    logAiUsage({
      userId,
      clientKey,
      slug: PROJECT_SLUG,
      action: ACTION,
      success: true,
      latencyMs: Date.now() - started,
    }).catch(() => {});

    return NextResponse.json({ document: doc });
  } catch (err) {
    logAiUsage({
      userId,
      clientKey,
      slug: PROJECT_SLUG,
      action: ACTION,
      success: false,
      latencyMs: Date.now() - started,
      errorMessage: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
    return handleRouteError(err);
  }
}
