"use client";

import { useState, useMemo, type FormEvent } from "react";
import { useAuth } from "../../lib/authContext";
import { cn } from "../../lib/utils";

type Mode = "login" | "register";

function getRedirectUrl(): string {
  if (typeof window === "undefined") return "/";
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");
  if (redirect && redirect.startsWith("/")) return redirect;
  return "/";
}

export default function LoginPage() {
  const { login, register, user } = useAuth();
  const redirectTo = useMemo(getRedirectUrl, []);
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) {
    if (typeof window !== "undefined") window.location.href = redirectTo;
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      window.location.href = redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
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
