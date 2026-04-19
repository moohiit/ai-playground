import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { handleRouteError } from "@/lib/apiError";
import { rateLimit } from "@/lib/rateLimit";
import { generateToken, expiryFromNow, TOKEN_TTL } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/emailTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
});

// Constant positive response — never reveal whether the email exists.
const GENERIC_OK = {
  ok: true,
  message:
    "If that email has an unverified account, we just sent a new verification link.",
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

    const token = generateToken();
    user.emailVerificationToken = token;
    user.emailVerificationTokenExpiresAt = expiryFromNow(
      TOKEN_TTL.emailVerification
    );
    await user.save();

    try {
      await sendVerificationEmail({ to: user.email, name: user.name, token });
    } catch (emailErr) {
      console.error("[auth/resend] failed to send", emailErr);
    }

    return NextResponse.json(GENERIC_OK);
  } catch (err) {
    return handleRouteError(err);
  }
}
