import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { UserPrefs } from "@/modules/expense-tracker/models";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const { token } = body as { token?: unknown };
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }
    await connectDB();
    // A device token identifies a device, not an account. If someone else was
    // signed in on this device before, detach it from them first — otherwise
    // one physical phone stays subscribed to two accounts and both users get
    // each other's notifications.
    await UserPrefs.updateMany(
      { expoPushToken: token, userId: { $ne: auth.userId } },
      { $set: { expoPushToken: null } }
    );
    await UserPrefs.findOneAndUpdate(
      { userId: auth.userId },
      { $set: { expoPushToken: token } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAuth(req);
    await connectDB();
    await UserPrefs.updateOne(
      { userId: auth.userId },
      { $set: { expoPushToken: null } }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
