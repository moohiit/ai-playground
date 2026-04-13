"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "../../../../lib/utils";
import { useAuth } from "../../../../lib/authContext";
import { AddExpenseModal } from "./AddExpenseModal";
import { GroupReport } from "./GroupReport";

type Member = { userId: string; email: string; name: string; isActive: boolean };
type Group = { _id: string; name: string; description: string; members: Member[] };
type Balance = {
  memberId: string;
  name: string;
  totalPaid: number;
  totalOwed: number;
  netBalance: number;
};
type Settlement = {
  from: { id: string; name: string };
  to: { id: string; name: string };
  amount: number;
};
type Expense = {
  _id: string;
  paidBy: { id: string; name: string };
  amount: number;
  description: string;
  category: string;
  date: string;
  splitAmong: { memberId: string; name: string }[];
  splits: { memberId: string; name: string; amount: number }[];
};
type SettlementRecord = {
  settlementId: string;
  settledAt: string;
  expenses: Expense[];
};

type Tab = "active" | "history" | "report";
type Props = { groupId: string; onBack: () => void };

export function GroupDetail({ groupId, onBack }: Props) {
  const { authFetch, user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlementHistory, setSettlementHistory] = useState<SettlementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [tab, setTab] = useState<Tab>("active");
  const [showAdd, setShowAdd] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [newMember, setNewMember] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [gRes, bRes, eRes] = await Promise.all([
      authFetch(`/api/projects/expense-tracker/groups/${groupId}`),
      authFetch(`/api/projects/expense-tracker/reports/balances/${groupId}`),
      authFetch(`/api/projects/expense-tracker/expenses?groupId=${groupId}&limit=50&settled=false`),
    ]);
    const [gData, bData, eData] = await Promise.all([
      gRes.json(),
      bRes.json(),
      eRes.json(),
    ]);
    setGroup(gData.group ?? null);
    setBalances(bData.balances ?? []);
    setSettlements(bData.settlements ?? []);
    setExpenses(eData.expenses ?? []);
    setLoading(false);
  }, [groupId]);

  const fetchHistory = useCallback(async () => {
    const res = await authFetch(
      `/api/projects/expense-tracker/groups/${groupId}/history`
    );
    const data = await res.json();
    setSettlementHistory(data.history ?? []);
  }, [groupId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (tab === "history") fetchHistory();
  }, [tab, fetchHistory]);

  async function handleAddMember() {
    if (!newMember.trim()) return;
    setAddingMember(true);
    await authFetch(`/api/projects/expense-tracker/groups/${groupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newMember.trim() }),
    });
    setNewMember("");
    setAddingMember(false);
    fetchAll();
  }

  async function handleDeleteExpense(id: string) {
    if (!confirm("Delete this expense?")) return;
    await authFetch(`/api/projects/expense-tracker/expenses/${id}`, {
      method: "DELETE",
    });
    fetchAll();
  }

  async function handleDeleteGroup() {
    if (!confirm("Delete this group and all its expenses? This cannot be undone."))
      return;
    await authFetch(`/api/projects/expense-tracker/groups/${groupId}`, {
      method: "DELETE",
    });
    onBack();
  }

  async function handleSettle() {
    if (
      !confirm(
        "Settle all current expenses? They will move to settled history and balances will reset."
      )
    )
      return;
    setSettling(true);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/groups/${groupId}/settle`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Settlement failed");
      alert(
        `Settled ${data.expenseCount} expenses. All balances are now cleared.`
      );
      fetchAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Settlement failed");
    } finally {
      setSettling(false);
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading...</p>;
  if (!group) return <p className="text-sm text-red-400">Group not found</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            ← Back to groups
          </button>
          <h2 className="text-xl font-bold">{group.name}</h2>
          {group.description && (
            <p className="text-xs text-zinc-500">{group.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Add Expense
          </button>
          <button
            onClick={handleDeleteGroup}
            className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
          >
            Delete Group
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <nav className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/40 p-1">
        {(
          [
            { key: "active", label: "Active Expenses" },
            { key: "history", label: "Settled History" },
            { key: "report", label: "Group Report" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition",
              tab === t.key
                ? "bg-brand-600 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "active" && (
        <>
          {/* Members */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h3 className="mb-3 text-sm font-semibold">Members</h3>
            <div className="mb-3 flex flex-wrap gap-2">
              {group.members.map((m) => {
                const bal = balances.find((b) => b.memberId === m.userId);
                return (
                  <div
                    key={m.userId}
                    className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2"
                  >
                    <span className="text-sm text-zinc-200">{m.name}</span>
                    {bal && (
                      <span
                        className={cn(
                          "text-xs font-mono tabular-nums",
                          bal.netBalance > 0.01
                            ? "text-emerald-400"
                            : bal.netBalance < -0.01
                            ? "text-red-400"
                            : "text-zinc-500"
                        )}
                      >
                        {bal.netBalance > 0 ? "+" : ""}
                        ₹{bal.netBalance.toFixed(2)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                placeholder="Member email"
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600"
                onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
              />
              <button
                onClick={handleAddMember}
                disabled={addingMember || !newMember.trim()}
                className="rounded-lg border border-brand-500 px-3 py-1.5 text-xs text-brand-500 hover:bg-brand-500/10 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </section>

          {/* Settle Up */}
          {settlements.length > 0 && (
            <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-amber-300">
                  Settle Up
                </h3>
                <button
                  onClick={handleSettle}
                  disabled={settling}
                  className="rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-medium text-black hover:bg-amber-400 disabled:opacity-50"
                >
                  {settling ? "Settling..." : "Mark as Settled"}
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {settlements.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-red-400">
                      {s.from.name}
                    </span>
                    <span className="text-zinc-500">pays</span>
                    <span className="font-medium text-emerald-400">
                      {s.to.name}
                    </span>
                    <span className="ml-auto font-mono tabular-nums text-zinc-200">
                      ₹{s.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Active Expenses */}
          <section>
            <h3 className="mb-3 text-sm font-semibold">
              Active Expenses ({expenses.length})
            </h3>
            {expenses.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
                <p className="text-xs text-zinc-500">
                  No unsettled expenses. All cleared!
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {expenses.map((e) => (
                  <ExpenseRow
                    key={e._id}
                    expense={e}
                    onEdit={() => setEditingExpense(e)}
                    onDelete={() => handleDeleteExpense(e._id)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {tab === "history" && (
        <SettledHistoryView
          history={settlementHistory}
          loading={false}
        />
      )}

      {tab === "report" && (
        <GroupReport groupId={groupId} groupName={group.name} />
      )}

      {showAdd && (
        <AddExpenseModal
          preselectedGroupId={groupId}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            fetchAll();
          }}
        />
      )}

      {editingExpense && (
        <AddExpenseModal
          editExpense={{ ...editingExpense, type: "group", groupId }}
          onClose={() => setEditingExpense(null)}
          onSaved={() => {
            setEditingExpense(null);
            fetchAll();
          }}
        />
      )}
    </div>
  );
}

function ExpenseRow({
  expense: e,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-zinc-200">{e.description}</span>
        <span className="text-[11px] text-zinc-500">
          Paid by {e.paidBy.name} · Split {e.splitAmong.length} ways ·{" "}
          {new Date(e.date).toLocaleDateString()}
        </span>
        <span className="text-[11px] text-zinc-600">
          Split among: {e.splitAmong.map((m) => m.name).join(", ")}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm tabular-nums text-zinc-100">
          ₹{e.amount.toFixed(2)}
        </span>
        <button
          onClick={onEdit}
          className="text-[11px] text-zinc-600 hover:text-brand-400"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="text-[11px] text-zinc-600 hover:text-red-400"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function SettledHistoryView({
  history,
  loading,
}: {
  history: SettlementRecord[];
  loading: boolean;
}) {
  if (loading) return <p className="text-sm text-zinc-500">Loading...</p>;

  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
        <p className="text-sm text-zinc-400">
          No settlement history yet. Settle active expenses to see records here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {history.map((record) => (
        <section
          key={record.settlementId}
          className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-200">
              Settlement on{" "}
              {new Date(record.settledAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </h3>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              Settled · {record.expenses.length} expenses
            </span>
          </div>

          <div className="mb-3 text-xs text-zinc-500">
            Total: ₹
            {record.expenses
              .reduce((sum, e) => sum + e.amount, 0)
              .toFixed(2)}
          </div>

          <div className="flex flex-col gap-1.5">
            {record.expenses.map((e) => (
              <div
                key={e._id}
                className="flex items-center justify-between rounded-md bg-zinc-950/40 px-3 py-2 text-xs"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-zinc-300">{e.description}</span>
                  <span className="text-zinc-600">
                    Paid by {e.paidBy.name} ·{" "}
                    {new Date(e.date).toLocaleDateString()} ·{" "}
                    {e.splitAmong.map((m) => m.name).join(", ")}
                  </span>
                </div>
                <span className="font-mono tabular-nums text-zinc-400">
                  ₹{e.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
