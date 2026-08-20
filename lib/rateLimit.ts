type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    // Sweep on write: without it the map keeps a bucket per key seen since the
    // process started, and nothing ever removes them.
    if (buckets.size > 500) {
      for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
    }
    const fresh: Bucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, fresh);
    return { allowed: true, remaining: limit - 1, resetAt: fresh.resetAt };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: limit - bucket.count,
    resetAt: bucket.resetAt,
  };
}

export function getClientKey(req: Request): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    // FIRST entry: x-forwarded-for reads client, proxy1, proxy2… so the last
    // one is the hop nearest this server — often identical for every request,
    // which collapsed all callers into a single shared bucket.
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    return parts[0] || "anonymous";
  }

  return "anonymous";
}

/**
 * Preferred limiter key: the account, falling back to the network address for
 * unauthenticated callers.
 *
 * Keying AI budgets purely by IP meant everyone behind one office router or a
 * carrier-grade NAT — the norm for mobile users — shared a single allowance,
 * so a user who had scanned nothing could be told they were out of scans. It
 * also let one client spoof x-forwarded-for to exhaust a stranger's budget.
 */
export function getRateLimitKey(req: Request, userId?: string): string {
  return userId ? `user:${userId}` : `ip:${getClientKey(req)}`;
}
