import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { comparePassword, hashPassword, requireAuth, signToken } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { User } from "@/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(6, "New password must be at least 6 characters")
      .max(200),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must differ from the current one.",
    path: ["newPassword"],
  });

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    await connectDB();
    const user = await User.findById(auth.userId);
    if (!user) throw new ApiError(404, "User not found");

    const ok = await comparePassword(parsed.data.currentPassword, user.passwordHash);
    if (!ok) throw new ApiError(401, "Current password is incorrect.");

    user.passwordHash = await hashPassword(parsed.data.newPassword);
    // Revoke every previously issued session — a leaked token must die when
    // the password changes. The fresh token keeps THIS session signed in.
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    const token = signToken({
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      tv: user.tokenVersion,
    });

    return NextResponse.json({ ok: true, token });
  } catch (err) {
    return handleRouteError(err);
  }
}
