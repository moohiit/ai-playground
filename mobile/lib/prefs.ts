export type Prefs = {
  baseCurrency: string;
  locale?: string;
  weekStart?: 0 | 1;
};

type Fetcher = (path: string, opts?: RequestInit) => Promise<Response>;

/**
 * Session cache for the user's preferences.
 *
 * Every screen needs the base currency to format money, and each one used to
 * fetch /prefs on focus — 22 identical requests in a few minutes of ordinary
 * use. Preferences change only from the Settings screen, which invalidates
 * this cache, so one fetch per session is enough.
 *
 * The in-flight promise is cached too, so screens mounting together share a
 * single request rather than firing one each.
 */
let cached: Prefs | null = null;
let inFlight: Promise<Prefs | null> | null = null;

export async function getPrefs(authFetch: Fetcher): Promise<Prefs | null> {
  if (cached) return cached;
  if (!inFlight) {
    inFlight = authFetch("/api/projects/expense-tracker/prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        cached = d?.prefs ?? null;
        return cached;
      })
      .catch(() => null)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Base currency, falling back to INR until preferences load. */
export async function getBaseCurrency(authFetch: Fetcher): Promise<string> {
  const prefs = await getPrefs(authFetch);
  return prefs?.baseCurrency ?? "INR";
}

/** Call after saving preferences, and on logout. */
export function invalidatePrefs() {
  cached = null;
}
