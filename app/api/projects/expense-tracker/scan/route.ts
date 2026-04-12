import { NextResponse } from "next/server";
import { scanReceipt } from "@/modules/expense-tracker/service";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const clientKey = getClientKey(req);

  try {
    const limit = rateLimit(
      `expense-tracker-scan:${clientKey}`,
      10,
      60 * 60 * 1000
    );
    if (!limit.allowed) {
      throw new ApiError(429, "Scan rate limit exceeded");
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      throw new ApiError(400, "Missing 'file' in form data");
    }
    if (!file.type.startsWith("image/")) {
      throw new ApiError(400, "Only image files are supported");
    }
    if (file.size > MAX_BYTES) {
      throw new ApiError(413, "File exceeds 5MB limit");
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const result = await scanReceipt(base64, file.type);

    return NextResponse.json({ result });
  } catch (err) {
    return handleRouteError(err);
  }
}
