import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { hashPassword } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";
import { rateLimit } from "@/lib/rateLimit";
import { expiryFromNow, generateOtp, TOKEN_TTL } from "@/lib/tokens";
import { sendPasswordResetOtpEmail } from "@/lib/emailTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
});

const GENERIC_OK = {
  ok: true,
  message:
    "If an account exists for that email, we just sent a 6-digit reset code.",
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(GENERIC_OK);
    }

    const email = parsed.data.email.toLowerCase();
    const limit = rateLimit(`pwreset:${email}`, 3, 60 * 60 * 1000);
    if (!limit.allowed) return NextResponse.json(GENERIC_OK);

    await connectDB();
    const user = await User.findOne({ email });
    if (!user) return NextResponse.json(GENERIC_OK);

    const otp = generateOtp(6);
    user.passwordResetOtpHash = await hashPassword(otp);
    user.passwordResetOtpExpiresAt = expiryFromNow(TOKEN_TTL.passwordResetOtp);
    user.passwordResetOtpAttempts = 0;
    await user.save();

    try {
      await sendPasswordResetOtpEmail({
        to: user.email,
        name: user.name,
        otp,
      });
    } catch (emailErr) {
      console.error("[auth/password-reset] failed to send OTP", emailErr);
    }

    return NextResponse.json(GENERIC_OK);
  } catch (err) {
    return handleRouteError(err);
  }
}
