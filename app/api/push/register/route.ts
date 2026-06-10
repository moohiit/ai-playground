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
