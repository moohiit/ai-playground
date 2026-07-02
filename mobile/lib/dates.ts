// YYYY-MM-DD of a Date's LOCAL wall-clock day. Use this (never
// toISOString().slice(0,10)) whenever the date comes from "now" or a picker:
// toISOString converts to UTC first, so for IST users between midnight and
// 5:30 AM it lands on the previous day. Displaying an already-stored
// UTC-midnight date is the opposite case — keep toISOString there.
export function localISODate(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
