"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";

type Status = "verifying" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { applyExistingToken } = useAuth();
  const [status, setStatus] = useState<Status>("verifying");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"initial" | "email-change" | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const token = searchParams?.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token.");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Verification failed");
        }
        setMode(data.mode);
        applyExistingToken(data.token, {
          userId: data.user.id,
          email: data.user.email,
          name: data.user.name,
        });
        setStatus("success");
        setMessage(
          data.mode === "email-change"
            ? "Your email has been updated."
            : "Email verified. You're signed in."
        );
        setTimeout(() => router.replace("/"), 1500);
      } catch (err) {
        setStatus("error");
        setMessage(
          err instanceof Error ? err.message : "Verification failed"
        );
      }
    })();
  }, [searchParams, router, applyExistingToken]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
        {status === "verifying" && (
          <>
            <div className="mx-auto mb-4 inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-500/60 border-t-transparent" />
            <h1 className="text-base font-semibold text-zinc-100">
              Verifying your email…
            </h1>
            <p className="mt-1 text-xs text-zinc-500">One moment.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mx-auto mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-zinc-100">
              {mode === "email-change" ? "Email updated" : "You're verified"}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">{message}</p>
            <p className="mt-4 text-xs text-zinc-500">
              Redirecting to the homepage…
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mx-auto mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15 text-red-400 ring-1 ring-red-500/30">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-zinc-100">
              Verification failed
            </h1>
            <p className="mt-1 text-sm text-zinc-400">{message}</p>
            <Link
              href="/login"
              className="mt-4 inline-flex items-center gap-1 text-sm text-brand-400 hover:text-brand-300"
            >
              Back to sign in →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
