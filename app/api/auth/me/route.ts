import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    // Read the live record rather than echoing the token. The JWT carries the
    // name and email captured when it was signed, so a rename showed the old
    // name again the moment the session was restored from storage.
    await connectDB();
    const fresh = await User.findById(auth.userId).select("name email").lean();
    return NextResponse.json({
      user: {
        ...auth,
        name: fresh?.name ?? auth.name,
        email: fresh?.email ?? auth.email,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
