import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { handleRouteError } from "@/lib/apiError";
import { rateLimit } from "@/lib/rateLimit";
import { hashPassword } from "@/lib/auth";
import { generateOtp, expiryFromNow, TOKEN_TTL } from "@/lib/tokens";
import { sendVerificationOtpEmail } from "@/lib/emailTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
}).strict();

// Constant positive response — never reveal whether the email exists.
const GENERIC_OK = {
  ok: true,
  message:
    "If that email has an unverified account, we just sent a new verification code.",
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(GENERIC_OK);
    }

    const email = parsed.data.email.toLowerCase();

    const limit = rateLimit(`resend-verify:${email}`, 3, 60 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(GENERIC_OK);
    }

    await connectDB();
    const user = await User.findOne({ email });
    if (!user || user.emailVerified) {
      return NextResponse.json(GENERIC_OK);
    }

    const otp = generateOtp(6);
    user.emailVerificationOtpHash = await hashPassword(otp);
    user.emailVerificationOtpExpiresAt = expiryFromNow(
      TOKEN_TTL.emailVerificationOtp
    );
    user.emailVerificationOtpAttempts = 0;
    await user.save();

    try {
      await sendVerificationOtpEmail({ to: user.email, name: user.name, otp });
    } catch (emailErr) {
      console.error("[auth/resend] failed to send", emailErr);
    }

    return NextResponse.json(GENERIC_OK);
  } catch (err) {
    return handleRouteError(err);
  }
}
