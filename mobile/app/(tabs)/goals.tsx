import {
 useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import type { Account, Goal } from "../../lib/types";
import { AppBackground, GradientButton, Input } from "../../components/ui";
import { formatMoney, parseAmount } from "../../lib/currency";
import { localISODate } from "../../lib/dates";

// The list route can return archived goals (?archived=true); the shared Goal
// type predates the flag, so widen it here.
type GoalRow = Goal & { archived: boolean };

export default function GoalsScreen() {
  const { authFetch } = useAuth();
  const router = useRouter();
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [base, setBase] = useState("INR");
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  // Set while the sheet is editing an existing goal rather than adding one.
  const [editing, setEditing] = useState<GoalRow | null>(null);
  const [contributeTo, setContributeTo] = useState<GoalRow | null>(null);
  // The list route drops archived goals unless asked for them by name.
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      const [gRes, aRes, pRes] = await Promise.all([
        authFetch(
          `/api/projects/expense-tracker/goals${showArchived ? "?archived=true" : ""}`
        ),
        authFetch("/api/projects/expense-tracker/accounts"),
        authFetch("/api/projects/expense-tracker/prefs"),
      ]);
      setGoals((await gRes.json().catch(() => ({}))).goals ?? []);
      setAccounts((await aRes.json().catch(() => ({}))).accounts ?? []);
      const p = await pRes.json().catch(() => ({}));
      if (p.prefs?.baseCurrency) setBase(p.prefs.baseCurrency);
    } catch {
      /* keep */
    }
  }, [authFetch, showArchived]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function confirmDelete(g: GoalRow) {
    Alert.alert("Delete goal", `Delete "${g.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          const res = await authFetch(`/api/projects/expense-tracker/goals/${g._id}`, { method: "DELETE" });
          if (!res.ok) throw new Error();
          load();
        } catch {
          Alert.alert("Error", "Couldn't delete the goal.");
        }
      } },
    ]);
  }

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <View className="flex-row items-center gap-2">
          <Pressable onPress={() => router.back()} hitSlop={8}><Text className="text-2xl text-zinc-400">‹</Text></Pressable>
          <Text className="text-xl font-bold text-zinc-50">Goals</Text>
        </View>
        <Pressable onPress={() => { setEditing(null); setShowAdd(true); }} className="rounded-lg bg-brand-600 px-3 py-1.5">
          <Text className="text-xs font-semibold text-white">+ Add</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        <View className="flex-row items-center justify-between px-1">
          <Text className="text-[11px] uppercase tracking-wider text-zinc-500">
            {showArchived ? "All goals" : "Active goals"}
          </Text>
          <Pressable onPress={() => setShowArchived((v) => !v)} hitSlop={8}>
            <Text className="text-[11px] font-semibold text-brand-400">
              {showArchived ? "Hide archived" : "Show archived"}
            </Text>
          </Pressable>
        </View>

        {goals.length === 0 ? (
          <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-12">
            <Text className="text-sm text-zinc-400">No goals yet.</Text>
            <Text className="mt-1 px-8 text-center text-xs text-zinc-500">Add one — an emergency fund, a trip, a new phone.</Text>
          </View>
        ) : (
          <>
            {goals.map((g) => {
              const widthPct = Math.min(100, Math.round(g.pct * 100));
              const linked = !!g.linkedAccountId;
              return (
                <Pressable
                  key={g._id}
                  onPress={() => { setEditing(g); setShowAdd(true); }}
                  onLongPress={() => confirmDelete(g)}
                  className={`rounded-2xl border p-4 ${
                    g.archived
                      ? "border-white/5 bg-zinc-950/30 opacity-70"
                      : g.complete
                        ? "border-emerald-500/40 bg-emerald-500/[0.05]"
                        : "border-white/10 bg-white/[0.04]"
                  }`}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <Text className="font-semibold text-zinc-100">{g.name}</Text>
                      {g.archived && (
                        <Text className="rounded-full border border-zinc-700 bg-zinc-900/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-zinc-400">
                          archived
                        </Text>
                      )}
                      {g.complete && <Text className="rounded-full bg-emerald-500/15 px-1.5 text-[10px] text-emerald-400">reached 🎉</Text>}
                      {linked && <Text className="rounded-full bg-brand-500/15 px-1.5 text-[10px] text-brand-400">linked</Text>}
                    </View>
                    <Text className="text-xs text-zinc-500">{Math.round(g.pct * 100)}%</Text>
                  </View>
                  <Text className="mt-1 text-base font-bold text-zinc-100">
                    {formatMoney(g.saved, base)}
                    <Text className="text-xs font-normal text-zinc-500"> of {formatMoney(g.target, base)}</Text>
                  </Text>
                  <View className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
                    <View style={{ width: `${widthPct}%`, height: "100%", backgroundColor: g.complete ? "#10b981" : "#6366f1", borderRadius: 999 }} />
                  </View>
                  {g.deadline && (
                    <Text className="mt-2 text-[11px] text-zinc-500">
                      by {new Date(g.deadline).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}
                      {g.monthlyNeeded != null && !g.complete ? `  ·  save ${formatMoney(g.monthlyNeeded, base)}/mo` : ""}
                    </Text>
                  )}
                  {/* Tapping the card now opens the edit sheet, so contributing
                      needs its own target inside the card. */}
                  {!linked && !g.complete && !g.archived && (
                    <Pressable
                      onPress={() => setContributeTo(g)}
                      className="mt-3 self-start rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-1.5"
                    >
                      <Text className="text-[11px] font-semibold text-brand-300">+ Add money</Text>
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
            <Text className="px-1 text-center text-[11px] text-zinc-600">
              Tap a goal to edit or archive it · long-press to delete
            </Text>
          </>
        )}
      </ScrollView>

      <GoalSheet
        visible={showAdd}
        editing={editing}
        accounts={accounts}
        onClose={() => { setShowAdd(false); setEditing(null); }}
        onSaved={() => { setShowAdd(false); setEditing(null); load(); }}
      />
      <ContributeSheet
        goal={contributeTo}
        base={base}
        onClose={() => setContributeTo(null)}
        onSaved={() => { setContributeTo(null); load(); }}
      />
    </SafeAreaView>
  );
}

function ContributeSheet({ goal, base, onClose, onSaved }: {
  goal: GoalRow | null; base: string; onClose: () => void; onSaved: () => void;
}) {
  const { authFetch } = useAuth();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (goal) setAmount(""); }, [goal]);

  async function submit() {
    const amt = parseAmount(amount);
    if (!amt || amt <= 0) return Alert.alert("Enter a valid amount");
    setBusy(true);
    try {
      const res = await authFetch(`/api/projects/expense-tracker/goals/${goal!._id}/contribute`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: amt }),
      });
      if (!res.ok) throw new Error("failed");
      onSaved();
    } catch {
      Alert.alert("Couldn't update goal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={!!goal} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Pressable className="rounded-t-3xl border-t border-white/10 bg-[#0a0b14] p-5" onPress={(e) => e.stopPropagation()}>
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="text-base font-semibold text-zinc-100">Add to {goal?.name}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text className="text-sm text-zinc-500">Close</Text></Pressable>
          </View>
          <Text className="mb-3 text-xs text-zinc-500">
            {goal ? `${formatMoney(goal.saved, base)} of ${formatMoney(goal.target, base)} saved` : ""} · use a minus sign to withdraw
          </Text>
          <View className="gap-3">
            <Input value={amount} onChangeText={setAmount} placeholder="Amount" keyboardType="numbers-and-punctuation" placeholderTextColor="#71717a" autoFocus
              className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100" />
            <GradientButton label="Update goal" onPress={submit} loading={busy} />
          </View>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
    </Modal>
  );
}

function GoalSheet({ visible, editing, accounts, onClose, onSaved }: {
  visible: boolean; editing: GoalRow | null; accounts: Account[]; onClose: () => void; onSaved: () => void;
}) {
  const { authFetch } = useAuth();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("");
  const [deadline, setDeadline] = useState("");
  const [linkedAccountId, setLinkedAccountId] = useState("");
  const [archived, setArchived] = useState(false);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPicker(false);
    if (editing) {
      setName(editing.name);
      setTarget(String(editing.target));
      // A linked goal's progress is its account balance, never a typed number.
      setSaved(editing.linkedAccountId ? "" : String(editing.saved));
      setDeadline(editing.deadline ?? "");
      setLinkedAccountId(editing.linkedAccountId ?? "");
      setArchived(editing.archived);
    } else {
      setName(""); setTarget(""); setSaved(""); setDeadline(""); setLinkedAccountId("");
      setArchived(false);
    }
  }, [visible, editing]);

  async function submit() {
    if (!name.trim()) return Alert.alert("Enter a name");
    const t = parseAmount(target);
    if (!t || t <= 0) return Alert.alert("Enter a target");
    setBusy(true);
    try {
      // updateGoalSchema has no linkedAccountId — how a goal is funded is fixed
      // once it exists, so an edit sends only the fields PATCH accepts. Both
      // payload schemas are strict, and only the update one knows about
      // `archived` — a new goal is always active.
      const body = editing
        ? {
            name: name.trim(),
            target: t,
            deadline: deadline || null,
            archived,
            ...(editing.linkedAccountId ? {} : { savedAmount: parseAmount(saved) || 0 }),
          }
        : {
            name: name.trim(),
            target: t,
            savedAmount: linkedAccountId ? 0 : parseAmount(saved) || 0,
            deadline: deadline || undefined,
            linkedAccountId: linkedAccountId || undefined,
          };
      const res = await authFetch(
        editing
          ? `/api/projects/expense-tracker/goals/${editing._id}`
          : "/api/projects/expense-tracker/goals",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed");
      }
      onSaved();
    } catch (e) {
      Alert.alert(
        editing ? "Couldn't update goal" : "Couldn't add goal",
        e instanceof Error ? e.message : ""
      );
    } finally {
      setBusy(false);
    }
  }

  const chip = (active: boolean) => `rounded-lg border px-3 py-1.5 ${active ? "border-brand-500/60 bg-brand-500/15" : "border-white/10 bg-zinc-900/40"}`;
  const linkedName = accounts.find((a) => a._id === linkedAccountId)?.name;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Pressable className="rounded-t-3xl border-t border-white/10 bg-[#0a0b14] p-5" onPress={(e) => e.stopPropagation()}>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-base font-semibold text-zinc-100">{editing ? "Edit goal" : "New savings goal"}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text className="text-sm text-zinc-500">Close</Text></Pressable>
          </View>
          <View className="gap-3">
            <Input value={name} onChangeText={setName} placeholder="Goal name (e.g. Emergency fund)" placeholderTextColor="#71717a"
              className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100" />
            <Input value={target} onChangeText={setTarget} placeholder="Target amount" keyboardType="decimal-pad" placeholderTextColor="#71717a"
              className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100" />
            <View className="gap-1.5">
              <View className="flex-row items-center justify-between">
                <Text className="text-[12px] uppercase tracking-wider text-zinc-500">Deadline (optional)</Text>
                {!!deadline && (
                  <Pressable onPress={() => setDeadline("")} hitSlop={8}>
                    <Text className="text-[12px] text-zinc-500">Clear</Text>
                  </Pressable>
                )}
              </View>
              <Pressable onPress={() => setPicker(true)} className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3">
                <Text className={deadline ? "text-zinc-100" : "text-zinc-500"}>{deadline || "No deadline"}</Text>
              </Pressable>
              <Text className="text-[11px] text-zinc-600">Sets the monthly amount to save shown on the card.</Text>
            </View>
            {editing ? (
              linkedAccountId ? (
                <View className="rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-3">
                  <Text className="text-[12px] uppercase tracking-wider text-zinc-500">Tracked via account</Text>
                  <Text className="mt-0.5 text-sm text-zinc-300">{linkedName ?? "Linked account"} · fixed after creation</Text>
                </View>
              ) : null
            ) : (
              <View className="gap-1.5">
                <Text className="text-[12px] uppercase tracking-wider text-zinc-500">Track via account (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  <Pressable onPress={() => setLinkedAccountId("")} className={chip(linkedAccountId === "")}>
                    <Text className={`text-xs font-medium ${linkedAccountId === "" ? "text-brand-400" : "text-zinc-400"}`}>Manual</Text>
                  </Pressable>
                  {accounts.map((a) => (
                    <Pressable key={a._id} onPress={() => setLinkedAccountId(a._id)} className={chip(linkedAccountId === a._id)}>
                      <Text className={`text-xs font-medium ${linkedAccountId === a._id ? "text-brand-400" : "text-zinc-400"}`}>{a.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            {!linkedAccountId && (
              <Input value={saved} onChangeText={setSaved} placeholder={editing ? "Saved so far" : "Already saved (optional)"}
                keyboardType="decimal-pad" placeholderTextColor="#71717a"
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100" />
            )}
            {editing && (
              <View className="gap-1.5">
                <Text className="text-[12px] uppercase tracking-wider text-zinc-500">Status</Text>
                <View className="flex-row gap-2">
                  {([[false, "Active"], [true, "Archived"]] as const).map(([value, label]) => (
                    <Pressable
                      key={label}
                      onPress={() => setArchived(value)}
                      className={`flex-1 items-center rounded-xl border py-2.5 ${archived === value ? "border-brand-500/60 bg-brand-500/15" : "border-white/10 bg-zinc-900/40"}`}
                    >
                      <Text className={`text-sm font-medium ${archived === value ? "text-brand-400" : "text-zinc-400"}`}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text className="text-[11px] text-zinc-500">
                  Archiving keeps the goal's progress but drops it out of the list.
                </Text>
              </View>
            )}
            <GradientButton label={editing ? "Save goal" : "Add goal"} onPress={submit} loading={busy} />
          </View>

          {picker && (
            <DateTimePicker
              value={deadline ? new Date(deadline) : new Date()}
              mode="date"
              onChange={(_, d) => {
                setPicker(false);
                if (d) setDeadline(localISODate(d));
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
    </Modal>
  );
}
