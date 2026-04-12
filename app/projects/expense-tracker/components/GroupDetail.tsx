"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { AddExpenseModal } from "./AddExpenseModal";

type Member = { id: string; name: string; isActive: boolean };
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

type Props = { groupId: string; onBack: () => void };

export function GroupDetail({ groupId, onBack }: Props) {
  const [group, setGroup] = useState<Group | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newMember, setNewMember] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [gRes, bRes, eRes] = await Promise.all([
      fetch(`/api/projects/expense-tracker/groups/${groupId}`),
      fetch(`/api/projects/expense-tracker/reports/balances/${groupId}`),
      fetch(`/api/projects/expense-tracker/expenses?groupId=${groupId}&limit=50`),
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

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handleAddMember() {
    if (!newMember.trim()) return;
    setAddingMember(true);
    await fetch(`/api/projects/expense-tracker/groups/${groupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newMember.trim() }),
    });
    setNewMember("");
    setAddingMember(false);
    fetchAll();
  }

  async function handleDeleteExpense(id: string) {
    if (!confirm("Delete this expense?")) return;
    await fetch(`/api/projects/expense-tracker/expenses/${id}`, {
      method: "DELETE",
    });
    fetchAll();
  }

  async function handleDeleteGroup() {
    if (!confirm("Delete this group and all its expenses? This cannot be undone."))
      return;
    await fetch(`/api/projects/expense-tracker/groups/${groupId}`, {
      method: "DELETE",
    });
    onBack();
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

      {/* Members */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h3 className="mb-3 text-sm font-semibold">Members</h3>
        <div className="mb-3 flex flex-wrap gap-2">
          {group.members.map((m) => {
            const bal = balances.find((b) => b.memberId === m.id);
            return (
              <div
                key={m.id}
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
            placeholder="New member name"
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

      {/* Settlements */}
      {settlements.length > 0 && (
        <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
          <h3 className="mb-3 text-sm font-semibold text-amber-300">
            Settle Up
          </h3>
          <div className="flex flex-col gap-2">
            {settlements.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="font-medium text-red-400">{s.from.name}</span>
                <span className="text-zinc-500">pays</span>
                <span className="font-medium text-emerald-400">{s.to.name}</span>
                <span className="ml-auto font-mono tabular-nums text-zinc-200">
                  ₹{s.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Expenses */}
      <section>
        <h3 className="mb-3 text-sm font-semibold">
          Expenses ({expenses.length})
        </h3>
        {expenses.length === 0 ? (
          <p className="text-xs text-zinc-500">No expenses in this group yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {expenses.map((e) => (
              <div
                key={e._id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-3"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-zinc-200">
                    {e.description}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    Paid by {e.paidBy.name} · Split {e.splitAmong.length} ways ·{" "}
                    {new Date(e.date).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm tabular-nums text-zinc-100">
                    ₹{e.amount.toFixed(2)}
                  </span>
                  <button
                    onClick={() => handleDeleteExpense(e._id)}
                    className="text-[11px] text-zinc-600 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
    </div>
  );
}
