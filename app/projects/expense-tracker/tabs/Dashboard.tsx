"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "../../../../lib/utils";
import { useAuth } from "../../../../lib/authContext";
import { AddExpenseModal } from "../components/AddExpenseModal";
import { CATEGORIES } from "../../../../modules/expense-tracker/schemas";

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
  const { authFetch, user } = useAuth();
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {(["all", "personal", "group"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition",
                view === v
                  ? "border-brand-500 bg-brand-500/10 text-brand-500"
                  : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
              )}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-zinc-500">Total ({total} entries)</div>
            <div className="text-lg font-semibold tabular-nums text-zinc-100">
              ₹{totalAmount.toFixed(2)}
            </div>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Add Expense
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : expenses.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
          <p className="text-sm text-zinc-400">
            No expenses yet. Add one to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-xs">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-zinc-400">
                  Date
                </th>
                <th className="px-4 py-3 text-left font-semibold text-zinc-400">
                  Description
                </th>
                <th className="px-4 py-3 text-left font-semibold text-zinc-400">
                  Category
                </th>
                <th className="px-4 py-3 text-left font-semibold text-zinc-400">
                  Paid by
                </th>
                <th className="px-4 py-3 text-right font-semibold text-zinc-400">
                  Amount
                </th>
                <th className="px-4 py-3 text-left font-semibold text-zinc-400">
                  Split among
                </th>
                <th className="px-4 py-3 text-left font-semibold text-zinc-400">
                  Type
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr
                  key={e._id}
                  className="border-t border-zinc-800/60 hover:bg-zinc-900/40"
                >
                  <td className="px-4 py-3 tabular-nums text-zinc-300">
                    {new Date(e.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-200">{e.description}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-zinc-800/80 px-2 py-0.5 text-[11px] text-zinc-400">
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
                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
                        e.type === "group"
                          ? "bg-brand-500/15 text-brand-500"
                          : "bg-zinc-800 text-zinc-400"
                      )}
                    >
                      {e.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button
                      onClick={() => setEditingExpense(e)}
                      className="text-xs text-zinc-600 hover:text-brand-400"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(e._id)}
                      className="text-xs text-zinc-600 hover:text-red-400"
                    >
                      Delete
                    </button>
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
