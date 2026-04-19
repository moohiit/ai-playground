import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new Error(
      "Cloudinary is not configured: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET"
    );
  }
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
  });
  configured = true;
}

const PROFILE_FOLDER = "ai-playground/profile-photos";

export async function uploadProfilePhoto(
  buffer: Buffer,
  userId: string
): Promise<{ url: string; publicId: string }> {
  ensureConfigured();

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: PROFILE_FOLDER,
        public_id: `user_${userId}_${Date.now()}`,
        resource_type: "image",
        overwrite: true,
        transformation: [
          { width: 512, height: 512, crop: "fill", gravity: "face" },
          { quality: "auto", fetch_format: "auto" },
        ],
      },
      (err, res) => {
        if (err || !res) return reject(err ?? new Error("Upload failed"));
        resolve(res);
      }
    );
    stream.end(buffer);
  });

  return { url: result.secure_url, publicId: result.public_id };
}

export async function deleteProfilePhoto(publicId: string): Promise<void> {
  ensureConfigured();
  try {
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  } catch (err) {
    console.warn("[cloudinary] delete failed", err);
  }
}
