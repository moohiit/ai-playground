import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { comparePassword, requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { User } from "@/models/User";
import { expiryFromNow, generateToken, TOKEN_TTL } from "@/lib/tokens";
import { sendPendingEmailChangeEmail } from "@/lib/emailTemplates";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  newEmail: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const limit = rateLimit(`change-email:${auth.userId}`, 3, 60 * 60 * 1000);
    if (!limit.allowed) {
      throw new ApiError(429, "Too many change attempts. Try again later.");
    }

    await connectDB();
    const user = await User.findById(auth.userId);
    if (!user) throw new ApiError(404, "User not found");

    const passwordOk = await comparePassword(parsed.data.password, user.passwordHash);
    if (!passwordOk) {
      throw new ApiError(401, "Current password is incorrect.");
    }

    const newEmail = parsed.data.newEmail.toLowerCase();
    if (newEmail === user.email) {
      throw new ApiError(400, "That's already your email.");
    }

    const clash = await User.findOne({ email: newEmail });
    if (clash) {
      throw new ApiError(409, "That email is already in use.");
    }

    const token = generateToken();
    user.pendingEmail = newEmail;
    user.pendingEmailToken = token;
    user.pendingEmailTokenExpiresAt = expiryFromNow(TOKEN_TTL.pendingEmail);
    await user.save();

    try {
      await sendPendingEmailChangeEmail({
        to: newEmail,
        name: user.name,
        token,
      });
    } catch (emailErr) {
      console.error("[profile/change-email] send failed", emailErr);
      throw new ApiError(
        500,
        "Couldn't send the confirmation email. Check your email settings or try again."
      );
    }

    return NextResponse.json({
      ok: true,
      pendingEmail: newEmail,
      message:
        "We sent a confirmation link to the new address. The change takes effect once you click it.",
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
    user.pendingEmail = undefined;
    user.pendingEmailToken = undefined;
    user.pendingEmailTokenExpiresAt = undefined;
    await user.save();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
