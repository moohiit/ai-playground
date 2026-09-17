import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { showAlert } from "../../lib/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth";
import { formatDay, localISODate } from "../../lib/dates";
import { formatMoney, parseAmount } from "../../lib/currency";
import {
  AppBackground,
  GradientButton,
  Input,
  KeyboardAwareScreen,
} from "../../components/ui";
import type { KnownPerson, MoneyNote } from "../../lib/types";

type TodoItem = {
  _id: string;
  text: string;
  done: boolean;
  dueDate: string | null;
};

const shortDate = (iso: string) => formatDay(iso, { day: "numeric", month: "short" });

const DAY_MS = 24 * 60 * 60 * 1000;
// The server refuses a second nudge inside 24h; mirror that so the button
// reads "Reminded" instead of failing on press.
const remindedRecently = (n: MoneyNote) => {
  if (!n.remindedAt) return false;
  const at = Date.parse(n.remindedAt);
  return !Number.isNaN(at) && Date.now() - at < DAY_MS;
};

export default function NotesScreen() {
  const { authFetch } = useAuth();
  const [view, setView] = useState<"notes" | "todos">("notes");
  const [notes, setNotes] = useState<MoneyNote[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // add/edit-note sheet — editingId set means the sheet is editing that note
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"lent" | "borrowed">("lent");
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [givenOn, setGivenOn] = useState(localISODate(new Date()));
  const [dueBy, setDueBy] = useState("");
  const [picker, setPicker] = useState<"given" | "due" | null>(null);
  const [saving, setSaving] = useState(false);
  // Optional link to a Splitzy account. `linkedBefore` is what the note had
  // when the editor opened, so clearing the field can be sent as null.
  const [linkedEmail, setLinkedEmail] = useState("");
  const [linkedBefore, setLinkedBefore] = useState("");
  const [linkFocused, setLinkFocused] = useState(false);
  const [people, setPeople] = useState<KnownPerson[]>([]);
  const peopleRequested = useRef(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);

  // todo input
  const [todoText, setTodoText] = useState("");
  const [addingTodo, setAddingTodo] = useState(false);
  // inline to-do editor — one row at a time
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editTodoText, setEditTodoText] = useState("");
  const [editTodoDue, setEditTodoDue] = useState("");
  const [todoPicker, setTodoPicker] = useState(false);
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
    }
  }, [authFetch]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setDirection("lent");
    setPersonName("");
    setAmount("");
    setDescription("");
    setGivenOn(localISODate(new Date()));
    setDueBy("");
    setLinkedEmail("");
    setLinkedBefore("");
    setLinkFocused(false);
  }

  // Suggestions for the link field. Fetched the first time the sheet opens;
  // a failure just means no suggestions, and the next open tries again.
  async function loadPeople() {
    if (peopleRequested.current) return;
    peopleRequested.current = true;
    try {
      const res = await authFetch("/api/projects/expense-tracker/people");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        peopleRequested.current = false;
        return;
      }
      setPeople(Array.isArray(data.people) ? data.people : []);
    } catch {
      peopleRequested.current = false;
    }
  }

  function openAdd() {
    resetForm();
    setShowAdd(true);
    loadPeople();
  }

  function openEdit(n: MoneyNote) {
    // Someone else's note about you — theirs to change, not yours.
    if (n.mirrored) return;
    const linked = n.linkedEmail ?? "";
    setLinkedEmail(linked);
    setLinkedBefore(linked);
    setLinkFocused(false);
    loadPeople();
    setEditingId(n._id);
    setDirection(n.direction);
    setPersonName(n.personName);
    setAmount(String(n.amount));
    setDescription(n.description ?? "");
    setGivenOn(n.givenOn.slice(0, 10));
    setDueBy(n.dueBy ? n.dueBy.slice(0, 10) : "");
    setShowAdd(true);
  }

  async function saveNote() {
    if (saving) return;
    const amt = parseAmount(amount);
    if (!personName.trim()) return showAlert("Who was the money given to?");
    if (!amt || amt <= 0) return showAlert("Enter a valid amount");
    const email = linkedEmail.trim();
    const body: Record<string, unknown> = {
      direction,
      personName: personName.trim(),
      amount: amt,
      description: description.trim(),
      givenOn,
      dueBy: dueBy || null,
    };
    if (!editingId) {
      if (email) body.linkedEmail = email;
    } else if (email.toLowerCase() !== linkedBefore.trim().toLowerCase()) {
      // PATCH: only when the link actually changed; null unlinks.
      body.linkedEmail = email || null;
    }
    setSaving(true);
    try {
      const res = await authFetch(
        editingId
          ? `/api/projects/expense-tracker/notes/${editingId}`
          : "/api/projects/expense-tracker/notes",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert(
          "Error",
          data.error ?? `Couldn't save the note (HTTP ${res.status})`
        );
        return;
      }
      resetForm();
      setShowAdd(false);
      load();
    } catch {
      showAlert("Error", "Network error — note not saved.");
    } finally {
      setSaving(false);
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
      if (!res.ok) showAlert("Error", "Couldn't update the note");
      await load();
    } catch {
      showAlert("Error", "Network error.");
    } finally {
      setBusyId(null);
    }
  }

  function confirmDeleteNote(n: MoneyNote) {
    showAlert("Delete note", `Delete the note for ${n.personName}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await authFetch(
              `/api/projects/expense-tracker/notes/${n._id}`,
              { method: "DELETE" }
            );
            if (!res.ok) throw new Error();
            load();
          } catch {
            showAlert("Error", "Couldn't delete the note.");
          }
        },
      },
    ]);
  }

  async function remindNote(n: MoneyNote) {
    if (remindingId) return;
    setRemindingId(n._id);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/notes/${n._id}/remind`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert(
          "Error",
          data.error ?? `Couldn't send the reminder (HTTP ${res.status})`
        );
        return;
      }
      showAlert("Reminder sent", `${n.personName} has been nudged.`);
      await load();
    } catch {
      showAlert("Error", "Network error — reminder not sent.");
    } finally {
      setRemindingId(null);
    }
  }

  function confirmHideNote(n: MoneyNote) {
    const owner = n.ownerName || n.personName;
    showAlert(
      "Hide this note?",
      `It disappears from your list. ${owner} keeps their copy.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hide",
          style: "destructive",
          onPress: async () => {
            setBusyId(n._id);
            try {
              const res = await authFetch(
                `/api/projects/expense-tracker/notes/${n._id}/hide`,
                { method: "POST" }
              );
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                showAlert(
                  "Error",
                  data.error ?? `Couldn't hide the note (HTTP ${res.status})`
                );
                return;
              }
              await load();
            } catch {
              showAlert("Error", "Network error — note not hidden.");
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  }

  function startEditTodo(t: TodoItem) {
    setEditingTodoId(t._id);
    setEditTodoText(t.text);
    setEditTodoDue(t.dueDate ? t.dueDate.slice(0, 10) : "");
    setTodoPicker(false);
  }

  function cancelEditTodo() {
    setEditingTodoId(null);
    setTodoPicker(false);
  }

  async function saveTodoEdit() {
    if (savingTodo || !editingTodoId) return;
    const text = editTodoText.trim();
    if (!text) return;
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
        showAlert(
          "Error",
          data.error ?? `Couldn't save the to-do (HTTP ${res.status})`
        );
        return;
      }
      setEditingTodoId(null);
      setTodoPicker(false);
      await load();
    } catch {
      showAlert("Error", "Network error — to-do not saved.");
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
        showAlert("Error", data.error ?? "Failed to add");
        return;
      }
      setTodoText("");
      load();
    } catch {
      showAlert("Error", "Network error — to-do not added.");
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
      showAlert("Error", "Network error.");
    } finally {
      setBusyId(null);
    }
  }

  function confirmDeleteTodo(t: TodoItem) {
    showAlert("Delete to-do", `Delete "${t.text}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await authFetch(
              `/api/projects/expense-tracker/todos/${t._id}`,
              { method: "DELETE" }
            );
            if (!res.ok) throw new Error();
            load();
          } catch {
            showAlert("Error", "Couldn't delete the to-do.");
          }
        },
      },
    ]);
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
  const owedToMe = totalsByCurrency("lent");
  const iOwe = totalsByCurrency("borrowed");

  // Same matching as the group invite field: name or address, whichever the
  // user remembers. Capped low — the sheet is already tall with a keyboard up.
  const linkSuggestions = useMemo(() => {
    const q = linkedEmail.trim().toLowerCase();
    const pool = q
      ? people.filter(
          (p) =>
            p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
        )
      : people;
    // Nothing to suggest once the field already holds that exact address.
    return pool.filter((p) => p.email.toLowerCase() !== q).slice(0, 4);
  }, [people, linkedEmail]);

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="flex-row items-center justify-between gap-2 px-5 pb-2 pt-2">
        {/* flex-1 + numberOfLines keep the long subtitle from pushing the
            button off-screen */}
        <View className="flex-1">
          <Text className="text-xl font-bold text-zinc-50">Notes & To-dos</Text>
          <Text className="text-xs text-zinc-500" numberOfLines={1}>
            {view === "notes"
              ? "Money you've lent or borrowed"
              : "Money chores to remember"}
          </Text>
        </View>
        {view === "notes" && (
          <Pressable
            onPress={openAdd}
            className="shrink-0 rounded-lg border border-brand-500/40 bg-brand-500 px-3 py-1.5"
          >
            <Text className="text-xs font-semibold text-white">+ Note</Text>
          </Pressable>
        )}
      </View>

      {/* Section switcher */}
      <View className="mx-4 mb-1 flex-row gap-1 rounded-xl border border-white/10 bg-zinc-900/50 p-1">
        {(
          [
            ["notes", "Money notes"],
            ["todos", "To-dos"],
          ] as const
        ).map(([v, label]) => (
          <Pressable
            key={v}
            onPress={() => setView(v)}
            className={`flex-1 items-center rounded-lg py-2 ${
              view === v ? "bg-brand-600" : ""
            }`}
          >
            <Text
              className={`text-[13px] font-semibold ${
                view === v ? "text-white" : "text-zinc-400"
              }`}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <KeyboardAwareScreen
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
        }
      >
        {loading && notes.length === 0 && todos.length === 0 ? (
          <View className="items-center py-16">
            <ActivityIndicator color="#6366f1" />
          </View>
        ) : view === "notes" ? (
          <>
            {(owedToMe.length > 0 || iOwe.length > 0) && (
              <View className="flex-row gap-2">
                {owedToMe.length > 0 && (
                  <View className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
                    <Text className="text-[11px] uppercase tracking-wider text-zinc-500">
                      Owed to you
                    </Text>
                    <Text className="mt-0.5 text-base font-bold text-emerald-400">
                      {owedToMe.map(([c, v]) => formatMoney(v, c)).join(" + ")}
                    </Text>
                  </View>
                )}
                {iOwe.length > 0 && (
                  <View className="flex-1 rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3">
                    <Text className="text-[11px] uppercase tracking-wider text-zinc-500">
                      You owe
                    </Text>
                    <Text className="mt-0.5 text-base font-bold text-red-400">
                      {iOwe.map(([c, v]) => formatMoney(v, c)).join(" + ")}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Money notes */}
            {openNotes.length === 0 && settledNotes.length === 0 ? (
              <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-10">
                <Text className="px-6 text-center text-sm text-zinc-500">
                  No money notes yet. Track cash you've lent to friends and when
                  they promised to return it.
                </Text>
              </View>
            ) : (
              <>
                {openNotes.map((n) => (
                  <NoteCard
                    key={n._id}
                    n={n}
                    busy={busyId === n._id}
                    reminding={remindingId === n._id}
                    onSettle={() => toggleSettled(n)}
                    onEdit={() => openEdit(n)}
                    onDelete={() => confirmDeleteNote(n)}
                    onRemind={() => remindNote(n)}
                    onHide={() => confirmHideNote(n)}
                  />
                ))}
                {settledNotes.length > 0 && (
                  <Text className="mt-1 text-[11px] uppercase tracking-wider text-zinc-600">
                    Settled
                  </Text>
                )}
                {settledNotes.map((n) => (
                  <NoteCard
                    key={n._id}
                    n={n}
                    busy={busyId === n._id}
                    reminding={remindingId === n._id}
                    onSettle={() => toggleSettled(n)}
                    onEdit={() => openEdit(n)}
                    onDelete={() => confirmDeleteNote(n)}
                    onRemind={() => remindNote(n)}
                    onHide={() => confirmHideNote(n)}
                  />
                ))}
                <Text className="px-1 text-center text-[11px] text-zinc-600">
                  Tap a note to edit · long-press to delete
                </Text>
              </>
            )}
          </>
        ) : (
          <>
            {/* To-dos */}
            <View className="flex-row gap-2">
              <Input
                value={todoText}
                onChangeText={setTodoText}
                onSubmitEditing={addTodo}
                placeholder="e.g. Remind Rahul about the 2000"
                returnKeyType="done"
                className="flex-1 rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2.5 text-zinc-100"
              />
              <Pressable
                onPress={addTodo}
                disabled={addingTodo || !todoText.trim()}
                className={`items-center justify-center rounded-xl bg-brand-600 px-4 ${
                  addingTodo || !todoText.trim() ? "opacity-50" : ""
                }`}
              >
                <Text className="text-sm font-semibold text-white">
                  {addingTodo ? "…" : "Add"}
                </Text>
              </Pressable>
            </View>

            {todos.length === 0 ? (
              <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-8">
                <Text className="text-sm text-zinc-500">Nothing to do — nice.</Text>
              </View>
            ) : (
              todos.map((t) =>
                editingTodoId === t._id ? (
                  <View
                    key={t._id}
                    className="gap-2 rounded-xl border border-brand-500/40 bg-white/[0.04] p-3"
                  >
                    <Input
                      value={editTodoText}
                      onChangeText={setEditTodoText}
                      onSubmitEditing={saveTodoEdit}
                      placeholder="What needs doing?"
                      returnKeyType="done"
                      autoFocus
                      className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2.5 text-zinc-100"
                    />
                    <View className="flex-row items-center gap-2">
                      <Pressable
                        onPress={() => setTodoPicker(true)}
                        className="flex-1 rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2.5"
                      >
                        <Text
                          className={`text-[13px] ${
                            editTodoDue ? "text-zinc-100" : "text-zinc-500"
                          }`}
                        >
                          {editTodoDue ? `Due ${editTodoDue}` : "Due date (optional)"}
                        </Text>
                      </Pressable>
                      {editTodoDue !== "" && (
                        <Pressable
                          onPress={() => setEditTodoDue("")}
                          className="rounded-lg border border-zinc-700 bg-zinc-900/40 px-2.5 py-2"
                        >
                          <Text className="text-[11px] font-semibold text-zinc-400">
                            Clear
                          </Text>
                        </Pressable>
                      )}
                    </View>
                    {todoPicker && (
                      <DateTimePicker
                        value={editTodoDue ? new Date(editTodoDue) : new Date()}
                        mode="date"
                        onChange={(_, d) => {
                          setTodoPicker(false);
                          if (d) setEditTodoDue(localISODate(d));
                        }}
                      />
                    )}
                    <View className="flex-row justify-end gap-2">
                      <Pressable
                        onPress={cancelEditTodo}
                        disabled={savingTodo}
                        className="rounded-lg border border-zinc-700 bg-zinc-900/40 px-3 py-1.5"
                      >
                        <Text className="text-xs font-semibold text-zinc-400">
                          Cancel
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={saveTodoEdit}
                        disabled={savingTodo || !editTodoText.trim()}
                        className={`rounded-lg border border-brand-500/40 bg-brand-600 px-3 py-1.5 ${
                          savingTodo || !editTodoText.trim() ? "opacity-50" : ""
                        }`}
                      >
                        <Text className="text-xs font-semibold text-white">
                          {savingTodo ? "…" : "Save"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                <Pressable
                  key={t._id}
                  onPress={() => toggleTodo(t)}
                  onLongPress={() => confirmDeleteTodo(t)}
                  className={`flex-row items-center gap-3 rounded-xl border px-3 py-3 ${
                    t.done
                      ? "border-white/5 bg-zinc-950/30 opacity-60"
                      : "border-white/10 bg-white/[0.04]"
                  }`}
                >
                  <View
                    className={`h-5 w-5 items-center justify-center rounded border ${
                      t.done
                        ? "border-emerald-500/60 bg-emerald-500/20"
                        : "border-zinc-700"
                    }`}
                  >
                    {t.done && <Text className="text-[11px] text-emerald-400">✓</Text>}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text
                      className={`text-sm ${
                        t.done ? "text-zinc-500 line-through" : "text-zinc-200"
                      }`}
                    >
                      {t.text}
                    </Text>
                    {t.dueDate && (
                      <Text className="mt-0.5 text-[11px] text-zinc-500">
                        due {shortDate(t.dueDate)}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => startEditTodo(t)}
                    hitSlop={8}
                    className="rounded-lg border border-zinc-700 bg-zinc-900/40 px-2.5 py-1.5"
                  >
                    <Text className="text-[11px] font-semibold text-zinc-300">
                      Edit
                    </Text>
                  </Pressable>
                </Pressable>
                )
              )
            )}
            {todos.length > 0 && (
              <Text className="px-1 text-center text-[11px] text-zinc-600">
                Tap to toggle · long-press to delete
              </Text>
            )}
          </>
        )}
      </KeyboardAwareScreen>

      {/* Add-note sheet */}
      <Modal
        visible={showAdd}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAdd(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View className="flex-1 justify-end bg-black/60">
            {/* Capped + scrollable: with the link field and its suggestions the
                sheet is taller than a small screen with the keyboard up.
                "handled" lets a suggestion take the tap while the keyboard
                is open instead of the tap only dismissing it. */}
            <View
              className="rounded-t-3xl border-t border-white/10 bg-zinc-950"
              style={{ maxHeight: "92%" }}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  paddingTop: 20,
                  paddingBottom: 40,
                }}
              >
              <Text className="mb-4 text-base font-bold text-zinc-100">
                {editingId ? "Edit money note" : "New money note"}
              </Text>

              <View className="mb-3 flex-row gap-2">
                {(
                  [
                    ["lent", "I gave money"],
                    ["borrowed", "I took money"],
                  ] as const
                ).map(([d, label]) => (
                  <Pressable
                    key={d}
                    onPress={() => setDirection(d)}
                    className={`flex-1 items-center rounded-xl border py-2.5 ${
                      direction === d
                        ? "border-brand-500/60 bg-brand-500/15"
                        : "border-white/10 bg-zinc-900/40"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        direction === d ? "text-brand-400" : "text-zinc-400"
                      }`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View className="gap-3">
                <Input
                  value={personName}
                  onChangeText={setPersonName}
                  placeholder={direction === "lent" ? "Given to (name)" : "Taken from (name)"}
                  className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
                />
                <View>
                  <Text className="mb-1.5 text-[13px] uppercase tracking-wider text-zinc-500">
                    Link to a Splitzy user (optional)
                  </Text>
                  <Input
                    value={linkedEmail}
                    onChangeText={setLinkedEmail}
                    onFocus={() => setLinkFocused(true)}
                    // Delayed so a tap on a suggestion lands before the list
                    // unmounts — otherwise the blur removes it mid-press.
                    onBlur={() => setTimeout(() => setLinkFocused(false), 150)}
                    placeholder="Their email"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
                  />
                  {linkFocused && linkSuggestions.length > 0 && (
                    <View className="mt-1 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80">
                      {linkSuggestions.map((p, i) => (
                        <Pressable
                          key={p.userId}
                          onPress={() => {
                            setLinkedEmail(p.email);
                            if (!personName.trim()) setPersonName(p.name);
                            setLinkFocused(false);
                          }}
                          className={`px-3 py-2.5 ${
                            i > 0 ? "border-t border-white/5" : ""
                          }`}
                        >
                          <Text className="text-[13px] text-zinc-200">{p.name}</Text>
                          <Text className="text-[11px] text-zinc-500" numberOfLines={1}>
                            {p.email}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <Text className="mt-1.5 text-[11px] text-zinc-500">
                    They'll see this note in their own list and can be reminded.
                  </Text>
                </View>
                <Input
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="Amount"
                  keyboardType="decimal-pad"
                  className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
                />
                <Input
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What for? (e.g. concert tickets)"
                  className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
                />
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text className="mb-1.5 text-[13px] uppercase tracking-wider text-zinc-500">
                      Given on
                    </Text>
                    <Pressable
                      onPress={() => setPicker("given")}
                      className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3"
                    >
                      <Text className="text-zinc-100">{givenOn}</Text>
                    </Pressable>
                  </View>
                  <View className="flex-1">
                    <Text className="mb-1.5 text-[13px] uppercase tracking-wider text-zinc-500">
                      Return by
                    </Text>
                    <Pressable
                      onPress={() => setPicker("due")}
                      className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3"
                    >
                      <Text className={dueBy ? "text-zinc-100" : "text-zinc-500"}>
                        {dueBy || "Optional"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {picker && (
                <DateTimePicker
                  value={
                    picker === "given"
                      ? new Date(givenOn)
                      : dueBy
                      ? new Date(dueBy)
                      : new Date()
                  }
                  mode="date"
                  onChange={(_, d) => {
                    setPicker(null);
                    if (!d) return;
                    if (picker === "given") setGivenOn(localISODate(d));
                    else setDueBy(localISODate(d));
                  }}
                />
              )}

              <View className="mt-5 gap-2">
                <GradientButton label="Save note" onPress={saveNote} loading={saving} />
                <Pressable
                  onPress={() => setShowAdd(false)}
                  className="items-center py-2"
                >
                  <Text className="text-sm text-zinc-500">Cancel</Text>
                </Pressable>
              </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function NoteCard({
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
  // Written by someone else about the viewer: read-only, can only be hidden.
  const mirrored = n.mirrored === true;
  const canRemind = !mirrored && lent && !n.settledAt && !!n.linkedUserId;
  const reminded = remindedRecently(n);
  return (
    <Pressable
      onPress={mirrored ? undefined : onEdit}
      onLongPress={mirrored ? undefined : onDelete}
      className={`rounded-2xl border p-4 ${
        n.settledAt
          ? "border-white/5 bg-zinc-950/30 opacity-70"
          : n.overdue
          ? "border-red-500/40 bg-red-500/[0.05]"
          : lent
          ? "border-emerald-500/20 bg-emerald-500/[0.03]"
          : "border-red-500/20 bg-red-500/[0.03]"
      }`}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Text className="text-sm font-semibold text-zinc-100">
              {n.personName}
            </Text>
            {!mirrored && !!n.linkedUserId && (
              <Text className="rounded-full border border-brand-500/40 bg-brand-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-brand-400">
                on Splitzy
              </Text>
            )}
            {mirrored && (
              <Text className="rounded-full border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-zinc-300">
                Added by {n.ownerName || n.personName}
              </Text>
            )}
            <Text className={`text-sm ${lent ? "text-emerald-400" : "text-red-400"}`}>
              {lent ? "owes you" : "you owe"} {formatMoney(n.amount, n.currency)}
            </Text>
            {n.overdue && (
              <Text className="rounded-full border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-red-400">
                overdue
              </Text>
            )}
          </View>
          <Text className="mt-1 text-[12px] text-zinc-500">
            {n.description ? `${n.description} · ` : ""}
            given {shortDate(n.givenOn)}
            {n.dueBy ? ` · promised by ${shortDate(n.dueBy)}` : ""}
            {n.settledAt ? ` · settled ${shortDate(n.settledAt)}` : ""}
          </Text>
        </View>
        {mirrored ? (
          <Pressable
            onPress={onHide}
            disabled={busy}
            className={`rounded-lg border border-zinc-700 bg-zinc-900/40 px-2.5 py-1.5 ${
              busy ? "opacity-50" : ""
            }`}
          >
            <Text className="text-[11px] font-semibold text-zinc-400">
              {busy ? "…" : "Hide"}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onSettle}
            disabled={busy}
            className={`rounded-lg border px-2.5 py-1.5 ${
              n.settledAt
                ? "border-zinc-700 bg-zinc-900/40"
                : "border-emerald-500/40 bg-emerald-500/10"
            } ${busy ? "opacity-50" : ""}`}
          >
            <Text
              className={`text-[11px] font-semibold ${
                n.settledAt ? "text-zinc-400" : "text-emerald-300"
              }`}
            >
              {busy ? "…" : n.settledAt ? "Reopen" : lent ? "Returned" : "Repaid"}
            </Text>
          </Pressable>
        )}
      </View>
      {!mirrored && (
        <View className="mt-3 flex-row items-center justify-end gap-2">
          {canRemind && (
            <Pressable
              onPress={onRemind}
              disabled={reminding || reminded}
              className={`rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 ${
                reminding || reminded ? "opacity-50" : ""
              }`}
            >
              <Text className="text-[11px] font-semibold text-amber-300">
                {reminding ? "…" : reminded ? "Reminded" : "Remind"}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={onEdit}
            className="rounded-md border border-zinc-700 bg-zinc-900/40 px-2 py-1"
          >
            <Text className="text-[11px] font-semibold text-zinc-300">Edit</Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}
