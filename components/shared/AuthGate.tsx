"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (loading || user) return;
    const qs = searchParams?.toString();
    const fullPath = qs ? `${pathname}?${qs}` : pathname ?? "/";
    const target = `/login?redirect=${encodeURIComponent(fullPath)}`;
    router.replace(target);
  }, [loading, user, pathname, searchParams, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-500/60 border-t-transparent" />
          Checking your session…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
