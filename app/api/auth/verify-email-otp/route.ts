import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { comparePassword, signToken } from "@/lib/auth";
import { User } from "@/models/User";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { rateLimit, getClientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

const schema = z
  .object({
    email: z.string().email(),
    otp: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
  })
  .strict();

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const clientKey = getClientKey(req);
    const limit = rateLimit(`verify-otp:${clientKey}`, 10, 60 * 60 * 1000);
    if (!limit.allowed) {
      throw new ApiError(429, "Too many attempts. Try again later.");
    }

    await connectDB();
    const email = parsed.data.email.toLowerCase();
    const user = await User.findOne({ email });

    // Already verified — let them proceed (idempotent).
    if (user?.emailVerified) {
      const jwt = signToken({
        userId: user._id.toString(),
        email: user.email,
        name: user.name,
      });
      return NextResponse.json({
        token: jwt,
        user: { id: user._id.toString(), name: user.name, email: user.email },
      });
    }

    if (
      !user ||
      !user.emailVerificationOtpHash ||
      !user.emailVerificationOtpExpiresAt
    ) {
      throw new ApiError(400, "Invalid or expired code. Request a new one.");
    }

    if (user.emailVerificationOtpExpiresAt < new Date()) {
      user.emailVerificationOtpHash = undefined;
      user.emailVerificationOtpExpiresAt = undefined;
      user.emailVerificationOtpAttempts = 0;
      await user.save();
      throw new ApiError(400, "Code has expired. Request a new one.");
    }

    if ((user.emailVerificationOtpAttempts ?? 0) >= MAX_ATTEMPTS) {
      user.emailVerificationOtpHash = undefined;
      user.emailVerificationOtpExpiresAt = undefined;
      user.emailVerificationOtpAttempts = 0;
      await user.save();
      throw new ApiError(400, "Too many wrong attempts. Request a new code.");
    }

    const match = await comparePassword(
      parsed.data.otp,
      user.emailVerificationOtpHash
    );
    if (!match) {
      user.emailVerificationOtpAttempts =
        (user.emailVerificationOtpAttempts ?? 0) + 1;
      await user.save();
      throw new ApiError(400, "Incorrect code.");
    }

    user.emailVerified = true;
    user.emailVerificationOtpHash = undefined;
    user.emailVerificationOtpExpiresAt = undefined;
    user.emailVerificationOtpAttempts = 0;
    user.emailVerificationToken = undefined;
    user.emailVerificationTokenExpiresAt = undefined;
    await user.save();

    const jwt = signToken({
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
    });

    return NextResponse.json({
      token: jwt,
      user: { id: user._id.toString(), name: user.name, email: user.email },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
