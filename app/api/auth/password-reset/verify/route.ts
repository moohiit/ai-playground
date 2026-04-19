import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { comparePassword, hashPassword, signToken } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

const schema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
  newPassword: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(200),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid input"
      );
    }

    const clientKey = getClientKey(req);
    const ipLimit = rateLimit(`pwreset-verify:${clientKey}`, 10, 60 * 60 * 1000);
    if (!ipLimit.allowed) {
      throw new ApiError(429, "Too many attempts. Try again later.");
    }

    await connectDB();
    const email = parsed.data.email.toLowerCase();
    const user = await User.findOne({ email });

    if (
      !user ||
      !user.passwordResetOtpHash ||
      !user.passwordResetOtpExpiresAt
    ) {
      throw new ApiError(400, "Invalid or expired reset code.");
    }

    if (user.passwordResetOtpExpiresAt < new Date()) {
      user.passwordResetOtpHash = undefined;
      user.passwordResetOtpExpiresAt = undefined;
      user.passwordResetOtpAttempts = 0;
      await user.save();
      throw new ApiError(400, "Reset code has expired. Request a new one.");
    }

    if ((user.passwordResetOtpAttempts ?? 0) >= MAX_ATTEMPTS) {
      user.passwordResetOtpHash = undefined;
      user.passwordResetOtpExpiresAt = undefined;
      user.passwordResetOtpAttempts = 0;
      await user.save();
      throw new ApiError(
        400,
        "Too many wrong attempts. Request a new reset code."
      );
    }

    const match = await comparePassword(
      parsed.data.otp,
      user.passwordResetOtpHash
    );
    if (!match) {
      user.passwordResetOtpAttempts = (user.passwordResetOtpAttempts ?? 0) + 1;
      await user.save();
      throw new ApiError(400, "Incorrect reset code.");
    }

    user.passwordHash = await hashPassword(parsed.data.newPassword);
    user.passwordResetOtpHash = undefined;
    user.passwordResetOtpExpiresAt = undefined;
    user.passwordResetOtpAttempts = 0;
    user.emailVerified = true;
    await user.save();

    const jwt = signToken({
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
    });

    return NextResponse.json({
      token: jwt,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
