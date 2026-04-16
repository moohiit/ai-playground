"use client";

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../../../lib/utils";
import { useAuth } from "../../../../lib/authContext";
import { CATEGORIES } from "../../../../modules/expense-tracker/schemas";

type Group = {
  _id: string;
  name: string;
  members: { userId: string; name: string; email: string; isActive: boolean }[];
};

type EditExpense = {
  _id: string;
  type: "personal" | "group";
  groupId?: string;
  paidBy: { id: string; name: string };
  amount: number;
  description: string;
  category: string;
  date: string;
  splitAmong?: { memberId: string; name: string }[];
};

type Props = {
  onClose: () => void;
  onSaved: () => void;
  preselectedGroupId?: string;
  editExpense?: EditExpense;
};

export function AddExpenseModal({ onClose, onSaved, preselectedGroupId, editExpense }: Props) {
  const { authFetch, user } = useAuth();
  const isEdit = !!editExpense;
  const [type, setType] = useState<"personal" | "group">(
    editExpense?.type ?? (preselectedGroupId ? "group" : "personal")
  );
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState(editExpense?.groupId ?? preselectedGroupId ?? "");
  const [paidByName, setPaidByName] = useState(editExpense?.paidBy?.name ?? "");
  const [paidById, setPaidById] = useState(editExpense?.paidBy?.id ?? user?.userId ?? "");
  const [amount, setAmount] = useState(editExpense ? String(editExpense.amount) : "");
  const [description, setDescription] = useState(editExpense?.description ?? "");
  const [category, setCategory] = useState(editExpense?.category ?? CATEGORIES[0]);
  const [date, setDate] = useState(
    editExpense ? new Date(editExpense.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [presentMembers, setPresentMembers] = useState<Set<string>>(
    () => new Set(editExpense?.splitAmong?.map((m) => m.memberId) ?? [])
  );
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch("/api/projects/expense-tracker/groups")
      .then((r) => r.json())
      .then((d) => setGroups(d.groups ?? []));
  }, []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const selectedGroup = groups.find((g) => g._id === groupId);

  useEffect(() => {
    if (selectedGroup) {
      if (!isEdit || presentMembers.size === 0) {
        const ids = new Set(
          selectedGroup.members.filter((m) => m.isActive).map((m) => m.userId)
        );
        setPresentMembers(ids);
      }
      if (!paidById && selectedGroup.members.length > 0) {
        setPaidById(selectedGroup.members[0].userId);
        setPaidByName(selectedGroup.members[0].name);
      }
    }
  }, [selectedGroup]);

  function toggleMember(id: string) {
    setPresentMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleScan(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await authFetch("/api/projects/expense-tracker/scan", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      const r = data.result;
      setAmount(String(r.total));
      setDescription(r.vendor);
      setCategory(r.category);
      if (r.date) setDate(r.date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const splitAmong =
        type === "group" && selectedGroup
          ? selectedGroup.members
              .filter((m) => presentMembers.has(m.userId))
              .map((m) => ({ memberId: m.userId, name: m.name }))
          : undefined;

      const payer =
        type === "group" && selectedGroup
          ? {
              id: paidById,
              name:
                selectedGroup.members.find((m) => m.userId === paidById)?.name ??
                paidByName,
            }
          : { id: user?.userId, name: user?.name || paidByName || "Me" };

      const url = isEdit
        ? `/api/projects/expense-tracker/expenses/${editExpense._id}`
        : "/api/projects/expense-tracker/expenses";

      const res = await authFetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          groupId: type === "group" ? groupId : undefined,
          paidBy: payer,
          amount: parseFloat(amount),
          description,
          category,
          date,
          splitAmong,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950 shadow-2xl shadow-brand-500/10"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent" />

        <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/95 px-6 py-4 backdrop-blur">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-brand-500/90">
              {isEdit ? "Update" : "Quick add"}
            </div>
            <h2 className="text-lg font-semibold text-zinc-100">
              {isEdit ? "Edit Expense" : "Add Expense"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form
          id="expense-form"
          onSubmit={handleSubmit}
          className="max-h-[calc(100vh-15rem)] overflow-y-auto px-6 py-5"
        >
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              {(["personal", "group"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-all",
                    type === t
                      ? "border-brand-500/60 bg-brand-500/15 text-brand-500 shadow-[0_0_20px_-5px_rgba(99,102,241,0.5)]"
                      : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {type === "group" && (
              <>
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
                    Group
                  </label>
                  <select
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  >
                    <option value="">Select group...</option>
                    {groups.map((g) => (
                      <option key={g._id} value={g._id}>
                        {g.name} ({g.members.length} members)
                      </option>
                    ))}
                  </select>
                </div>

                {selectedGroup && (
                  <>
                    <div>
                      <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
                        Paid by
                      </label>
                      <select
                        value={paidById}
                        onChange={(e) => {
                          setPaidById(e.target.value);
                          setPaidByName(
                            selectedGroup.members.find(
                              (m) => m.userId === e.target.value
                            )?.name ?? ""
                          );
                        }}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      >
                        {selectedGroup.members.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
                        Split among
                        <span className="ml-1 normal-case text-zinc-600">
                          (uncheck absent members)
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {selectedGroup.members
                          .filter((m) => m.isActive)
                          .map((m) => {
                            const on = presentMembers.has(m.userId);
                            return (
                              <label
                                key={m.userId}
                                className={cn(
                                  "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-all",
                                  on
                                    ? "border-brand-500/60 bg-brand-500/15 text-brand-500"
                                    : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => toggleMember(m.userId)}
                                  className="sr-only"
                                />
                                <span
                                  className={cn(
                                    "inline-flex h-3 w-3 items-center justify-center rounded-sm border",
                                    on
                                      ? "border-brand-500 bg-brand-500 text-white"
                                      : "border-zinc-600"
                                  )}
                                >
                                  {on && (
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M20 6 9 17l-5-5" />
                                    </svg>
                                  )}
                                </span>
                                {m.name}
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {type === "personal" && (
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
                  Your name <span className="normal-case text-zinc-600">(optional)</span>
                </label>
                <input
                  type="text"
                  value={paidByName}
                  onChange={(e) => setPaidByName(e.target.value)}
                  placeholder="e.g. Mohit"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
                  Amount
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 pl-7 text-sm text-zinc-200 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Groceries"
                required
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <label
              className={cn(
                "group relative flex cursor-pointer flex-col items-center gap-2 overflow-hidden rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 p-4 text-center transition-colors hover:border-brand-500/60 hover:bg-brand-500/5",
                scanning && "pointer-events-none opacity-70"
              )}
            >
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleScan}
                disabled={scanning}
              />
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500 ring-1 ring-brand-500/30 transition-transform group-hover:scale-110">
                {scanning ? (
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                )}
              </div>
              <div className="text-xs font-medium text-zinc-300">
                {scanning ? "Scanning receipt..." : "Upload receipt image"}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Auto-fill with Gemini Vision
              </div>
            </label>

            {error && (
              <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400">
                {error}
              </p>
            )}
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 border-t border-zinc-800/80 bg-zinc-950/95 px-6 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="expense-form"
            disabled={saving || !amount || !description}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-brand-600 via-brand-500 to-fuchsia-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className="relative">
              {saving ? "Saving..." : isEdit ? "Update Expense" : "Save Expense"}
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
