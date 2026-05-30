"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthApiError, useAuth } from "../../lib/authContext";
import { cn } from "../../lib/utils";

type Mode = "login" | "register";

type VerificationPrompt = {
  email: string;
  message: string;
};

function AuthBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#05060a] via-[#0a0b16] to-[#05060a]" />
      <div className="absolute inset-0 bg-grid bg-radial-fade opacity-50" />
      <div className="absolute -left-32 -top-24 h-[30rem] w-[30rem] rounded-full bg-brand-600/30 blur-3xl animate-blob" />
      <div
        className="absolute -right-24 top-1/4 h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/20 blur-3xl animate-blob"
        style={{ animationDelay: "4s" }}
      />
      <div
        className="absolute -bottom-32 left-1/3 h-[32rem] w-[32rem] rounded-full bg-pink-500/15 blur-3xl animate-blob"
        style={{ animationDelay: "8s" }}
      />
    </div>
  );
}

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[72vh] items-center justify-center">
      <div className="animate-fade-up relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-[0_30px_80px_-25px_rgba(99,102,241,0.5)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/70 to-transparent" />
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-500/20 blur-2xl" />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

function BrandBadge() {
  return (
    <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/25 to-fuchsia-500/15 text-brand-300 shadow-[0_8px_24px_-8px_rgba(99,102,241,0.6)]">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-zinc-950/60 py-2.5 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-all focus:border-brand-500/60 focus:bg-zinc-950/80 focus:ring-2 focus:ring-brand-500/25";

function Field({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
        {icon}
      </span>
      {children}
    </div>
  );
}

function LoginContent() {
  const { login, register, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectParam = searchParams?.get("redirect") ?? null;
  const redirectTo =
    redirectParam && redirectParam.startsWith("/") ? redirectParam : "/";

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState<VerificationPrompt | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">(
    "idle"
  );

  useEffect(() => {
    if (user) router.replace(redirectTo);
  }, [user, redirectTo, router]);

  async function handleResend(targetEmail: string) {
    setResendState("sending");
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      setResendState("sent");
    } catch {
      setResendState("idle");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPrompt(null);
    setResendState("idle");
    setLoading(true);

    try {
      if (mode === "login") {
        await login(email, password);
        router.replace(redirectTo);
      } else {
        const result = await register(name, email, password);
        if (result.kind === "verified") {
          router.replace(redirectTo);
        } else {
          setPrompt({ email: result.email, message: result.message });
          setLoading(false);
        }
      }
    } catch (err) {
      if (err instanceof AuthApiError && err.code === "EMAIL_NOT_VERIFIED") {
        setPrompt({
          email: err.email ?? email,
          message:
            "Your email isn't verified yet. Check your inbox or resend the verification link.",
        });
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
      setLoading(false);
    }
  }

  if (prompt) {
    return (
      <>
        <AuthBackground />
        <AuthCard>
          <div className="text-center">
            <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/15 text-brand-300 shadow-[0_8px_24px_-8px_rgba(99,102,241,0.6)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-zinc-100">
              Check your inbox
            </h1>
            <p className="mt-2 text-sm text-zinc-400">{prompt.message}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Sent to <span className="text-zinc-300">{prompt.email}</span>
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleResend(prompt.email)}
                disabled={resendState !== "idle"}
                className={cn(
                  "rounded-xl border border-white/10 bg-zinc-950/50 py-2.5 text-xs font-medium transition hover:border-brand-500/40 hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-60",
                  resendState === "sent" ? "text-emerald-400" : "text-zinc-300"
                )}
              >
                {resendState === "idle"
                  ? "Resend verification email"
                  : resendState === "sending"
                  ? "Sending…"
                  : "Sent — check your inbox"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrompt(null);
                  setMode("login");
                  setResendState("idle");
                }}
                className="text-xs text-zinc-500 transition hover:text-zinc-300"
              >
                ← Back to sign in
              </button>
            </div>
          </div>
        </AuthCard>
      </>
    );
  }

  return (
    <>
      <AuthBackground />
      <AuthCard>
        <div className="mb-6 text-center">
          <BrandBadge />
          <h1 className="text-2xl font-bold tracking-tight">
            {mode === "login" ? (
              <>
                Welcome <span className="text-gradient-brand">back</span>
              </>
            ) : (
              <>
                Create <span className="text-gradient-brand">account</span>
              </>
            )}
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            {mode === "login"
              ? "Sign in to continue to AI Playground"
              : "Join AI Playground in seconds"}
          </p>
        </div>

        <div className="mb-6 flex gap-1 rounded-xl border border-white/10 bg-zinc-950/40 p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn(
                "flex-1 rounded-lg py-1.5 text-sm font-medium capitalize transition-all",
                mode === m
                  ? "bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/30"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === "register" && (
            <Field
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              }
            >
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
                className={inputClass}
              />
            </Field>
          )}
          <Field
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-10 5L2 7" />
              </svg>
            }
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className={inputClass}
            />
          </Field>
          <Field
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            }
          >
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={6}
              className={inputClass}
            />
          </Field>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group relative mt-1 overflow-hidden rounded-xl bg-gradient-to-r from-brand-600 via-brand-500 to-fuchsia-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className="relative">
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Sign in"
                : "Create account"}
            </span>
          </button>

          {mode === "login" && (
            <Link
              href="/forgot-password"
              className="text-center text-xs text-zinc-500 transition hover:text-brand-400"
            >
              Forgot password?
            </Link>
          )}
        </form>
      </AuthCard>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
