"use client";

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/authContext";
import { CATEGORIES } from "@/modules/expense-tracker/schemas";

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isEdit ? "Edit Expense" : "Add Expense"}</h2>
          <button
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-300"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex gap-2">
            {(["personal", "group"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium capitalize",
                  type === t
                    ? "border-brand-500 bg-brand-500/10 text-brand-500"
                    : "border-zinc-800 text-zinc-400"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {type === "group" && (
            <>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
              >
                <option value="">Select group...</option>
                {groups.map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.name} ({g.members.length} members)
                  </option>
                ))}
              </select>

              {selectedGroup && (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
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
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
                    >
                      {selectedGroup.members.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Split among (uncheck absent members)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {selectedGroup.members
                        .filter((m) => m.isActive)
                        .map((m) => (
                          <label
                            key={m.userId}
                            className={cn(
                              "flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs",
                              presentMembers.has(m.userId)
                                ? "border-brand-500 bg-brand-500/10 text-brand-500"
                                : "border-zinc-800 text-zinc-500"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={presentMembers.has(m.userId)}
                              onChange={() => toggleMember(m.userId)}
                              className="sr-only"
                            />
                            {m.name}
                          </label>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {type === "personal" && (
            <input
              type="text"
              value={paidByName}
              onChange={(e) => setPaidByName(e.target.value)}
              placeholder="Your name (optional)"
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Amount</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
              />
            </div>
          </div>

          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (e.g. Groceries)"
            required
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <div className="rounded-lg border border-dashed border-zinc-700 p-3 text-center">
            <label className="cursor-pointer text-xs text-brand-500 hover:underline">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleScan}
                disabled={scanning}
              />
              {scanning
                ? "Scanning receipt..."
                : "Upload receipt image (auto-fill with AI)"}
            </label>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !amount || !description}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : isEdit ? "Update Expense" : "Save Expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
