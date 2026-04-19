import { NextResponse } from "next/server";
import { extractPdfText } from "@/modules/resume-matcher/service";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const clientKey = getClientKey(req);

  try {
    await requireAuth(req);

    const limit = rateLimit(
      `resume-matcher-upload:${clientKey}`,
      20,
      60 * 60 * 1000
    );
    if (!limit.allowed) {
      throw new ApiError(429, "Upload rate limit exceeded");
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      throw new ApiError(400, "Missing 'file' in form data");
    }
    if (file.type !== "application/pdf") {
      throw new ApiError(400, "Only PDF files are supported");
    }
    if (file.size > MAX_BYTES) {
      throw new ApiError(413, "File exceeds 4MB limit");
    }

    const text = await extractPdfText(file);

    if (!text.trim()) {
      throw new ApiError(
        422,
        "Could not extract text from this PDF (it may be image-based)"
      );
    }

    return NextResponse.json({
      text: text.trim(),
      charCount: text.length,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
