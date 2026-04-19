import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { User } from "@/models/User";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(10),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "Invalid verification token");
    }

    await connectDB();

    const token = parsed.data.token;
    const now = new Date();

    // Match either initial verification token or pending-email-change token
    const user = await User.findOne({
      $or: [
        { emailVerificationToken: token },
        { pendingEmailToken: token },
      ],
    });

    if (!user) {
      throw new ApiError(
        400,
        "This verification link is invalid or has already been used."
      );
    }

    let mode: "initial" | "email-change";
    if (user.emailVerificationToken === token) {
      if (
        !user.emailVerificationTokenExpiresAt ||
        user.emailVerificationTokenExpiresAt < now
      ) {
        throw new ApiError(
          400,
          "This verification link has expired. Request a new one."
        );
      }
      user.emailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationTokenExpiresAt = undefined;
      mode = "initial";
    } else {
      if (
        !user.pendingEmailTokenExpiresAt ||
        user.pendingEmailTokenExpiresAt < now ||
        !user.pendingEmail
      ) {
        throw new ApiError(
          400,
          "This email-change link has expired. Start again from your profile."
        );
      }
      const clash = await User.findOne({ email: user.pendingEmail });
      if (clash && clash._id.toString() !== user._id.toString()) {
        user.pendingEmail = undefined;
        user.pendingEmailToken = undefined;
        user.pendingEmailTokenExpiresAt = undefined;
        await user.save();
        throw new ApiError(
          409,
          "That email is already in use by another account."
        );
      }
      user.email = user.pendingEmail;
      user.pendingEmail = undefined;
      user.pendingEmailToken = undefined;
      user.pendingEmailTokenExpiresAt = undefined;
      mode = "email-change";
    }

    await user.save();

    const jwt = signToken({
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
    });

    return NextResponse.json({
      mode,
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
