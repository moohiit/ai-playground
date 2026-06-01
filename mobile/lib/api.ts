// Central place for the backend base URL. Set EXPO_PUBLIC_API_URL in .env
// (see .env.example for per-platform notes — phones can't reach "localhost").
const DEFAULT_URL = "http://localhost:3000";

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_URL
).replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
