import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";
import { User } from "@/models/User";
import { Usage } from "@/models/Usage";
import {
  DEFAULT_MONTHLY_REQUEST_LIMITS,
  PROJECT_LABELS,
  PROJECT_SLUGS,
  currentMonthRange,
  getMonthlyLimit,
  type ProjectSlug,
} from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    await connectDB();

    const user = await User.findById(auth.userId).lean();
    if (!user) throw new ApiError(404, "User not found");

    const { start, end } = currentMonthRange();

    type UsageAgg = { _id: string; count: number; success: number };

    const [monthlyAgg, lifetimeAgg] = await Promise.all([
      Usage.aggregate<UsageAgg>([
        {
          $match: {
            userId: auth.userId,
            createdAt: { $gte: start, $lt: end },
          },
        },
        {
          $group: {
            _id: "$projectSlug",
            count: { $sum: 1 },
            success: { $sum: { $cond: ["$success", 1, 0] } },
          },
        },
      ]),
      Usage.aggregate<UsageAgg>([
        { $match: { userId: auth.userId } },
        {
          $group: {
            _id: "$projectSlug",
            count: { $sum: 1 },
            success: { $sum: { $cond: ["$success", 1, 0] } },
          },
        },
      ]),
    ]);

    const monthlyBySlug = new Map(
      monthlyAgg.map((r) => [r._id, { count: r.count, success: r.success }])
    );
    const lifetimeBySlug = new Map(
      lifetimeAgg.map((r) => [r._id, { count: r.count, success: r.success }])
    );

    const overridesMap = (user.monthlyLimitOverrides ?? null) as
      | Map<string, number>
      | Record<string, number>
      | null;

    const usage = PROJECT_SLUGS.map((slug) => {
      const monthly = monthlyBySlug.get(slug) ?? { count: 0, success: 0 };
      const lifetime = lifetimeBySlug.get(slug) ?? { count: 0, success: 0 };
      const limit = getMonthlyLimit(slug as ProjectSlug, overridesMap);
      return {
        slug,
        label: PROJECT_LABELS[slug as ProjectSlug],
        monthlyCount: monthly.count,
        monthlySuccessCount: monthly.success,
        monthlyLimit: limit,
        defaultMonthlyLimit: DEFAULT_MONTHLY_REQUEST_LIMITS[slug as ProjectSlug],
        lifetimeCount: lifetime.count,
      };
    });

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified ?? false,
        pendingEmail: user.pendingEmail ?? null,
        profilePhotoUrl: user.profilePhotoUrl ?? null,
        createdAt: user.createdAt,
      },
      usage,
      monthStart: start.toISOString(),
      monthEnd: end.toISOString(),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    await connectDB();
    const user = await User.findByIdAndUpdate(
      auth.userId,
      { name: parsed.data.name.trim() },
      { new: true }
    );
    if (!user) throw new ApiError(404, "User not found");

    return NextResponse.json({
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
