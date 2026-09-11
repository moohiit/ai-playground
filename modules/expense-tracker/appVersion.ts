/**
 * The oldest mobile build this backend still supports.
 *
 * The app compares its own version against this on launch. Below it, Play's
 * in-app update runs in IMMEDIATE mode (full screen, must update to
 * continue); at or above it, in FLEXIBLE mode (the half-screen sheet the
 * user can dismiss). Bump it only when an API change would leave older apps
 * broken — a new feature is not a reason.
 *
 * Play itself decides whether an update exists; this only decides how hard
 * to ask.
 */
// 1.11.0 (build 15) cannot read or write SecureStore; it must not stay installed.
export const MIN_SUPPORTED_MOBILE_VERSION = "1.11.1";

/** Numeric compare of dotted versions: negative if a < b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
