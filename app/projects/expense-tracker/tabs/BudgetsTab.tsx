"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "../../../../lib/utils";
import { useAuth } from "../../../../lib/authContext";
import { CATEGORIES } from "../../../../modules/expense-tracker/schemas";
import { formatMoney } from "../../../../modules/expense-tracker/currencies";
import { categoryColor } from "../colors";

type BudgetItem = {
  _id: string;
  scope: "overall" | "category";
  category: string | null;
  amount: number;
  limit: number;
  spent: number;
  remaining: number;
  pct: number;
  status: "ok" | "warn" | "over";
};

const STATUS_COLOR: Record<BudgetItem["status"], string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  over: "bg-red-500",
};
const STATUS_TEXT: Record<BudgetItem["status"], string> = {
  ok: "text-emerald-400",
  warn: "text-amber-400",
  over: "text-red-400",
};

function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function thisMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function BudgetsTab() {
  const { authFetch } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [budgets, setBudgets] = useState<BudgetItem[]>([]);
  const [base, setBase] = useState("INR");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await authFetch(`/api/projects/expense-tracker/budgets?month=${month}`);
    const data = await res.json().catch(() => ({}));
    setBudgets(data.budgets ?? []);
    setLoading(false);
  }, [authFetch, month]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    authFetch("/api/projects/expense-tracker/prefs")
      .then((r) => r.json())
      .then((d) => d.prefs?.baseCurrency && setBase(d.prefs.baseCurrency))
      .catch(() => {});
  }, [authFetch]);

  const overall = budgets.find((b) => b.scope === "overall");
  const categoryBudgets = budgets.filter((b) => b.scope === "category");
  const usedCategories = new Set(categoryBudgets.map((b) => b.category));

  async function handleDelete(id: string) {
    if (!confirm("Delete this budget?")) return;
    await authFetch(`/api/projects/expense-tracker/budgets/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ArrowBtn onClick={() => setMonth((m) => shiftMonth(m, -1))} dir="left" />
          <div className="min-w-[150px] text-center text-sm font-semibold text-zinc-100">
            {monthLabel(month)}
          </div>
          <ArrowBtn
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            dir="right"
            disabled={month >= thisMonth()}
          />
          {month !== thisMonth() && (
            <button
              onClick={() => setMonth(thisMonth())}
              className="ml-1 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              This month
            </button>
          )}
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-lg border border-brand-500/40 bg-brand-500/15 px-4 py-2 text-sm font-semibold text-brand-300 transition-colors hover:bg-brand-500/25"
        >
          + Add budget
        </button>
      </div>

      {showAdd && (
        <AddBudgetForm
          hasOverall={!!overall}
          usedCategories={usedCategories}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}

      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/30" />
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-12 text-center text-sm text-zinc-400">
          No budgets yet. Add an overall monthly cap or per-category budgets to track overspending.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {overall && (
            <BudgetCard budget={overall} base={base} onDelete={() => handleDelete(overall._id)} highlight />
          )}
          {categoryBudgets.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {categoryBudgets.map((b) => (
                <BudgetCard key={b._id} budget={b} base={base} onDelete={() => handleDelete(b._id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BudgetCard({
  budget: b,
  base,
  onDelete,
  highlight,
}: {
  budget: BudgetItem;
  base: string;
  onDelete: () => void;
  highlight?: boolean;
}) {
  const title = b.scope === "overall" ? "Overall" : b.category ?? "Category";
  const color = b.scope === "category" && b.category ? categoryColor(b.category) : undefined;
  const widthPct = Math.min(100, Math.round(b.pct * 100));

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5",
        highlight ? "border-brand-500/30" : "border-zinc-800/80"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
          <span className="font-semibold text-zinc-100">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("text-xs font-medium", STATUS_TEXT[b.status])}>
            {Math.round(b.pct * 100)}%
          </span>
          <button
            onClick={onDelete}
            className="text-xs text-zinc-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div className="font-mono text-lg font-bold tabular-nums text-zinc-100">
          {formatMoney(b.spent, base)}
          <span className="ml-1 text-xs font-normal text-zinc-500">of {formatMoney(b.limit, base)}</span>
        </div>
        <div className={cn("text-xs font-medium", b.remaining < 0 ? "text-red-400" : "text-zinc-400")}>
          {b.remaining < 0
            ? `${formatMoney(Math.abs(b.remaining), base)} over`
            : `${formatMoney(b.remaining, base)} left`}
        </div>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={cn("h-full rounded-full transition-all", STATUS_COLOR[b.status])}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}

function AddBudgetForm({
  hasOverall,
  usedCategories,
  onClose,
  onSaved,
}: {
  hasOverall: boolean;
  usedCategories: Set<string | null>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { authFetch } = useAuth();
  const availableCategories = CATEGORIES.filter((c) => !usedCategories.has(c));
  const [scope, setScope] = useState<"overall" | "category">(hasOverall ? "category" : "overall");
  const [category, setCategory] = useState<string>(availableCategories[0] ?? "");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return setError("Enter a valid amount");
    if (scope === "category" && !category) return setError("Pick a category");
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/projects/expense-tracker/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          category: scope === "category" ? category : undefined,
          amount: amt,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to add budget");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add budget");
      setSaving(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">Add monthly budget</h3>
        <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-200">
          Close
        </button>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <ScopeBtn active={scope === "overall"} disabled={hasOverall} onClick={() => setScope("overall")}>
            Overall {hasOverall && "(exists)"}
          </ScopeBtn>
          <ScopeBtn active={scope === "category"} onClick={() => setScope("category")}>
            Category
          </ScopeBtn>
        </div>

        {scope === "category" && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 focus:border-brand-500 focus:outline-none"
          >
            {availableCategories.length === 0 ? (
              <option value="">All categories already have budgets</option>
            ) : (
              availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))
            )}
          </select>
        )}

        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Monthly limit"
          className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
        />

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:border-zinc-700"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || (scope === "category" && availableCategories.length === 0)}
            className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add budget"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScopeBtn({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all disabled:opacity-40",
        active
          ? "border-brand-500/60 bg-brand-500/15 text-brand-400"
          : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600"
      )}
    >
      {children}
    </button>
  );
}

function ArrowBtn({ onClick, dir, disabled }: { onClick: () => void; dir: "left" | "right"; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );
}
