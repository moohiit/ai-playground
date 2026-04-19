import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { User } from "@/models/User";
import { deleteProfilePhoto, uploadProfilePhoto } from "@/lib/cloudinary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof Blob)) {
      throw new ApiError(400, "Upload a file under the `file` field");
    }

    if (file.size > MAX_BYTES) {
      throw new ApiError(413, "File too large (max 4 MB)");
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new ApiError(415, "Only JPEG, PNG, or WebP images are allowed");
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploaded = await uploadProfilePhoto(buffer, auth.userId);

    await connectDB();
    const user = await User.findById(auth.userId);
    if (!user) throw new ApiError(404, "User not found");

    const prevPublicId = user.profilePhotoPublicId;
    user.profilePhotoUrl = uploaded.url;
    user.profilePhotoPublicId = uploaded.publicId;
    await user.save();

    if (prevPublicId && prevPublicId !== uploaded.publicId) {
      deleteProfilePhoto(prevPublicId).catch(() => {});
    }

    return NextResponse.json({
      profilePhotoUrl: uploaded.url,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAuth(req);
    await connectDB();
    const user = await User.findById(auth.userId);
    if (!user) throw new ApiError(404, "User not found");

    const prev = user.profilePhotoPublicId;
    user.profilePhotoUrl = undefined;
    user.profilePhotoPublicId = undefined;
    await user.save();

    if (prev) deleteProfilePhoto(prev).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
