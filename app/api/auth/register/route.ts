import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { User } from "@/models/User";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { generateToken, expiryFromNow, TOKEN_TTL } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/emailTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    await connectDB();

    const email = parsed.data.email.toLowerCase();
    const existing = await User.findOne({ email });
    if (existing) {
      throw new ApiError(409, "An account with this email already exists");
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const verificationToken = generateToken();

    const user = await User.create({
      name: parsed.data.name,
      email,
      passwordHash,
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationTokenExpiresAt: expiryFromNow(TOKEN_TTL.emailVerification),
    });

    try {
      await sendVerificationEmail({
        to: user.email,
        name: user.name,
        token: verificationToken,
      });
    } catch (emailErr) {
      console.error("[auth/register] failed to send verification email", emailErr);
    }

    return NextResponse.json(
      {
        needsVerification: true,
        email: user.email,
        message:
          "Account created. Check your email for a verification link to finish signing in.",
      },
      { status: 201 }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
