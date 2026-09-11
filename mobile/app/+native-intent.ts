/**
 * Incoming URLs → app routes.
 *
 * Android app links (see android.intentFilters in app.json) deliver the web
 * app's URLs to this app verbatim. The web and the app do not share a route
 * tree — the tracker lives under /projects/expense-tracker on the web and at
 * "/" here — so each link is rewritten to the screen that shows the same
 * thing. Anything unrecognised is passed through untouched, which keeps
 * the expensetracker:// scheme links working as before.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  let pathname = path;
  try {
    // App links arrive as full URLs; scheme links as expensetracker://... —
    // both parse, and only the pathname matters.
    pathname = new URL(path).pathname;
  } catch {
    /* already a bare path */
  }

  const share = pathname.match(/^\/share\/([^/?#]+)/);
  if (share) return `/share/${share[1]}`;

  if (pathname.startsWith("/projects/expense-tracker")) return "/";

  return path;
}
