"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "../../../../lib/utils";
import { useAuth } from "../../../../lib/authContext";
import { CATEGORIES, INCOME_CATEGORIES } from "../../../../modules/expense-tracker/schemas";
import { SUPPORTED_CURRENCIES, formatMoney } from "../../../../modules/expense-tracker/currencies";

type Rule = {
  _id: string;
  template: {
    amount: number;
    currency: string;
    category: string;
    description: string;
    direction: "expense" | "income";
  };
  cadence: "weekly" | "monthly" | "yearly";
  nextRunAt: string;
  autoPost: boolean;
  active: boolean;
  endDate: string | null;
  due: boolean;
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function RecurringTab() {
  const { authFetch } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await authFetch("/api/projects/expense-tracker/recurring");
    const data = await res.json().catch(() => ({}));
    setRules(data.recurring ?? []);
    setLoading(false);
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(id: string) {
    await authFetch(`/api/projects/expense-tracker/recurring/${id}/post`, { method: "POST" });
    load();
  }
  async function toggleActive(r: Rule) {
    await authFetch(`/api/projects/expense-tracker/recurring/${r._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    });
    load();
  }
  async function remove(id: string) {
    if (!confirm("Delete this recurring rule? Already-posted transactions stay.")) return;
    await authFetch(`/api/projects/expense-tracker/recurring/${id}`, { method: "DELETE" });
    load();
  }

  const dueCount = rules.filter((r) => r.due && !r.autoPost).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Recurring & subscriptions</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Rent, EMIs, subscriptions — auto-posted daily, or confirm them yourself.
            {dueCount > 0 && (
              <span className="ml-1 text-amber-400">{dueCount} due now.</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-lg border border-brand-500/40 bg-brand-500/15 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-500/25"
        >
          + Add recurring
        </button>
      </div>

      {showAdd && (
        <AddRuleForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
      )}

      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/30" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-12 text-center text-sm text-zinc-400">
          No recurring rules yet. Add rent, a subscription, or any repeating bill.
        </div>
      ) : (
        <div className="grid gap-3">
          {rules.map((r) => (
            <div
              key={r._id}
              className={cn(
                "rounded-xl border bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-4",
                !r.active ? "border-zinc-800/60 opacity-60" : r.due ? "border-amber-500/40" : "border-zinc-800/80"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-100">{r.template.description}</span>
                    {r.template.direction === "income" && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 ring-1 ring-emerald-500/30">income</span>
                    )}
                    {r.autoPost && (
                      <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-400 ring-1 ring-brand-500/30">auto</span>
                    )}
                    {!r.active && (
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">paused</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {r.template.category} · {r.cadence} ·{" "}
                    {r.active ? `next ${fmtDate(r.nextRunAt)}` : "paused"}
                    {r.due && r.active && <span className="ml-1 text-amber-400">· due</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "font-mono text-base font-semibold tabular-nums",
                      r.template.direction === "income" ? "text-emerald-400" : "text-zinc-100"
                    )}
                  >
                    {r.template.direction === "income" ? "+" : ""}
                    {formatMoney(r.template.amount, r.template.currency)}
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    {r.due && r.active && !r.autoPost && (
                      <button
                        onClick={() => post(r._id)}
                        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-300 hover:bg-amber-500/20"
                      >
                        Post now
                      </button>
                    )}
                    <button onClick={() => toggleActive(r)} className="text-zinc-500 hover:text-zinc-200">
                      {r.active ? "Pause" : "Resume"}
                    </button>
                    <button onClick={() => remove(r._id)} className="text-zinc-500 hover:text-red-400">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddRuleForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { authFetch } = useAuth();
  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [cadence, setCadence] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [autoPost, setAutoPost] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryList = direction === "income" ? INCOME_CATEGORIES : CATEGORIES;

  useEffect(() => {
    authFetch("/api/projects/expense-tracker/prefs")
      .then((r) => r.json())
      .then((d) => d.prefs?.baseCurrency && setCurrency(d.prefs.baseCurrency))
      .catch(() => {});
  }, [authFetch]);

  function changeDirection(d: "expense" | "income") {
    setDirection(d);
    const list = d === "income" ? INCOME_CATEGORIES : CATEGORIES;
    setCategory((c) => ((list as readonly string[]).includes(c) ? c : list[0]));
  }

  async function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return setError("Enter a valid amount");
    if (!description.trim()) return setError("Enter a description");
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/projects/expense-tracker/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt, currency, category, description: description.trim(),
          direction, cadence, startDate, autoPost,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to add");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
      setSaving(false);
    }
  }

  const input = "w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none";

  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">Add recurring rule</h3>
        <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-200">Close</button>
      </div>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          {(["expense", "income"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => changeDirection(d)}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-all",
                direction === d
                  ? d === "income"
                    ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400"
                    : "border-brand-500/60 bg-brand-500/15 text-brand-400"
                  : "border-zinc-800 bg-zinc-900/40 text-zinc-400"
              )}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex">
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className={cn(input, "rounded-r-none")} />
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-r-lg border border-l-0 border-zinc-800 bg-zinc-900/80 px-2 text-xs text-zinc-300 focus:border-brand-500 focus:outline-none">
              {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
            {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (e.g. Netflix, Rent)" className={input} />

        <div className="grid grid-cols-2 gap-3">
          <select value={cadence} onChange={(e) => setCadence(e.target.value as typeof cadence)} className={input}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input} />
        </div>

        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} className="accent-brand-500" />
          Auto-post (create the transaction automatically each period)
        </label>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:border-zinc-700">Cancel</button>
          <button onClick={submit} disabled={saving} className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Add rule"}
          </button>
        </div>
      </div>
    </div>
  );
}
