/**
 * Where a tapped notification should take the user.
 *
 * Pure, so every payload the backend sends (modules/expense-tracker/push.ts)
 * can be checked without a device. Group pushes carry `groupId` and open that
 * group on the tab they are about; everything else carries a `screen`. An
 * unknown or missing payload returns null and the app stays where it was.
 */
export type NotificationRoute =
  | { pathname: "/group/[id]"; params: { id: string; tab: GroupTab } }
  | { pathname: "/budgets" | "/expenses" | "/recurring" | "/groups" };

export type GroupTab = "active" | "settled" | "report";

const SCREENS = {
  budgets: "/budgets",
  expenses: "/expenses",
  recurring: "/recurring",
  groups: "/groups",
} as const;

const TABS: readonly GroupTab[] = ["active", "settled", "report"];

export function routeForNotification(data: unknown): NotificationRoute | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  // A Mongo ObjectId; anything else is not something to navigate to.
  if (typeof d.groupId === "string" && /^[a-f0-9]{24}$/i.test(d.groupId)) {
    const tab = TABS.includes(d.tab as GroupTab) ? (d.tab as GroupTab) : "active";
    return { pathname: "/group/[id]", params: { id: d.groupId, tab } };
  }

  // hasOwn, not `in`: "constructor" is `in` every object via the prototype.
  if (typeof d.screen === "string" && Object.prototype.hasOwnProperty.call(SCREENS, d.screen)) {
    return { pathname: SCREENS[d.screen as keyof typeof SCREENS] };
  }
  return null;
}
