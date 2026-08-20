"use client";

import { useCallback, useEffect, useState } from "react";
import { cn, localISODate } from "../../../../lib/utils";
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
    accountId: string | null;
  };
  cadence: "weekly" | "monthly" | "yearly";
  nextRunAt: string;
  autoPost: boolean;
  active: boolean;
  endDate: string | null;
  due: boolean;
};

type AccountLite = { _id: string; name: string };

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function RecurringTab() {
  const { authFetch } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  // Set while the form is editing an existing rule rather than adding one.
  const [editing, setEditing] = useState<Rule | null>(null);
  // Rule id with an in-flight mutation — a double-click on "Post now" would
  // otherwise post the same occurrence twice.
  const [busyId, setBusyId] = useState<string | null>(null);

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

  // Accounts only feed the picker and the "posts to" label — a failure here
  // must not stop the rules themselves from rendering.
  useEffect(() => {
    authFetch("/api/projects/expense-tracker/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []))
      .catch(() => {});
  }, [authFetch]);

  async function post(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await authFetch(`/api/projects/expense-tracker/recurring/${id}/post`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to post");
      }
      await load();
    } catch {
      alert("Network error — the bill was not posted.");
    } finally {
      setBusyId(null);
    }
  }
  async function toggleActive(r: Rule) {
    if (busyId) return;
    setBusyId(r._id);
    try {
      await authFetch(`/api/projects/expense-tracker/recurring/${r._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !r.active }),
      });
      await load();
    } catch {
      alert("Network error — rule not updated.");
    } finally {
      setBusyId(null);
    }
  }
  async function remove(id: string) {
    if (busyId) return;
    if (!confirm("Delete this recurring rule? Already-posted transactions stay.")) return;
    setBusyId(id);
    try {
      await authFetch(`/api/projects/expense-tracker/recurring/${id}`, { method: "DELETE" });
      await load();
    } catch {
      alert("Network error — rule not deleted.");
    } finally {
      setBusyId(null);
    }
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
          onClick={() => { setEditing(null); setShowAdd((v) => !v); }}
          className="rounded-lg border border-brand-500/40 bg-brand-500/15 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-500/25"
        >
          + Add recurring
        </button>
      </div>

      {showAdd && (
        <RuleForm
          // Remount when the target changes so the fields re-initialize from
          // the rule being edited instead of keeping the previous one's values.
          key={editing?._id ?? "new"}
          editing={editing}
          accounts={accounts}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); load(); }}
        />
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
                    {r.endDate && <span className="ml-1">· ends {fmtDate(r.endDate)}</span>}
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
                        disabled={busyId !== null}
                        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        {busyId === r._id ? "Posting…" : "Post now"}
                      </button>
                    )}
                    <button onClick={() => toggleActive(r)} className="text-zinc-500 hover:text-zinc-200">
                      {r.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => { setEditing(r); setShowAdd(true); }}
                      className="text-zinc-500 hover:text-brand-400"
                    >
                      Edit
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

function RuleForm({
  editing,
  accounts,
  onClose,
  onSaved,
}: {
  editing: Rule | null;
  accounts: AccountLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { authFetch } = useAuth();
  const [direction, setDirection] = useState<"expense" | "income">(editing?.template.direction ?? "expense");
  const [amount, setAmount] = useState(editing ? String(editing.template.amount) : "");
  const [currency, setCurrency] = useState(editing?.template.currency ?? "INR");
  const [category, setCategory] = useState<string>(editing?.template.category ?? CATEGORIES[0]);
  const [description, setDescription] = useState(editing?.template.description ?? "");
  const [cadence, setCadence] = useState<"weekly" | "monthly" | "yearly">(editing?.cadence ?? "monthly");
  // For an existing rule the start date is its next run — fixed context, since
  // the update endpoint cannot move it.
  const [startDate, setStartDate] = useState(editing ? editing.nextRunAt.slice(0, 10) : localISODate());
  const [endDate, setEndDate] = useState(editing?.endDate ? editing.endDate.slice(0, 10) : "");
  const [accountId, setAccountId] = useState(editing?.template.accountId ?? "");
  const [autoPost, setAutoPost] = useState(editing?.autoPost ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryList = direction === "income" ? INCOME_CATEGORIES : CATEGORIES;
  // An archived account is missing from the picker list but the rule still
  // posts to it, so fall back to a neutral label instead of "no account".
  const editingAccount = accountId
    ? accounts.find((a) => a._id === accountId)?.name ?? "an account"
    : null;

  useEffect(() => {
    if (editing) return;
    authFetch("/api/projects/expense-tracker/prefs")
      .then((r) => r.json())
      .then((d) => d.prefs?.baseCurrency && setCurrency(d.prefs.baseCurrency))
      .catch(() => {});
  }, [authFetch, editing]);

  function changeDirection(d: "expense" | "income") {
    setDirection(d);
    const list = d === "income" ? INCOME_CATEGORIES : CATEGORIES;
    setCategory((c) => ((list as readonly string[]).includes(c) ? c : list[0]));
  }

  async function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return setError("Enter a valid amount");
    if (!description.trim()) return setError("Enter a description");
    // An end date before the first/next run leaves the rule with no occurrences
    // at all — the engine just retires it on the next sweep.
    if (endDate && endDate < startDate) {
      return setError(editing ? "End date is before the next run" : "End date is before the start date");
    }
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(
        editing
          ? `/api/projects/expense-tracker/recurring/${editing._id}`
          : "/api/projects/expense-tracker/recurring",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          // Direction, currency, start date and account are fixed once a rule
          // exists — the update endpoint accepts none of them.
          body: JSON.stringify(
            editing
              ? {
                  amount: amt,
                  category,
                  description: description.trim(),
                  cadence,
                  autoPost,
                  endDate: endDate || null,
                }
              : {
                  amount: amt,
                  currency,
                  category,
                  description: description.trim(),
                  direction,
                  cadence,
                  startDate,
                  autoPost,
                  accountId: accountId || null,
                  endDate: endDate || null,
                }
          ),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to save rule");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save rule");
      setSaving(false);
    }
  }

  const input = "w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none";

  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">
          {editing ? `Edit ${editing.template.description}` : "Add recurring rule"}
        </h3>
        <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-200">Close</button>
      </div>
      <div className="flex flex-col gap-3">
        {editing ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-400">
            <span className="capitalize text-zinc-300">{editing.template.direction}</span> ·{" "}
            {editing.template.currency} · next {fmtDate(editing.nextRunAt)} · posts to{" "}
            {editingAccount ?? "no account"}
            <div className="mt-0.5 text-[11px] text-zinc-600">
              Delete and re-add the rule to change these.
            </div>
          </div>
        ) : (
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
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex">
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className={cn(input, !editing && "rounded-r-none")} />
            {!editing && (
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-r-lg border border-l-0 border-zinc-800 bg-zinc-900/80 px-2 text-xs text-zinc-300 focus:border-brand-500 focus:outline-none">
                {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
            {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (e.g. Netflix, Rent)" className={input} />

        {!editing && accounts.length > 0 && (
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
              Account <span className="normal-case text-zinc-600">(each posted bill moves its balance)</span>
            </label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={input}>
              <option value="">No account</option>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">Repeats</label>
            <select value={cadence} onChange={(e) => setCadence(e.target.value as typeof cadence)} className={input}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          {!editing && (
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">Starts on</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
              Ends on <span className="normal-case text-zinc-600">(optional)</span>
            </label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={input} />
            <p className="mt-1 text-[11px] text-zinc-600">
              Last day a bill can post — the rule pauses itself once it passes.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} className="accent-brand-500" />
          Auto-post (create the transaction automatically each period)
        </label>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:border-zinc-700">Cancel</button>
          <button onClick={submit} disabled={saving} className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : editing ? "Save changes" : "Add rule"}
          </button>
        </div>
      </div>
    </div>
  );
}
