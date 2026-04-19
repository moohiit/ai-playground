"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";

export function NavAuth() {
  const { user, logout, loading, authFetch } = useAuth();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setPhotoUrl(null);
      return;
    }
    let cancelled = false;
    authFetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setPhotoUrl(d?.user?.profilePhotoUrl ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, authFetch]);

  if (loading) return null;

  if (!user) {
    return (
      <a
        href={`/login?redirect=${encodeURIComponent(
          typeof window !== "undefined" ? window.location.pathname : "/"
        )}`}
        className="rounded-md border border-brand-500 px-3 py-1 text-xs font-medium text-brand-500 hover:bg-brand-500/10"
      >
        Login
      </a>
    );
  }

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/profile"
        className="group flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 pl-1 pr-3 py-1 text-xs text-zinc-300 transition hover:border-brand-500/40 hover:text-brand-300"
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={user.name}
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/30 to-fuchsia-500/30 text-[10px] font-semibold text-zinc-100">
            {initials || "?"}
          </span>
        )}
        <span className="max-w-[120px] truncate">{user.name}</span>
      </Link>
      <button
        onClick={logout}
        className="text-xs text-zinc-500 hover:text-zinc-300"
      >
        Logout
      </button>
    </div>
  );
}
