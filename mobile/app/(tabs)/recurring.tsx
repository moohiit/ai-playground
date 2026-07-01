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
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import {
  CATEGORIES,
  INCOME_CATEGORIES,
  type Direction,
  type RecurringRule,
} from "../../lib/types";
import { SUPPORTED_CURRENCIES, formatMoney } from "../../lib/currency";
import { AppBackground, GradientButton, Input } from "../../components/ui";

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function RecurringScreen() {
  const { authFetch } = useAuth();
  const router = useRouter();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/projects/expense-tracker/recurring");
      const data = await res.json().catch(() => ({}));
      setRules(data.recurring ?? []);
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

  async function post(id: string) {
    await authFetch(`/api/projects/expense-tracker/recurring/${id}/post`, { method: "POST" });
    load();
  }
  async function toggle(r: RecurringRule) {
    await authFetch(`/api/projects/expense-tracker/recurring/${r._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    });
    load();
  }
  function confirmDelete(r: RecurringRule) {
    Alert.alert("Delete rule", "Already-posted transactions stay.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await authFetch(`/api/projects/expense-tracker/recurring/${r._id}`, { method: "DELETE" });
          load();
        },
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <View className="flex-row items-center gap-2">
          <Pressable onPress={() => router.back()} hitSlop={8}><Text className="text-2xl text-zinc-400">‹</Text></Pressable>
          <Text className="text-xl font-bold text-zinc-50">Recurring</Text>
        </View>
        <Pressable onPress={() => setShowAdd(true)} className="rounded-lg bg-brand-600 px-3 py-1.5">
          <Text className="text-xs font-semibold text-white">+ Add</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        {rules.length === 0 ? (
          <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-12">
            <Text className="text-sm text-zinc-400">No recurring rules yet.</Text>
            <Text className="mt-1 px-8 text-center text-xs text-zinc-500">Add rent, a subscription, or any repeating bill.</Text>
          </View>
        ) : (
          rules.map((r) => (
            <Pressable
              key={r._id}
              onLongPress={() => confirmDelete(r)}
              className={`rounded-2xl border p-4 ${!r.active ? "border-white/5 opacity-60" : r.due ? "border-amber-500/40 bg-amber-500/[0.05]" : "border-white/10 bg-white/[0.04]"}`}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-2">
                  <View className="flex-row flex-wrap items-center gap-1.5">
                    <Text className="font-semibold text-zinc-100">{r.template.description}</Text>
                    {r.autoPost && <Text className="rounded-full bg-brand-500/15 px-1.5 text-[10px] text-brand-400">auto</Text>}
                    {!r.active && <Text className="rounded-full bg-zinc-800 px-1.5 text-[10px] text-zinc-400">paused</Text>}
                  </View>
                  <Text className="mt-0.5 text-xs text-zinc-500">
                    {r.template.category} · {r.cadence} · {r.active ? `next ${fmtDate(r.nextRunAt)}` : "paused"}
                    {r.due && r.active ? " · due" : ""}
                  </Text>
                </View>
                <Text className={`text-base font-semibold ${r.template.direction === "income" ? "text-emerald-400" : "text-zinc-100"}`}>
                  {r.template.direction === "income" ? "+" : ""}{formatMoney(r.template.amount, r.template.currency)}
                </Text>
              </View>
              <View className="mt-3 flex-row justify-end gap-4 border-t border-white/5 pt-2">
                {r.due && r.active && !r.autoPost && (
                  <Pressable onPress={() => post(r._id)} hitSlop={6}><Text className="text-xs font-semibold text-amber-300">Post now</Text></Pressable>
                )}
                <Pressable onPress={() => toggle(r)} hitSlop={6}><Text className="text-xs font-medium text-zinc-400">{r.active ? "Pause" : "Resume"}</Text></Pressable>
                <Pressable onPress={() => confirmDelete(r)} hitSlop={6}><Text className="text-xs font-medium text-red-400">Delete</Text></Pressable>
              </View>
            </Pressable>
          ))
        )}
        {rules.length > 0 && <Text className="px-1 text-center text-[11px] text-zinc-600">Long-press a rule to delete it.</Text>}
      </ScrollView>

      <AddRuleSheet visible={showAdd} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
    </SafeAreaView>
  );
}

function AddRuleSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const { authFetch } = useAuth();
  const [direction, setDirection] = useState<Direction>("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [cadence, setCadence] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [showDate, setShowDate] = useState(false);
  const [autoPost, setAutoPost] = useState(false);
  const [saving, setSaving] = useState(false);

  const categoryList = direction === "income" ? INCOME_CATEGORIES : CATEGORIES;

  useEffect(() => {
    if (visible) {
      setStartDate(new Date().toISOString().slice(0, 10));
      authFetch("/api/projects/expense-tracker/prefs")
        .then((r) => r.json())
        .then((d) => d.prefs?.baseCurrency && setCurrency(d.prefs.baseCurrency))
        .catch(() => {});
    }
  }, [visible, authFetch]);

  function changeDirection(d: Direction) {
    setDirection(d);
    const list = d === "income" ? INCOME_CATEGORIES : CATEGORIES;
    setCategory((c) => ((list as readonly string[]).includes(c) ? c : list[0]));
  }

  async function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return Alert.alert("Enter a valid amount");
    if (!description.trim()) return Alert.alert("Enter a description");
    setSaving(true);
    try {
      const res = await authFetch("/api/projects/expense-tracker/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt, currency, category, description: description.trim(),
          direction, cadence, startDate, autoPost,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed");
      }
      setAmount(""); setDescription("");
      onSaved();
    } catch (e) {
      Alert.alert("Couldn't add rule", e instanceof Error ? e.message : "");
    } finally {
      setSaving(false);
    }
  }

  const chip = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 ${active ? "border-brand-500/60 bg-brand-500/15" : "border-white/10 bg-zinc-900/40"}`;
  const chipTxt = (active: boolean) => `text-xs font-medium ${active ? "text-brand-400" : "text-zinc-400"}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Pressable className="rounded-t-3xl border-t border-white/10 bg-[#0a0b14] p-5" onPress={(e) => e.stopPropagation()}>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-base font-semibold text-zinc-100">Add recurring rule</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text className="text-sm text-zinc-500">Close</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
            <View className="flex-row gap-2">
              {(["expense", "income"] as const).map((d) => (
                <Pressable key={d} onPress={() => changeDirection(d)} className={`flex-1 items-center rounded-xl border py-2.5 ${direction === d ? "border-brand-500/60 bg-brand-500/15" : "border-white/10 bg-zinc-900/40"}`}>
                  <Text className={`text-sm font-medium capitalize ${direction === d ? "text-brand-400" : "text-zinc-400"}`}>{d}</Text>
                </Pressable>
              ))}
            </View>

            <View className="gap-1.5">
              <Text className="text-[12px] uppercase tracking-wider text-zinc-500">Amount</Text>
              <Input value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor="#71717a"
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-lg text-zinc-100" />
            </View>

            <View className="gap-1.5">
              <Text className="text-[12px] uppercase tracking-wider text-zinc-500">Currency</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: "center" }}>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <Pressable key={c} onPress={() => setCurrency(c)} className={chip(currency === c)}>
                    <Text className={chipTxt(currency === c)}>{c}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View className="gap-1.5">
              <Text className="text-[12px] uppercase tracking-wider text-zinc-500">Description</Text>
              <Input value={description} onChangeText={setDescription} placeholder="e.g. Netflix, Rent" placeholderTextColor="#71717a"
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100" />
            </View>

            <View className="gap-1.5">
              <Text className="text-[12px] uppercase tracking-wider text-zinc-500">Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {categoryList.map((c) => (
                  <Pressable key={c} onPress={() => setCategory(c)} className={chip(category === c)}>
                    <Text className={chipTxt(category === c)}>{c}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View className="gap-1.5">
              <Text className="text-[12px] uppercase tracking-wider text-zinc-500">Repeats</Text>
              <View className="flex-row gap-2">
                {(["weekly", "monthly", "yearly"] as const).map((c) => (
                  <Pressable key={c} onPress={() => setCadence(c)} className={`flex-1 items-center ${chip(cadence === c)}`}>
                    <Text className={chipTxt(cadence === c)}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="gap-1.5">
              <Text className="text-[12px] uppercase tracking-wider text-zinc-500">Starts on</Text>
              <Pressable onPress={() => setShowDate(true)} className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3">
                <Text className="text-zinc-100">{startDate}</Text>
              </Pressable>
            </View>

            {showDate && (
              <DateTimePicker
                value={startDate ? new Date(startDate) : new Date()}
                mode="date"
                onChange={(_, d) => {
                  setShowDate(false);
                  if (d) setStartDate(d.toISOString().slice(0, 10));
                }}
              />
            )}

            <View className="flex-row items-center justify-between rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-3">
              <Text className="text-sm text-zinc-300">Auto-post each period</Text>
              <Switch value={autoPost} onValueChange={setAutoPost} trackColor={{ true: "#6366f1" }} />
            </View>

            <GradientButton label="Add rule" onPress={submit} loading={saving} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
    </Modal>
  );
}
