import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth";
import { localISODate } from "../../lib/dates";
import { formatMoney, parseAmount } from "../../lib/currency";
import {
  AppBackground,
  GradientButton,
  Input,
  KeyboardAwareScreen,
} from "../../components/ui";

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

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function NotesScreen() {
  const { authFetch } = useAuth();
  const [notes, setNotes] = useState<MoneyNote[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // add-note sheet
  const [showAdd, setShowAdd] = useState(false);
  const [direction, setDirection] = useState<"lent" | "borrowed">("lent");
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [givenOn, setGivenOn] = useState(localISODate(new Date()));
  const [dueBy, setDueBy] = useState("");
  const [picker, setPicker] = useState<"given" | "due" | null>(null);
  const [saving, setSaving] = useState(false);

  // todo input
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
    setDirection("lent");
    setPersonName("");
    setAmount("");
    setDescription("");
    setGivenOn(localISODate(new Date()));
    setDueBy("");
  }

  async function saveNote() {
    if (saving) return;
    const amt = parseAmount(amount);
    if (!personName.trim()) return Alert.alert("Who was the money given to?");
    if (!amt || amt <= 0) return Alert.alert("Enter a valid amount");
    setSaving(true);
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
        Alert.alert("Error", data.error ?? "Failed to save note");
        return;
      }
      resetForm();
      setShowAdd(false);
      load();
    } catch {
      Alert.alert("Error", "Network error — note not saved.");
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
      if (!res.ok) Alert.alert("Error", "Couldn't update the note");
      await load();
    } catch {
      Alert.alert("Error", "Network error.");
    } finally {
      setBusyId(null);
    }
  }

  function confirmDeleteNote(n: MoneyNote) {
    Alert.alert("Delete note", `Delete the note for ${n.personName}?`, [
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
            Alert.alert("Error", "Couldn't delete the note.");
          }
        },
      },
    ]);
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
        Alert.alert("Error", data.error ?? "Failed to add");
        return;
      }
      setTodoText("");
      load();
    } catch {
      Alert.alert("Error", "Network error — to-do not added.");
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
      Alert.alert("Error", "Network error.");
    } finally {
      setBusyId(null);
    }
  }

  function confirmDeleteTodo(t: TodoItem) {
    Alert.alert("Delete to-do", `Delete "${t.text}"?`, [
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
            Alert.alert("Error", "Couldn't delete the to-do.");
          }
        },
      },
    ]);
  }

  const openNotes = notes.filter((n) => !n.settledAt);
  const settledNotes = notes.filter((n) => n.settledAt);
  const owedToMe = openNotes
    .filter((n) => n.direction === "lent")
    .reduce((s, n) => s + n.amount, 0);
  const iOwe = openNotes
    .filter((n) => n.direction === "borrowed")
    .reduce((s, n) => s + n.amount, 0);
  const noteCur = openNotes[0]?.currency ?? notes[0]?.currency ?? "INR";

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <View>
          <Text className="text-xl font-bold text-zinc-50">Notes & To-dos</Text>
          <Text className="text-xs text-zinc-500">
            Money you've lent or borrowed, and chores to remember
          </Text>
        </View>
        <Pressable
          onPress={() => setShowAdd(true)}
          className="rounded-lg border border-brand-500/40 bg-brand-500/15 px-3 py-1.5"
        >
          <Text className="text-xs font-semibold text-brand-300">+ Note</Text>
        </Pressable>
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
        ) : (
          <>
            {(owedToMe > 0 || iOwe > 0) && (
              <View className="flex-row gap-2">
                {owedToMe > 0 && (
                  <View className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
                    <Text className="text-[11px] uppercase tracking-wider text-zinc-500">
                      Owed to you
                    </Text>
                    <Text className="mt-0.5 text-base font-bold text-emerald-400">
                      {formatMoney(owedToMe, noteCur)}
                    </Text>
                  </View>
                )}
                {iOwe > 0 && (
                  <View className="flex-1 rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3">
                    <Text className="text-[11px] uppercase tracking-wider text-zinc-500">
                      You owe
                    </Text>
                    <Text className="mt-0.5 text-base font-bold text-red-400">
                      {formatMoney(iOwe, noteCur)}
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
                    onSettle={() => toggleSettled(n)}
                    onDelete={() => confirmDeleteNote(n)}
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
                    onSettle={() => toggleSettled(n)}
                    onDelete={() => confirmDeleteNote(n)}
                  />
                ))}
              </>
            )}

            {/* To-dos */}
            <Text className="mt-3 text-base font-semibold text-zinc-100">
              To-do list
            </Text>
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
              todos.map((t) => (
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
                  <Text
                    className={`flex-1 text-sm ${
                      t.done ? "text-zinc-500 line-through" : "text-zinc-200"
                    }`}
                  >
                    {t.text}
                  </Text>
                </Pressable>
              ))
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
            <View className="rounded-t-3xl border-t border-white/10 bg-zinc-950 px-5 pb-10 pt-5">
              <Text className="mb-4 text-base font-bold text-zinc-100">
                New money note
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
    <Pressable
      onLongPress={onDelete}
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
      </View>
    </Pressable>
  );
}
