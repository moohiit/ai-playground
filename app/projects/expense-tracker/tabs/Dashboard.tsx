"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "../../../../lib/utils";
import { useAuth } from "../../../../lib/authContext";
import { AddExpenseModal } from "../components/AddExpenseModal";

type Expense = {
  _id: string;
  type: "personal" | "group";
  groupId?: string;
  paidBy: { id: string; name: string };
  amount: number;
  description: string;
  category: string;
  date: string;
  splitAmong?: { memberId: string; name: string }[];
  splits: { memberId: string; name: string; amount: number }[];
};

type ViewMode = "all" | "personal" | "group";

export function Dashboard() {
  const { authFetch } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (view !== "all") params.set("type", view);
    const res = await authFetch(
      `/api/projects/expense-tracker/expenses?${params}`
    );
    const data = await res.json();
    setExpenses(data.expenses ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [view]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this expense?")) return;
    await authFetch(`/api/projects/expense-tracker/expenses/${id}`, {
      method: "DELETE",
    });
    fetchExpenses();
  }

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Showing"
          value={`₹${totalAmount.toFixed(2)}`}
          hint={`${expenses.length} of ${total} entries`}
          accent="from-brand-500/40"
        />
        <StatCard
          label="View"
          value={view.charAt(0).toUpperCase() + view.slice(1)}
          hint="Filter mode"
          accent="from-fuchsia-500/40"
        />
        <button
          onClick={() => setShowAdd(true)}
          className="group relative flex items-center justify-between overflow-hidden rounded-xl border border-brand-500/40 bg-gradient-to-br from-brand-600/30 via-brand-500/20 to-fuchsia-500/20 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-[0_15px_40px_-10px_rgba(99,102,241,0.5)]"
        >
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          <div className="relative">
            <div className="text-xs uppercase tracking-wider text-zinc-300">
              Quick add
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              + New Expense
            </div>
          </div>
          <div className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition-transform group-hover:rotate-90">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "personal", "group"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-all",
              view === v
                ? "border-brand-500/60 bg-brand-500/15 text-brand-500 shadow-[0_0_20px_-5px_rgba(99,102,241,0.5)]"
                : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:-translate-y-0.5 hover:border-zinc-600 hover:text-zinc-200"
            )}
          >
            {v}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg border border-zinc-800/60 bg-zinc-900/30"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      ) : expenses.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 backdrop-blur-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-xs">
              <tr>
                {[
                  "Date",
                  "Description",
                  "Category",
                  "Paid by",
                  "Amount",
                  "Split among",
                  "Type",
                  "",
                ].map((h, i) => (
                  <th
                    key={i}
                    className={cn(
                      "px-4 py-3 font-semibold uppercase tracking-wider text-zinc-500",
                      h === "Amount" ? "text-right" : "text-left"
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expenses.map((e, i) => (
                <tr
                  key={e._id}
                  className="animate-fade-up border-t border-zinc-800/60 transition-colors hover:bg-brand-500/5"
                  style={{ animationDelay: `${i * 25}ms` }}
                >
                  <td className="px-4 py-3 tabular-nums text-zinc-300">
                    {new Date(e.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-100">{e.description}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[11px] text-zinc-300">
                      {e.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{e.paidBy.name}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-100">
                    ₹{e.amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {e.splitAmong && e.splitAmong.length > 0
                      ? e.splitAmong.map((m) => m.name).join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ring-1",
                        e.type === "group"
                          ? "bg-brand-500/10 text-brand-500 ring-brand-500/30"
                          : "bg-zinc-800/60 text-zinc-400 ring-zinc-700"
                      )}
                    >
                      {e.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setEditingExpense(e)}
                        className="text-xs text-zinc-500 transition-colors hover:text-brand-400"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(e._id)}
                        className="text-xs text-zinc-500 transition-colors hover:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddExpenseModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            fetchExpenses();
          }}
        />
      )}

      {editingExpense && (
        <AddExpenseModal
          editExpense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onSaved={() => {
            setEditingExpense(null);
            fetchExpenses();
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5 backdrop-blur-sm">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent",
          accent ?? "from-brand-500/40"
        )}
      />
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-zinc-100">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-12 text-center backdrop-blur-sm">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-3xl" />
      <div className="relative mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      </div>
      <p className="relative text-sm text-zinc-400">
        No expenses yet. Add one to get started.
      </p>
    </div>
  );
}
