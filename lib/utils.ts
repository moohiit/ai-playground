import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// YYYY-MM-DD of a Date's LOCAL wall-clock day. Use this (never
// toISOString().slice(0,10)) whenever the date comes from "now" or a picker:
// toISOString converts to UTC first, so for UTC+X users between midnight and
// X:00 local it lands on the previous day. Displaying an already-stored
// UTC-midnight date is the opposite case — keep toISOString there.
export function localISODate(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// "2h ago" / "3d ago" — relative activity stamps for list rows.
export function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// Stored *days* (an expense's date, a note's dueBy, a warranty's expiry) are
// written as UTC midnight of the day the user picked. Rendering that instant
// in local time shows the previous day for anyone west of UTC, so format the
// UTC parts instead of the local ones.
export function formatDay(
  iso: string,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
}
