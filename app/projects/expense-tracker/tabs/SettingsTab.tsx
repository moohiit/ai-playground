"use client";

import { useEffect, useState } from "react";
import { cn } from "../../../../lib/utils";
import { useAuth } from "../../../../lib/authContext";
import {
  SUPPORTED_CURRENCIES,
  currencySymbol,
} from "../../../../modules/expense-tracker/currencies";

type Prefs = {
  baseCurrency: string;
  locale: string;
  weekStart: number;
};

export function SettingsTab() {
  const { authFetch, user, logout } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBase, setSavingBase] = useState(false);
  const [savingWeek, setSavingWeek] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    authFetch("/api/projects/expense-tracker/prefs")
      .then((r) => r.json())
      .then((d) => setPrefs(d.prefs ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authFetch]);

  async function patch(body: Record<string, unknown>) {
    const res = await authFetch("/api/projects/expense-tracker/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to save");
    return data.prefs as Prefs;
  }

  async function changeBase(next: string) {
    if (!prefs || next === prefs.baseCurrency) return;
    setSavingBase(true);
    setNote(null);
    const prev = prefs.baseCurrency;
    try {
      const updated = await patch({ baseCurrency: next });
      setPrefs(updated);
      setNote(
        `Base currency set to ${next}. All your existing entries were re-converted from ${prev}.`
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't change base currency.");
    } finally {
      setSavingBase(false);
    }
  }

  async function changeWeekStart(next: 0 | 1) {
    if (!prefs || next === prefs.weekStart) return;
    setSavingWeek(true);
    try {
      const updated = await patch({ weekStart: next });
      setPrefs(updated);
    } catch {
      /* keep previous */
    } finally {
      setSavingWeek(false);
    }
  }

  async function deleteAccount() {
    if (
      !confirm(
        "Permanently delete your account and all your data (personal expenses and groups you created)? This cannot be undone."
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await authFetch("/api/auth/account", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete account");
      logout();
      window.location.href = "/login";
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete account");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-12 text-center text-sm text-zinc-500">
        Loading settings…
      </div>
    );
  }

  if (!prefs) {
    return (
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-12 text-center text-sm text-zinc-400">
        Couldn’t load your settings. Please refresh.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Settings</h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          Preferences for how the expense tracker shows your money.
        </p>
      </div>

      {/* Base currency */}
      <SettingCard
        title="Base currency"
        description="Every total and report is shown in this currency. Changing it re-converts all your existing entries using current exchange rates."
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={prefs.baseCurrency}
              disabled={savingBase}
              onChange={(e) => changeBase(e.target.value)}
              className="appearance-none rounded-lg border border-zinc-800 bg-zinc-950/70 py-2 pl-3 pr-9 text-sm font-medium text-zinc-100 outline-none transition-colors hover:border-zinc-600 focus:border-brand-500 disabled:opacity-50"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {currencySymbol(c)} {c}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
              ▾
            </span>
          </div>
          {savingBase && (
            <span className="text-xs text-zinc-500">Re-converting your entries…</span>
          )}
        </div>
        {note && (
          <p className="mt-3 rounded-md border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs text-brand-200">
            {note}
          </p>
        )}
      </SettingCard>

      {/* Week start */}
      <SettingCard
        title="Week starts on"
        description="Used by weekly views and reports."
      >
        <div className="flex gap-2">
          {([
            [1, "Monday"],
            [0, "Sunday"],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              type="button"
              disabled={savingWeek}
              onClick={() => changeWeekStart(val)}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm font-medium transition-all disabled:opacity-50",
                prefs.weekStart === val
                  ? "border-brand-500/60 bg-brand-500/15 text-brand-400"
                  : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </SettingCard>

      {/* Account / danger zone */}
      <div className="relative overflow-hidden rounded-xl border border-red-500/30 bg-gradient-to-b from-red-950/20 to-zinc-950/40 p-5 backdrop-blur-sm">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
        <h3 className="text-sm font-semibold text-zinc-100">Account</h3>
        {user?.email && (
          <p className="mt-0.5 text-xs text-zinc-500">Signed in as {user.email}</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-zinc-700 bg-zinc-900/40 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
          >
            Log out
          </button>
          <button
            type="button"
            onClick={deleteAccount}
            disabled={deleting}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete account"}
          </button>
        </div>
        <p className="mt-3 max-w-prose text-[11px] text-zinc-600">
          Deleting your account permanently removes your personal expenses and the
          groups you created. This cannot be undone.
        </p>
      </div>
    </div>
  );
}

function SettingCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5 backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
      <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
      <p className="mb-3 mt-0.5 max-w-prose text-xs text-zinc-500">{description}</p>
      {children}
    </div>
  );
}
