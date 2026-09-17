import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { WebPushSubscription } from "@/modules/expense-tracker/models";
import { webPushPublicKey } from "@/modules/expense-tracker/webPush";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subscribeSchema = z
  .object({
    subscription: z.object({
      // Push services are always https; refusing anything else keeps this from
      // being used to make the server POST to arbitrary addresses.
      endpoint: z.string().url().startsWith("https://").max(2000),
      keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(300) }),
    }),
  })
  .strict();

/** The key the browser needs to subscribe, and whether web push is set up at all. */
export async function GET() {
  const publicKey = webPushPublicKey();
  return NextResponse.json({ configured: !!publicKey, publicKey });
}

/** This browser agreed to notifications. */
export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const parsed = subscribeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid subscription");
    }
    const { endpoint, keys } = parsed.data.subscription;
    await connectDB();
    // An endpoint is a browser profile, not an account: whoever is signed in
    // now owns it, or the previous user would keep getting this one's pushes.
    await WebPushSubscription.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          userId: auth.userId,
          keys,
          userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Turned off in this browser, or signing out of it. */
export async function DELETE(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = (await req.json().catch(() => ({}))) as { endpoint?: unknown };
    if (typeof body.endpoint !== "string") throw new ApiError(400, "endpoint required");
    await connectDB();
    await WebPushSubscription.deleteOne({ endpoint: body.endpoint, userId: auth.userId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
