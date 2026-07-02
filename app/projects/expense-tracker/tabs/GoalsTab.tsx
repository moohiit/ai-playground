"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "../../../../lib/utils";
import { useAuth } from "../../../../lib/authContext";
import { formatMoney } from "../../../../modules/expense-tracker/currencies";

type Goal = {
  _id: string;
  name: string;
  deadline: string | null;
  linkedAccountId: string | null;
  target: number;
  saved: number;
  remaining: number;
  pct: number;
  complete: boolean;
  monthsLeft: number | null;
  monthlyNeeded: number | null;
};
type AccountLite = { _id: string; name: string };

export function GoalsTab() {
  const { authFetch } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [base, setBase] = useState("INR");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const res = await authFetch("/api/projects/expense-tracker/goals");
    const data = await res.json().catch(() => ({}));
    setGoals(data.goals ?? []);
    setLoading(false);
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    authFetch("/api/projects/expense-tracker/prefs")
      .then((r) => r.json())
      .then((d) => d.prefs?.baseCurrency && setBase(d.prefs.baseCurrency))
      .catch(() => {});
    authFetch("/api/projects/expense-tracker/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []))
      .catch(() => {});
  }, [authFetch]);

  const [busyId, setBusyId] = useState<string | null>(null);

  async function contribute(g: Goal, amount: number) {
    if (busyId) return;
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Enter a positive amount");
      return;
    }
    setBusyId(g._id);
    try {
      const res = await authFetch(`/api/projects/expense-tracker/goals/${g._id}/contribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to add contribution");
      }
      await load();
    } catch {
      alert("Network error — contribution not saved.");
    } finally {
      setBusyId(null);
    }
  }
  async function remove(id: string) {
    if (busyId) return;
    if (!confirm("Delete this goal?")) return;
    setBusyId(id);
    try {
      await authFetch(`/api/projects/expense-tracker/goals/${id}`, { method: "DELETE" });
      await load();
    } catch {
      alert("Network error — goal not deleted.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Savings goals</h2>
          <p className="mt-0.5 text-sm text-zinc-500">Set a target, track progress, and see what to save each month.</p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-lg border border-brand-500/40 bg-brand-500/15 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-500/25"
        >
          + New goal
        </button>
      </div>

      {showAdd && (
        <AddGoalForm accounts={accounts} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/30" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-12 text-center text-sm text-zinc-400">
          No goals yet. Add one — e.g. an emergency fund or a trip.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((g) => (
            <GoalCard key={g._id} goal={g} base={base} onContribute={contribute} onDelete={() => remove(g._id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalCard({
  goal: g,
  base,
  onContribute,
  onDelete,
}: {
  goal: Goal;
  base: string;
  onContribute: (g: Goal, amount: number) => void;
  onDelete: () => void;
}) {
  const [amount, setAmount] = useState("");
  const widthPct = Math.min(100, Math.round(g.pct * 100));
  const linked = !!g.linkedAccountId;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5",
        g.complete ? "border-emerald-500/40" : "border-zinc-800/80"
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-100">{g.name}</span>
            {g.complete && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">reached 🎉</span>}
            {linked && <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-400">linked</span>}
          </div>
          {g.deadline && (
            <div className="mt-0.5 text-[11px] text-zinc-500">
              by {new Date(g.deadline).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}
              {g.monthlyNeeded != null && !g.complete && (
                <span className="text-amber-400"> · save {formatMoney(g.monthlyNeeded, base)}/mo</span>
              )}
            </div>
          )}
        </div>
        <button onClick={onDelete} className="text-xs text-zinc-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100">
          Delete
        </button>
      </div>

      <div className="mt-3 font-mono text-lg font-bold tabular-nums text-zinc-100">
        {formatMoney(g.saved, base)}
        <span className="ml-1 text-xs font-normal text-zinc-500">of {formatMoney(g.target, base)} · {Math.round(g.pct * 100)}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className={cn("h-full rounded-full transition-all", g.complete ? "bg-emerald-500" : "bg-brand-500")} style={{ width: `${widthPct}%` }} />
      </div>

      {!linked && !g.complete && (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Add amount"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
          />
          <button
            onClick={() => {
              const a = parseFloat(amount);
              if (a) onContribute(g, a);
              setAmount("");
            }}
            disabled={!amount}
            className="shrink-0 rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
      {linked && <div className="mt-3 text-[11px] text-zinc-500">Tracks a linked account’s balance.</div>}
    </div>
  );
}

function AddGoalForm({
  accounts,
  onClose,
  onSaved,
}: {
  accounts: AccountLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { authFetch } = useAuth();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("0");
  const [deadline, setDeadline] = useState("");
  const [linkedAccountId, setLinkedAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return setError("Enter a name");
    const t = parseFloat(target);
    if (!t || t <= 0) return setError("Enter a target");
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/projects/expense-tracker/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          target: t,
          savedAmount: linkedAccountId ? 0 : parseFloat(saved) || 0,
          deadline: deadline || undefined,
          linkedAccountId: linkedAccountId || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to add goal");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add goal");
      setSaving(false);
    }
  }

  const input = "w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none";

  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">New savings goal</h3>
        <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-200">Close</button>
      </div>
      <div className="flex flex-col gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goal name (e.g. Emergency fund)" className={input} />
        <div className="grid grid-cols-2 gap-3">
          <input type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target amount" className={input} />
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">Track via account (optional)</label>
          <select value={linkedAccountId} onChange={(e) => setLinkedAccountId(e.target.value)} className={input}>
            <option value="">Manual (I'll add contributions)</option>
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>{a.name}</option>
            ))}
          </select>
        </div>
        {!linkedAccountId && (
          <input type="number" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="Already saved (optional)" className={input} />
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:border-zinc-700">Cancel</button>
          <button onClick={submit} disabled={saving} className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Add goal"}
          </button>
        </div>
      </div>
    </div>
  );
}
