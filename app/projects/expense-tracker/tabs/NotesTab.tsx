"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../../lib/authContext";
import { formatMoney } from "../../../../modules/expense-tracker/currencies";
import { cn, formatDay } from "../../../../lib/utils";
import { showAlert, confirmDialog } from "../dialog";
import type { KnownPerson } from "../types";

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
  /** Set when the note is linked to a real Splitzy account. */
  linkedUserId?: string | null;
  linkedName?: string | null;
  linkedEmail?: string | null;
  /** Written by someone else about the viewer. The server has already flipped
   *  it: direction is from the viewer's side, personName is the other person. */
  mirrored?: boolean;
  ownerName?: string | null;
  remindedAt?: string | null;
};

const REMIND_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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

const shortDate = (iso: string) => formatDay(iso, { day: "numeric", month: "short" });

export function NotesTab() {
  const { authFetch } = useAuth();
  const [view, setView] = useState<"notes" | "todos">("notes");
  const [notes, setNotes] = useState<MoneyNote[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // note form — editingId set means the form is editing that note
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"lent" | "borrowed">("lent");
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [givenOn, setGivenOn] = useState(todayLocal());
  const [dueBy, setDueBy] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  // Optional link to a real Splitzy account. originalLinkedEmail remembers what
  // the note had when the edit opened, so clearing it can be sent as null.
  const [linkedEmail, setLinkedEmail] = useState("");
  const [originalLinkedEmail, setOriginalLinkedEmail] = useState("");
  const [people, setPeople] = useState<KnownPerson[]>([]);
  const [linkFocused, setLinkFocused] = useState(false);
  const peopleRequested = useRef(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);

  // todo form
  const [todoText, setTodoText] = useState("");
  const [addingTodo, setAddingTodo] = useState(false);
  // inline to-do editor — one row at a time
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editTodoText, setEditTodoText] = useState("");
  const [editTodoDue, setEditTodoDue] = useState("");
  const [savingTodo, setSavingTodo] = useState(false);

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

  // People the viewer already shares a group with — fetched once, the first
  // time the note form opens. Suggestions are a convenience, so a failure is
  // silent: the field still takes any address typed by hand.
  useEffect(() => {
    if (!showAdd || peopleRequested.current) return;
    peopleRequested.current = true;
    (async () => {
      try {
        const res = await authFetch("/api/projects/expense-tracker/people");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          peopleRequested.current = false; // let the next open retry
          return;
        }
        setPeople(Array.isArray(data.people) ? data.people : []);
      } catch {
        peopleRequested.current = false;
      }
    })();
  }, [showAdd, authFetch]);

  // Matching on name and address, capped so the list stays short.
  const linkSuggestions = useMemo(() => {
    const q = linkedEmail.trim().toLowerCase();
    const pool = q
      ? people.filter(
          (p) =>
            p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
        )
      : people;
    return pool.slice(0, 6);
  }, [people, linkedEmail]);

  function resetNoteForm() {
    setEditingId(null);
    setDirection("lent");
    setPersonName("");
    setAmount("");
    setDescription("");
    setGivenOn(todayLocal());
    setDueBy("");
    setLinkedEmail("");
    setOriginalLinkedEmail("");
  }

  function openEditNote(n: MoneyNote) {
    if (n.mirrored) return; // someone else's note — read-only here
    setLinkedEmail(n.linkedEmail ?? "");
    setOriginalLinkedEmail(n.linkedEmail ?? "");
    setEditingId(n._id);
    setDirection(n.direction);
    setPersonName(n.personName);
    setAmount(String(n.amount));
    setDescription(n.description ?? "");
    setGivenOn(n.givenOn.slice(0, 10));
    setDueBy(n.dueBy ? n.dueBy.slice(0, 10) : "");
    setShowAdd(true);
  }

  async function addNote() {
    if (savingNote) return;
    const amt = parseFloat(amount);
    if (!personName.trim()) return showAlert("Who was the money given to?");
    if (!Number.isFinite(amt) || amt <= 0) return showAlert("Enter an amount greater than 0");
    // linkedEmail: the address when there is one; null only when an edit
    // cleared an existing link; otherwise left out of the body entirely.
    const email = linkedEmail.trim();
    const link: { linkedEmail?: string | null } = email
      ? { linkedEmail: email }
      : editingId && originalLinkedEmail
      ? { linkedEmail: null }
      : {};
    setSavingNote(true);
    try {
      const res = await authFetch(
        editingId
          ? `/api/projects/expense-tracker/notes/${editingId}`
          : "/api/projects/expense-tracker/notes",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            direction,
            personName: personName.trim(),
            amount: amt,
            description: description.trim(),
            givenOn,
            dueBy: dueBy || null,
            ...link,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showAlert(data.error ?? `Couldn't save the note (HTTP ${res.status})`);
        return;
      }
      resetNoteForm();
      setShowAdd(false);
      load();
    } catch {
      showAlert("Network error — note not saved.");
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
      if (!res.ok) showAlert("Couldn't update the note");
      await load();
    } catch {
      showAlert("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteNote(id: string) {
    if (busyId) return;
    if (!await confirmDialog("Delete this money note?")) return;
    setBusyId(id);
    try {
      const res = await authFetch(`/api/projects/expense-tracker/notes/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) showAlert("Couldn't delete the note");
      await load();
    } catch {
      showAlert("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  async function remindNote(n: MoneyNote) {
    if (busyId || remindingId) return;
    setRemindingId(n._id);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/notes/${n._id}/remind`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert(data.error ?? `Couldn't send the reminder (HTTP ${res.status})`);
        return;
      }
      showAlert(`${n.personName} has been nudged.`, "Reminder sent");
      await load();
    } catch {
      showAlert("Network error — reminder not sent.");
    } finally {
      setRemindingId(null);
    }
  }

  // Mirrored notes belong to whoever wrote them — the viewer can only take
  // one off their own list.
  async function hideNote(n: MoneyNote) {
    if (busyId) return;
    const owner = n.ownerName || n.personName;
    if (
      !(await confirmDialog(
        `It disappears from your list. ${owner} keeps their copy.`,
        { title: "Hide this note?", confirmText: "Hide" }
      ))
    )
      return;
    setBusyId(n._id);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/notes/${n._id}/hide`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert(data.error ?? `Couldn't hide the note (HTTP ${res.status})`);
        return;
      }
      await load();
    } catch {
      showAlert("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  function openEditTodo(t: TodoItem) {
    setEditingTodoId(t._id);
    setEditTodoText(t.text);
    setEditTodoDue(t.dueDate ? t.dueDate.slice(0, 10) : "");
  }

  function cancelEditTodo() {
    setEditingTodoId(null);
    setEditTodoText("");
    setEditTodoDue("");
  }

  async function saveTodo() {
    if (!editingTodoId || savingTodo) return;
    const text = editTodoText.trim();
    if (!text) return; // an empty to-do is not a to-do
    setSavingTodo(true);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/todos/${editingTodoId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, dueDate: editTodoDue || null }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert(data.error ?? `Couldn't save the to-do (HTTP ${res.status})`);
        return;
      }
      cancelEditTodo();
      await load();
    } catch {
      showAlert("Network error — to-do not saved.");
    } finally {
      setSavingTodo(false);
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
        showAlert(data.error ?? "Failed to add");
        return;
      }
      setTodoText("");
      load();
    } catch {
      showAlert("Network error — to-do not added.");
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
      showAlert("Network error.");
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
      showAlert("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  const openNotes = notes.filter((n) => !n.settledAt);
  const settledNotes = notes.filter((n) => n.settledAt);
  // Notes are recorded in whatever currency the money changed hands in, and
  // there is no conversion here — adding them into one number and labelling
  // it with the first note's currency invented a figure. Total per currency
  // instead; single-currency users see exactly what they saw before.
  const totalsByCurrency = (direction: "lent" | "borrowed") => {
    const by = new Map<string, number>();
    for (const n of openNotes) {
      if (n.direction !== direction) continue;
      const c = n.currency || "INR";
      by.set(c, (by.get(c) ?? 0) + n.amount);
    }
    return [...by.entries()].sort((a, b) => b[1] - a[1]);
  };
  const outstandingLent = totalsByCurrency("lent");
  const outstandingBorrowed = totalsByCurrency("borrowed");

  if (loading) {
    return <div className="py-16 text-center text-sm text-zinc-500">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Section switcher */}
      <div className="flex w-full max-w-xs gap-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-1">
        {(
          [
            ["notes", "Money notes"],
            ["todos", "To-dos"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-sm font-semibold",
              view === v ? "bg-brand-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "notes" && (
      <>
      {/* ── Money notes ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Money notes</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Informal loans — who you gave money to, and when they promised to return it.
          </p>
        </div>
        <button
          onClick={() => {
            // Always open a blank form — reusing a half-finished edit here
            // would silently PATCH the wrong note.
            if (showAdd) { setShowAdd(false); setEditingId(null); }
            else { resetNoteForm(); setShowAdd(true); }
          }}
          className="rounded-lg border border-brand-500/40 bg-brand-500/15 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-500/25"
        >
          {showAdd ? "Close" : "+ New note"}
        </button>
      </div>

      {(outstandingLent.length > 0 || outstandingBorrowed.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {outstandingLent.length > 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-2.5 text-sm">
              <span className="text-zinc-400">Owed to you: </span>
              <span className="font-semibold text-emerald-400">
                {outstandingLent.map(([c, v]) => formatMoney(v, c)).join(" + ")}
              </span>
            </div>
          )}
          {outstandingBorrowed.length > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-2.5 text-sm">
              <span className="text-zinc-400">You owe: </span>
              <span className="font-semibold text-red-400">
                {outstandingBorrowed.map(([c, v]) => formatMoney(v, c)).join(" + ")}
              </span>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-100">
            {editingId ? "Edit money note" : "New money note"}
          </h3>
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
            <div className="sm:col-span-2">
              <label htmlFor="note-linked-email" className="text-xs text-zinc-500">
                Link to a Splitzy user (optional)
              </label>
              <input
                id="note-linked-email"
                type="email"
                autoComplete="off"
                value={linkedEmail}
                onChange={(e) => setLinkedEmail(e.target.value)}
                placeholder="their@email.com"
                onFocus={() => setLinkFocused(true)}
                // Delayed so a click on a suggestion registers before the list
                // unmounts — otherwise blur removes it mid-click.
                onBlur={() => setTimeout(() => setLinkFocused(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && linkFocused && linkSuggestions.length > 0) {
                    e.stopPropagation();
                    setLinkFocused(false);
                  }
                }}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-brand-500 focus:outline-none"
              />
              {/* Suggestions narrow as you type, so the field still accepts an
                  address nobody in your groups has. */}
              {linkFocused && linkSuggestions.length > 0 && (
                <div className="mt-1 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/90">
                  {linkSuggestions.map((p, i) => (
                    <button
                      key={p.userId}
                      type="button"
                      onClick={() => {
                        setLinkedEmail(p.email);
                        if (!personName.trim()) setPersonName(p.name);
                        setLinkFocused(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-brand-500/10",
                        i > 0 && "border-t border-zinc-800/60"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs text-zinc-200">{p.name}</span>
                        <span className="block truncate text-[10px] text-zinc-500">
                          {p.email}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[11px] text-zinc-500">
                They&apos;ll see this note in their own list and can be reminded.
              </p>
            </div>
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
              reminding={remindingId === n._id}
              onSettle={() => toggleSettled(n)}
              onEdit={() => openEditNote(n)}
              onDelete={() => deleteNote(n._id)}
              onRemind={() => remindNote(n)}
              onHide={() => hideNote(n)}
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
                  reminding={remindingId === n._id}
                  onSettle={() => toggleSettled(n)}
                  onEdit={() => openEditNote(n)}
                  onDelete={() => deleteNote(n._id)}
                  onRemind={() => remindNote(n)}
                  onHide={() => hideNote(n)}
                />
              ))}
            </>
          )}
        </div>
      )}

      </>
      )}

      {view === "todos" && (
      <>
      {/* ── To-dos ── */}
      <div>
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
          {todos.map((t) =>
            editingTodoId === t._id ? (
            <div
              key={t._id}
              className="flex flex-col gap-2 rounded-lg border border-brand-500/40 bg-zinc-900/40 px-3 py-2.5"
              onKeyDown={(e) => {
                // Enter saves from the fields only — on Cancel / Clear it must
                // stay that button's own click.
                if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
                  e.preventDefault();
                  saveTodo();
                }
                if (e.key === "Escape") cancelEditTodo();
              }}
            >
              <input
                autoFocus
                value={editTodoText}
                onChange={(e) => setEditTodoText(e.target.value)}
                maxLength={300}
                aria-label="To-do text"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-brand-500 focus:outline-none"
              />
              <div className="flex flex-wrap items-end justify-between gap-2">
                <label className="text-xs text-zinc-500">
                  Due date (optional)
                  <span className="mt-1 flex items-center gap-2">
                    <input
                      type="date"
                      value={editTodoDue}
                      onChange={(e) => setEditTodoDue(e.target.value)}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-sm text-zinc-200 focus:border-brand-500 focus:outline-none"
                    />
                    {editTodoDue && (
                      <button
                        type="button"
                        onClick={() => setEditTodoDue("")}
                        className="text-[11px] font-medium text-zinc-500 hover:text-zinc-300"
                      >
                        Clear
                      </button>
                    )}
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelEditTodo}
                    disabled={savingTodo}
                    className="rounded-md border border-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveTodo}
                    disabled={savingTodo || !editTodoText.trim()}
                    className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                  >
                    {savingTodo ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
            ) : (
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
                {t.dueDate && (
                  <span className="ml-2 whitespace-nowrap text-[11px] text-zinc-500">
                    due {shortDate(t.dueDate)}
                  </span>
                )}
              </span>
              <button
                onClick={() => openEditTodo(t)}
                disabled={busyId !== null || savingTodo}
                className="rounded-md border border-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:border-brand-500/40 hover:text-brand-300 disabled:opacity-50"
              >
                Edit
              </button>
              <button
                onClick={() => deleteTodo(t._id)}
                disabled={busyId !== null}
                className="text-zinc-600 transition-colors hover:text-red-400"
              >
                ✕
              </button>
            </div>
            )
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}

function NoteRow({
  n,
  busy,
  reminding,
  onSettle,
  onEdit,
  onDelete,
  onRemind,
  onHide,
}: {
  n: MoneyNote;
  busy: boolean;
  reminding: boolean;
  onSettle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRemind: () => void;
  onHide: () => void;
}) {
  const lent = n.direction === "lent";
  const mirrored = n.mirrored === true;
  // Only your own open loans to a real account can be nudged.
  const canRemind = !mirrored && lent && !n.settledAt && !!n.linkedUserId;
  const remindedRecently =
    !!n.remindedAt &&
    Date.now() - new Date(n.remindedAt).getTime() < REMIND_COOLDOWN_MS;
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
            {!mirrored && n.linkedUserId && (
              <span
                title={n.linkedEmail ?? undefined}
                className="inline-flex items-center gap-1 rounded-full border border-brand-500/40 bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-300"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-2.5 w-2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
                  <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
                </svg>
                on Splitzy
              </span>
            )}
            {mirrored && (
              <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                Added by {n.ownerName || n.personName}
              </span>
            )}
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
        {mirrored ? (
          // Someone else's note about you: nothing here can change it, only
          // take it off your own list.
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onHide}
              disabled={busy}
              className="rounded-md border border-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-50"
            >
              {busy ? "…" : "Hide"}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0 sm:flex-nowrap">
            {canRemind && (
              <button
                onClick={onRemind}
                disabled={busy || reminding || remindedRecently}
                title={remindedRecently ? "Already reminded in the last 24 hours" : undefined}
                className={cn(
                  "rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50",
                  remindedRecently && "cursor-not-allowed"
                )}
              >
                {reminding ? "…" : remindedRecently ? "Reminded" : "Remind"}
              </button>
            )}
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
              onClick={onEdit}
              disabled={busy}
              className="rounded-md border border-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:border-brand-500/40 hover:text-brand-300 disabled:opacity-50"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              disabled={busy}
              className="text-zinc-600 transition-colors hover:text-red-400"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
