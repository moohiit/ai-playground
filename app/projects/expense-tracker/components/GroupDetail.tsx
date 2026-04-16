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

const PAGE_SIZE = 10;

export function GroupDetail({ groupId, onBack }: Props) {
  const { authFetch } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [page, setPage] = useState(1);
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
      authFetch(
        `/api/projects/expense-tracker/expenses?groupId=${groupId}&limit=${PAGE_SIZE}&page=${page}&settled=false`
      ),
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
    setExpenseTotal(eData.total ?? 0);
    setLoading(false);
  }, [groupId, page]);

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
      setPage(1);
      fetchAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Settlement failed");
    } finally {
      setSettling(false);
    }
  }

  if (loading && !group) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Spinner /> Loading group...
      </div>
    );
  }
  if (!group) return <p className="text-sm text-red-400">Group not found</p>;

  const totalPages = Math.max(1, Math.ceil(expenseTotal / PAGE_SIZE));
  const showPagination = expenseTotal > PAGE_SIZE;
  const rangeStart = expenseTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(expenseTotal, page * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <button
            onClick={onBack}
            className="group inline-flex w-fit items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-brand-500"
          >
            <span className="transition-transform group-hover:-translate-x-1">←</span>
            Back to groups
          </button>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">
            {group.name}
          </h2>
          {group.description && (
            <p className="text-xs text-zinc-500">{group.description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowAdd(true)}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-brand-600 via-brand-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition-transform hover:scale-[1.03]"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className="relative">+ Add Expense</span>
          </button>
          <button
            onClick={handleDeleteGroup}
            className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-sm text-red-400 transition-colors hover:border-red-500/60 hover:bg-red-500/10"
          >
            Delete Group
          </button>
        </div>
      </div>

      <nav className="relative flex gap-1 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-1 backdrop-blur-sm">
        {(
          [
            { key: "active", label: "Active", icon: ActiveIcon },
            { key: "history", label: "Settled", icon: HistoryIcon },
            { key: "report", label: "Report", icon: ReportIcon },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all sm:flex-none",
              tab === t.key
                ? "bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/30"
                : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
            )}
          >
            <t.icon />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <div key={tab} className="flex flex-col gap-6">
        {tab === "active" && (
          <>
            <MembersSection
              members={group.members}
              balances={balances}
              newMember={newMember}
              setNewMember={setNewMember}
              onAdd={handleAddMember}
              adding={addingMember}
            />

            {settlements.length > 0 && (
              <SettleUpSection
                settlements={settlements}
                settling={settling}
                onSettle={handleSettle}
              />
            )}

            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-100">
                  Active Expenses{" "}
                  <span className="ml-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                    {expenseTotal}
                  </span>
                </h3>
                {showPagination && (
                  <span className="text-xs text-zinc-500">
                    {rangeStart}–{rangeEnd} of {expenseTotal}
                  </span>
                )}
              </div>

              {expenses.length === 0 ? (
                <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-12 text-center backdrop-blur-sm">
                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
                  <div className="relative mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </div>
                  <p className="relative text-sm text-zinc-400">
                    All cleared! No unsettled expenses.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {expenses.map((e, i) => (
                    <ExpenseRow
                      key={e._id}
                      index={i}
                      expense={e}
                      onEdit={() => setEditingExpense(e)}
                      onDelete={() => handleDeleteExpense(e._id)}
                    />
                  ))}
                </div>
              )}

              {showPagination && (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onChange={setPage}
                />
              )}
            </section>
          </>
        )}

        {tab === "history" && <SettledHistoryView history={settlementHistory} />}

        {tab === "report" && (
          <GroupReport groupId={groupId} groupName={group.name} />
        )}
      </div>

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

function MembersSection({
  members,
  balances,
  newMember,
  setNewMember,
  onAdd,
  adding,
}: {
  members: Member[];
  balances: Balance[];
  newMember: string;
  setNewMember: (v: string) => void;
  onAdd: () => void;
  adding: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5 backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent" />
      <h3 className="mb-3 text-sm font-semibold text-zinc-100">Members</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        {members.map((m) => {
          const bal = balances.find((b) => b.memberId === m.userId);
          const tone =
            bal && bal.netBalance > 0.01
              ? "border-emerald-500/30 bg-emerald-500/5"
              : bal && bal.netBalance < -0.01
              ? "border-red-500/30 bg-red-500/5"
              : "border-zinc-800 bg-zinc-950/60";
          return (
            <div
              key={m.userId}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                tone
              )}
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/30 to-fuchsia-500/20 text-[10px] font-semibold text-zinc-200">
                {m.name.charAt(0).toUpperCase()}
              </span>
              <span className="text-sm text-zinc-200">{m.name}</span>
              {bal && (
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    bal.netBalance > 0.01
                      ? "text-emerald-400"
                      : bal.netBalance < -0.01
                      ? "text-red-400"
                      : "text-zinc-500"
                  )}
                >
                  {bal.netBalance > 0 ? "+" : ""}₹{bal.netBalance.toFixed(2)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input
          type="email"
          value={newMember}
          onChange={(e) => setNewMember(e.target.value)}
          placeholder="Add member by email"
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
        />
        <button
          onClick={onAdd}
          disabled={adding || !newMember.trim()}
          className="rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-500 transition-all hover:-translate-y-0.5 hover:bg-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {adding ? "Adding..." : "Add"}
        </button>
      </div>
    </section>
  );
}

function SettleUpSection({
  settlements,
  settling,
  onSettle,
}: {
  settlements: Settlement[];
  settling: boolean;
  onSettle: () => void;
}) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-amber-500/5 p-5 backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-300">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          Settle Up
        </h3>
        <button
          onClick={onSettle}
          disabled={settling}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-semibold text-black shadow-lg shadow-amber-500/30 transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          {settling ? "Settling..." : "Mark as Settled"}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {settlements.map((s, i) => (
          <div
            key={i}
            className="animate-fade-up flex items-center gap-2 rounded-lg border border-amber-500/20 bg-zinc-950/40 px-3 py-2 text-sm"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <span className="font-medium text-red-400">{s.from.name}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <span className="font-medium text-emerald-400">{s.to.name}</span>
            <span className="ml-auto font-mono tabular-nums text-zinc-100">
              ₹{s.amount.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExpenseRow({
  expense: e,
  index,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="animate-fade-up group flex items-center justify-between gap-3 rounded-lg border border-zinc-800/80 bg-gradient-to-b from-zinc-900/40 to-zinc-950/40 px-4 py-3 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-zinc-700"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-100">{e.description}</span>
          <span className="rounded-md border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 text-[10px] text-zinc-400">
            {e.category}
          </span>
        </div>
        <span className="text-[11px] text-zinc-500">
          Paid by{" "}
          <span className="font-medium text-zinc-300">{e.paidBy.name}</span> ·
          Split {e.splitAmong.length} ways ·{" "}
          {new Date(e.date).toLocaleDateString()}
        </span>
        <span className="truncate text-[11px] text-zinc-600">
          {e.splitAmong.map((m) => m.name).join(", ")}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-mono text-sm font-semibold tabular-nums text-zinc-100">
          ₹{e.amount.toFixed(2)}
        </span>
        <button
          onClick={onEdit}
          className="text-[11px] text-zinc-500 transition-colors hover:text-brand-400"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="text-[11px] text-zinc-500 transition-colors hover:text-red-400"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function SettledHistoryView({ history }: { history: SettlementRecord[] }) {
  if (history.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-12 text-center backdrop-blur-sm">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
        <p className="relative text-sm text-zinc-400">
          No settlement history yet. Settle active expenses to see records here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {history.map((record, i) => (
        <section
          key={record.settlementId}
          className="animate-fade-up relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5 backdrop-blur-sm"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">
              Settled on{" "}
              {new Date(record.settledAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-medium text-emerald-400 ring-1 ring-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {record.expenses.length} expenses
            </span>
          </div>

          <div className="mb-3 text-xs text-zinc-500">
            Total:{" "}
            <span className="font-mono text-zinc-300">
              ₹
              {record.expenses
                .reduce((sum, e) => sum + e.amount, 0)
                .toFixed(2)}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            {record.expenses.map((e) => (
              <div
                key={e._id}
                className="flex items-center justify-between rounded-md border border-zinc-800/60 bg-zinc-950/40 px-3 py-2 text-xs"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-zinc-200">{e.description}</span>
                  <span className="truncate text-zinc-600">
                    Paid by {e.paidBy.name} ·{" "}
                    {new Date(e.date).toLocaleDateString()} ·{" "}
                    {e.splitAmong.map((m) => m.name).join(", ")}
                  </span>
                </div>
                <span className="font-mono tabular-nums text-zinc-300">
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

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  const pages = pageNumbers(page, totalPages);
  return (
    <div className="flex items-center justify-center gap-1 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 backdrop-blur-sm">
      <PageBtn disabled={page === 1} onClick={() => onChange(page - 1)} aria-label="Previous">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </PageBtn>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e-${i}`} className="px-2 text-xs text-zinc-600">
            …
          </span>
        ) : (
          <PageBtn key={p} active={p === page} onClick={() => onChange(p)}>
            {p}
          </PageBtn>
        )
      )}
      <PageBtn
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Next"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </PageBtn>
    </div>
  );
}

function PageBtn({
  active,
  disabled,
  onClick,
  children,
  ...rest
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-medium transition-all",
        active
          ? "border-brand-500/60 bg-brand-500/15 text-brand-500 shadow-[0_0_15px_-5px_rgba(99,102,241,0.6)]"
          : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
        disabled &&
          "cursor-not-allowed opacity-40 hover:border-zinc-800 hover:text-zinc-400"
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function ActiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.74 9.74 0 0 0-7 3" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  );
}
