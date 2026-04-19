"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { cn } from "@/lib/utils";

type Stage = "email" | "code" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { applyExistingToken } = useAuth();
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error("Something went wrong");
      setStage("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          otp: otp.trim(),
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reset failed");

      applyExistingToken(data.token, {
        userId: data.user.id,
        email: data.user.email,
        name: data.user.name,
      });
      setStage("done");
      setTimeout(() => router.replace("/"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/40 p-8">
        {stage === "email" && (
          <>
            <h1 className="mb-2 text-center text-xl font-bold">
              Reset your password
            </h1>
            <p className="mb-6 text-center text-xs text-zinc-500">
              Enter your email and we&apos;ll send a 6-digit code.
            </p>
            <form onSubmit={handleRequest} className="flex flex-col gap-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send reset code"}
              </button>
              <Link
                href="/login"
                className="text-center text-xs text-zinc-500 hover:text-zinc-300"
              >
                ← Back to sign in
              </Link>
            </form>
          </>
        )}

        {stage === "code" && (
          <>
            <h1 className="mb-2 text-center text-xl font-bold">
              Enter the code
            </h1>
            <p className="mb-6 text-center text-xs text-zinc-500">
              We sent a 6-digit code to{" "}
              <span className="text-zinc-300">{email}</span>. It expires in 15
              minutes.
            </p>
            <form onSubmit={handleVerify} className="flex flex-col gap-4">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="6-digit code"
                required
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-center font-mono text-base tracking-[0.5em] text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 6 chars)"
                required
                minLength={6}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className={cn(
                  "rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                )}
              >
                {loading ? "Resetting…" : "Reset password"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStage("email");
                  setOtp("");
                  setNewPassword("");
                  setError(null);
                }}
                className="text-center text-xs text-zinc-500 hover:text-zinc-300"
              >
                ← Use a different email
              </button>
            </form>
          </>
        )}

        {stage === "done" && (
          <div className="text-center">
            <div className="mx-auto mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-zinc-100">
              Password updated
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              You&apos;re signed in. Redirecting…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
