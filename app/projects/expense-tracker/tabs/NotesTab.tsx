"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../../lib/authContext";
import { formatMoney } from "../../../../modules/expense-tracker/currencies";
import { cn } from "../../../../lib/utils";

type MoneyNote = {
  _id: string;
  direction: "lent" | "borrowed";
  personName: string;
  amount: number;
  currency: string;
  description: string;
  givenOn: string;
  dueBy: string | null;
  settledAt: string | null;
  overdue: boolean;
};

type TodoItem = {
  _id: string;
  text: string;
  done: boolean;
  dueDate: string | null;
};

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function NotesTab() {
  const { authFetch } = useAuth();
  const [notes, setNotes] = useState<MoneyNote[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // note form
  const [showAdd, setShowAdd] = useState(false);
  const [direction, setDirection] = useState<"lent" | "borrowed">("lent");
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [givenOn, setGivenOn] = useState(todayLocal());
  const [dueBy, setDueBy] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // todo form
  const [todoText, setTodoText] = useState("");
  const [addingTodo, setAddingTodo] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nRes, tRes] = await Promise.all([
        authFetch("/api/projects/expense-tracker/notes"),
        authFetch("/api/projects/expense-tracker/todos"),
      ]);
      const nData = await nRes.json().catch(() => ({}));
      const tData = await tRes.json().catch(() => ({}));
      setNotes(nData.notes ?? []);
      setTodos(tData.todos ?? []);
    } catch {
      // keep last state
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function addNote() {
    if (savingNote) return;
    const amt = parseFloat(amount);
    if (!personName.trim()) return alert("Who was the money given to?");
    if (!Number.isFinite(amt) || amt <= 0) return alert("Enter an amount greater than 0");
    setSavingNote(true);
    try {
      const res = await authFetch("/api/projects/expense-tracker/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          personName: personName.trim(),
          amount: amt,
          description: description.trim(),
          givenOn,
          dueBy: dueBy || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to save note");
        return;
      }
      setPersonName("");
      setAmount("");
      setDescription("");
      setDueBy("");
      setGivenOn(todayLocal());
      setShowAdd(false);
      load();
    } catch {
      alert("Network error — note not saved.");
    } finally {
      setSavingNote(false);
    }
  }

  async function toggleSettled(n: MoneyNote) {
    if (busyId) return;
    setBusyId(n._id);
    try {
      const res = await authFetch(`/api/projects/expense-tracker/notes/${n._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settled: !n.settledAt }),
      });
      if (!res.ok) alert("Couldn't update the note");
      await load();
    } catch {
      alert("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteNote(id: string) {
    if (busyId) return;
    if (!confirm("Delete this money note?")) return;
    setBusyId(id);
    try {
      const res = await authFetch(`/api/projects/expense-tracker/notes/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) alert("Couldn't delete the note");
      await load();
    } catch {
      alert("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  async function addTodo() {
    if (addingTodo) return;
    const text = todoText.trim();
    if (!text) return;
    setAddingTodo(true);
    try {
      const res = await authFetch("/api/projects/expense-tracker/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to add");
        return;
      }
      setTodoText("");
      load();
    } catch {
      alert("Network error — to-do not added.");
    } finally {
      setAddingTodo(false);
    }
  }

  async function toggleTodo(t: TodoItem) {
    if (busyId) return;
    setBusyId(t._id);
    try {
      await authFetch(`/api/projects/expense-tracker/todos/${t._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !t.done }),
      });
      await load();
    } catch {
      alert("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTodo(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await authFetch(`/api/projects/expense-tracker/todos/${id}`, {
        method: "DELETE",
      });
      await load();
    } catch {
      alert("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  const openNotes = notes.filter((n) => !n.settledAt);
  const settledNotes = notes.filter((n) => n.settledAt);
  const outstandingLent = openNotes
    .filter((n) => n.direction === "lent")
    .reduce((s, n) => s + n.amount, 0);
  const outstandingBorrowed = openNotes
    .filter((n) => n.direction === "borrowed")
    .reduce((s, n) => s + n.amount, 0);
  const noteCur = openNotes[0]?.currency ?? notes[0]?.currency ?? "INR";

  if (loading) {
    return <div className="py-16 text-center text-sm text-zinc-500">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Money notes ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Money notes</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Informal loans — who you gave money to, and when they promised to return it.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-lg border border-brand-500/40 bg-brand-500/15 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-500/25"
        >
          {showAdd ? "Close" : "+ New note"}
        </button>
      </div>

      {(outstandingLent > 0 || outstandingBorrowed > 0) && (
        <div className="flex flex-wrap gap-3">
          {outstandingLent > 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-2.5 text-sm">
              <span className="text-zinc-400">Owed to you: </span>
              <span className="font-semibold text-emerald-400">
                {formatMoney(outstandingLent, noteCur)}
              </span>
            </div>
          )}
          {outstandingBorrowed > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-2.5 text-sm">
              <span className="text-zinc-400">You owe: </span>
              <span className="font-semibold text-red-400">
                {formatMoney(outstandingBorrowed, noteCur)}
              </span>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <div className="mb-3 flex gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 p-1">
            {(
              [
                ["lent", "I gave money"],
                ["borrowed", "I took money"],
              ] as const
            ).map(([d, label]) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-sm font-medium",
                  direction === d ? "bg-brand-600 text-white" : "text-zinc-400"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              placeholder={direction === "lent" ? "Given to (name)" : "Taken from (name)"}
              className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-brand-500 focus:outline-none"
            />
            <input
              type="number"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-brand-500 focus:outline-none"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What for? (e.g. concert tickets)"
              className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-brand-500 focus:outline-none sm:col-span-2"
            />
            <label className="text-xs text-zinc-500">
              Given on
              <input
                type="date"
                value={givenOn}
                onChange={(e) => setGivenOn(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="text-xs text-zinc-500">
              Promised return by (optional)
              <input
                type="date"
                value={dueBy}
                onChange={(e) => setDueBy(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 focus:border-brand-500 focus:outline-none"
              />
            </label>
          </div>
          <button
            onClick={addNote}
            disabled={savingNote}
            className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {savingNote ? "Saving…" : "Save note"}
          </button>
        </div>
      )}

      {openNotes.length === 0 && settledNotes.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 py-10 text-center text-sm text-zinc-500">
          No money notes yet — track money you've lent or borrowed informally.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {openNotes.map((n) => (
            <NoteRow
              key={n._id}
              n={n}
              busy={busyId === n._id}
              onSettle={() => toggleSettled(n)}
              onDelete={() => deleteNote(n._id)}
            />
          ))}
          {settledNotes.length > 0 && (
            <>
              <div className="mt-2 text-[11px] uppercase tracking-wider text-zinc-600">
                Settled
              </div>
              {settledNotes.map((n) => (
                <NoteRow
                  key={n._id}
                  n={n}
                  busy={busyId === n._id}
                  onSettle={() => toggleSettled(n)}
                  onDelete={() => deleteNote(n._id)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* ── To-dos ── */}
      <div className="mt-2">
        <h2 className="text-lg font-semibold text-zinc-100">To-do list</h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          Money chores — bills to pay, people to remind.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={todoText}
          onChange={(e) => setTodoText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTodo()}
          placeholder="e.g. Remind Rahul about the ₹2,000"
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-brand-500 focus:outline-none"
        />
        <button
          onClick={addTodo}
          disabled={addingTodo || !todoText.trim()}
          className="rounded-lg border border-brand-500/40 bg-brand-500/10 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-500/20 disabled:opacity-50"
        >
          {addingTodo ? "…" : "Add"}
        </button>
      </div>

      {todos.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 py-8 text-center text-sm text-zinc-500">
          Nothing to do — nice.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {todos.map((t) => (
            <div
              key={t._id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                t.done
                  ? "border-zinc-800/60 bg-zinc-950/30 opacity-60"
                  : "border-zinc-800 bg-zinc-900/40"
              )}
            >
              <button
                onClick={() => toggleTodo(t)}
                disabled={busyId !== null}
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px]",
                  t.done
                    ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-400"
                    : "border-zinc-700 text-transparent hover:border-brand-500"
                )}
              >
                ✓
              </button>
              <span
                className={cn(
                  "flex-1 text-sm",
                  t.done ? "text-zinc-500 line-through" : "text-zinc-200"
                )}
              >
                {t.text}
              </span>
              <button
                onClick={() => deleteTodo(t._id)}
                disabled={busyId !== null}
                className="text-zinc-600 transition-colors hover:text-red-400"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteRow({
  n,
  busy,
  onSettle,
  onDelete,
}: {
  n: MoneyNote;
  busy: boolean;
  onSettle: () => void;
  onDelete: () => void;
}) {
  const lent = n.direction === "lent";
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        n.settledAt
          ? "border-zinc-800/60 bg-zinc-950/30 opacity-70"
          : n.overdue
          ? "border-red-500/40 bg-red-500/[0.05]"
          : lent
          ? "border-emerald-500/20 bg-emerald-500/[0.03]"
          : "border-red-500/20 bg-red-500/[0.03]"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-zinc-100">{n.personName}</span>
            <span className={lent ? "text-emerald-400" : "text-red-400"}>
              {lent ? "owes you" : "you owe"} {formatMoney(n.amount, n.currency)}
            </span>
            {n.overdue && (
              <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-400">
                overdue
              </span>
            )}
            {n.settledAt && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-400">
                settled {shortDate(n.settledAt)}
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {n.description && <>{n.description} · </>}
            given {shortDate(n.givenOn)}
            {n.dueBy && <> · promised by {shortDate(n.dueBy)}</>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onSettle}
            disabled={busy}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50",
              n.settledAt
                ? "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
            )}
          >
            {busy ? "…" : n.settledAt ? "Reopen" : lent ? "Mark returned" : "Mark repaid"}
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            className="text-zinc-600 transition-colors hover:text-red-400"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
