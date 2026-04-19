import { ApiError } from "./apiError";
import { connectDB } from "./db";
import { Usage } from "@/models/Usage";
import { User } from "@/models/User";
import {
  currentMonthRange,
  getMonthlyLimit,
  isProjectSlug,
  PROJECT_LABELS,
  type ProjectSlug,
} from "./limits";

/**
 * Enforces the per-user monthly request budget for a given project's AI
 * endpoints. Call at the start of an AI-invocation route, after requireAuth.
 * Throws ApiError(429) when the user has hit their limit.
 */
export async function requireAiUsageSlot(
  userId: string,
  slug: ProjectSlug
): Promise<void> {
  if (!isProjectSlug(slug)) {
    throw new Error(`requireAiUsageSlot: unknown project slug "${slug}"`);
  }

  await connectDB();

  const user = await User.findById(userId, {
    monthlyLimitOverrides: 1,
  }).lean();

  const limit = getMonthlyLimit(
    slug,
    (user?.monthlyLimitOverrides as
      | Map<string, number>
      | Record<string, number>
      | null
      | undefined) ?? null
  );

  const { start, end } = currentMonthRange();
  const count = await Usage.countDocuments({
    userId,
    projectSlug: slug,
    createdAt: { $gte: start, $lt: end },
  });

  if (count >= limit) {
    throw new ApiError(
      429,
      `You've reached this month's ${PROJECT_LABELS[slug]} limit (${limit} requests). The counter resets on the 1st.`
    );
  }
}

/**
 * Records an AI invocation. Call in both success and failure paths so the
 * monthly counter reflects all calls a user made, including the failed ones
 * (matches how hosted AI platforms bill).
 */
export async function logAiUsage(opts: {
  userId?: string | null;
  clientKey: string;
  slug: ProjectSlug;
  action: string;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  tokensUsed?: number;
}): Promise<void> {
  try {
    await connectDB();
    await Usage.create({
      projectSlug: opts.slug,
      action: opts.action,
      clientKey: opts.clientKey,
      userId: opts.userId ?? undefined,
      latencyMs: opts.latencyMs,
      success: opts.success,
      errorMessage: opts.errorMessage,
      tokensUsed: opts.tokensUsed,
    });
  } catch (err) {
    console.warn("[usage] failed to log", err);
  }
}
