"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthApiError, useAuth } from "../../lib/authContext";
import { cn } from "../../lib/utils";

type Mode = "login" | "register";

type VerificationPrompt = {
  email: string;
  message: string;
};

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
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/30">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                "rounded-lg border border-zinc-800 bg-zinc-900/60 py-2 text-xs font-medium transition hover:border-brand-500/40 hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-60",
                resendState === "sent"
                  ? "text-emerald-400"
                  : "text-zinc-300"
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
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              ← Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/40 p-8">
        <h1 className="mb-6 text-center text-xl font-bold">
          {mode === "login" ? "Welcome back" : "Create account"}
        </h1>

        <div className="mb-6 flex gap-1 rounded-lg border border-zinc-800 p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn(
                "flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition",
                mode === m
                  ? "bg-brand-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === "register" && (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              required
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={6}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading
              ? "Please wait..."
              : mode === "login"
              ? "Sign in"
              : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
