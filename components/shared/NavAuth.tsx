"use client";

import { useAuth } from "@/lib/authContext";

export function NavAuth() {
  const { user, logout, loading } = useAuth();

  if (loading) return null;

  if (!user) {
    return (
      <a
        href={`/login?redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`}
        className="rounded-md border border-brand-500 px-3 py-1 text-xs font-medium text-brand-500 hover:bg-brand-500/10"
      >
        Login
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-300">{user.name}</span>
      <button
        onClick={logout}
        className="text-xs text-zinc-500 hover:text-zinc-300"
      >
        Logout
      </button>
    </div>
  );
}
