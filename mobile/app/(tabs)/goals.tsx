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
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import type { Account, Goal } from "../../lib/types";
import { AppBackground, GradientButton, Input } from "../../components/ui";
import { formatMoney, parseAmount } from "../../lib/currency";

export default function GoalsScreen() {
  const { authFetch } = useAuth();
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [base, setBase] = useState("INR");
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [contributeTo, setContributeTo] = useState<Goal | null>(null);

  const load = useCallback(async () => {
    try {
      const [gRes, aRes, pRes] = await Promise.all([
        authFetch("/api/projects/expense-tracker/goals"),
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
  }, [authFetch]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function confirmDelete(g: Goal) {
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
        <Pressable onPress={() => setShowAdd(true)} className="rounded-lg bg-brand-600 px-3 py-1.5">
          <Text className="text-xs font-semibold text-white">+ Add</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        {goals.length === 0 ? (
          <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-12">
            <Text className="text-sm text-zinc-400">No goals yet.</Text>
            <Text className="mt-1 px-8 text-center text-xs text-zinc-500">Add one — an emergency fund, a trip, a new phone.</Text>
          </View>
        ) : (
          goals.map((g) => {
            const widthPct = Math.min(100, Math.round(g.pct * 100));
            const linked = !!g.linkedAccountId;
            return (
              <Pressable
                key={g._id}
                onLongPress={() => confirmDelete(g)}
                onPress={() => !linked && !g.complete && setContributeTo(g)}
                className={`rounded-2xl border p-4 ${g.complete ? "border-emerald-500/40 bg-emerald-500/[0.05]" : "border-white/10 bg-white/[0.04]"}`}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-semibold text-zinc-100">{g.name}</Text>
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
                {!linked && !g.complete && <Text className="mt-1 text-[11px] text-brand-400">Tap to add money · long-press to delete</Text>}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <AddGoalSheet visible={showAdd} accounts={accounts} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
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
  goal: Goal | null; base: string; onClose: () => void; onSaved: () => void;
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

function AddGoalSheet({ visible, accounts, onClose, onSaved }: {
  visible: boolean; accounts: Account[]; onClose: () => void; onSaved: () => void;
}) {
  const { authFetch } = useAuth();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("");
  const [linkedAccountId, setLinkedAccountId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) { setName(""); setTarget(""); setSaved(""); setLinkedAccountId(""); }
  }, [visible]);

  async function submit() {
    if (!name.trim()) return Alert.alert("Enter a name");
    const t = parseAmount(target);
    if (!t || t <= 0) return Alert.alert("Enter a target");
    setBusy(true);
    try {
      const res = await authFetch("/api/projects/expense-tracker/goals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), target: t,
          savedAmount: linkedAccountId ? 0 : parseAmount(saved) || 0,
          linkedAccountId: linkedAccountId || undefined,
        }),
      });
      if (!res.ok) throw new Error("failed");
      onSaved();
    } catch {
      Alert.alert("Couldn't add goal");
    } finally {
      setBusy(false);
    }
  }

  const chip = (active: boolean) => `rounded-lg border px-3 py-1.5 ${active ? "border-brand-500/60 bg-brand-500/15" : "border-white/10 bg-zinc-900/40"}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Pressable className="rounded-t-3xl border-t border-white/10 bg-[#0a0b14] p-5" onPress={(e) => e.stopPropagation()}>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-base font-semibold text-zinc-100">New savings goal</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text className="text-sm text-zinc-500">Close</Text></Pressable>
          </View>
          <View className="gap-3">
            <Input value={name} onChangeText={setName} placeholder="Goal name (e.g. Emergency fund)" placeholderTextColor="#71717a"
              className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100" />
            <Input value={target} onChangeText={setTarget} placeholder="Target amount" keyboardType="decimal-pad" placeholderTextColor="#71717a"
              className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100" />
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
            {!linkedAccountId && (
              <Input value={saved} onChangeText={setSaved} placeholder="Already saved (optional)" keyboardType="decimal-pad" placeholderTextColor="#71717a"
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100" />
            )}
            <GradientButton label="Add goal" onPress={submit} loading={busy} />
          </View>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
    </Modal>
  );
}
