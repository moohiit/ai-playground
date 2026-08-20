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
import { localISODate } from "../../lib/dates";
import {
  CATEGORIES,
  INCOME_CATEGORIES,
  type Account,
  type Direction,
  type RecurringRule,
} from "../../lib/types";
import { SUPPORTED_CURRENCIES, formatMoney, parseAmount } from "../../lib/currency";
import { AppBackground, GradientButton, Input } from "../../components/ui";

// The shared RecurringRule type has no template.accountId, but the API returns
// one and every posted occurrence moves that account's balance — edit mode has
// to be able to name it.
type Rule = RecurringRule & {
  template: RecurringRule["template"] & { accountId: string | null };
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function RecurringScreen() {
  const { authFetch } = useAuth();
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  // Set while the sheet is editing an existing rule rather than adding one.
  const [editing, setEditing] = useState<Rule | null>(null);
  // Rule id with an in-flight post/toggle — blocks double-taps that would
  // post the same occurrence twice.
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rRes, aRes] = await Promise.all([
        authFetch("/api/projects/expense-tracker/recurring"),
        authFetch("/api/projects/expense-tracker/accounts"),
      ]);
      const rData = await rRes.json().catch(() => ({}));
      const aData = await aRes.json().catch(() => ({}));
      setRules(rData.recurring ?? []);
      setAccounts(aData.accounts ?? []);
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
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await authFetch(`/api/projects/expense-tracker/recurring/${id}/post`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        Alert.alert("Error", data.error ?? "Failed to post");
      }
      await load();
    } catch {
      Alert.alert("Error", "Network error — the bill was not posted.");
    } finally {
      setBusyId(null);
    }
  }
  async function toggle(r: Rule) {
    if (busyId) return;
    setBusyId(r._id);
    try {
      const res = await authFetch(`/api/projects/expense-tracker/recurring/${r._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !r.active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        Alert.alert("Error", data.error ?? "Failed to update rule");
      }
      await load();
    } catch {
      Alert.alert("Error", "Network error — rule not updated.");
    } finally {
      setBusyId(null);
    }
  }
  function confirmDelete(r: Rule) {
    Alert.alert("Delete rule", "Already-posted transactions stay.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            const res = await authFetch(`/api/projects/expense-tracker/recurring/${r._id}`, { method: "DELETE" });
            if (!res.ok) throw new Error();
            load();
          } catch {
            Alert.alert("Error", "Couldn't delete the rule.");
          }
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
        <Pressable onPress={() => { setEditing(null); setShowAdd(true); }} className="rounded-lg bg-brand-600 px-3 py-1.5">
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
              onPress={() => { setEditing(r); setShowAdd(true); }}
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
                    {r.endDate ? ` · ends ${fmtDate(r.endDate)}` : ""}
                  </Text>
                </View>
                <Text className={`text-base font-semibold ${r.template.direction === "income" ? "text-emerald-400" : "text-zinc-100"}`}>
                  {r.template.direction === "income" ? "+" : ""}{formatMoney(r.template.amount, r.template.currency)}
                </Text>
              </View>
              <View className="mt-3 flex-row justify-end gap-4 border-t border-white/5 pt-2">
                {r.due && r.active && !r.autoPost && (
                  <Pressable onPress={() => post(r._id)} disabled={busyId !== null} hitSlop={6}>
                    <Text className={`text-xs font-semibold ${busyId === r._id ? "text-zinc-500" : "text-amber-300"}`}>
                      {busyId === r._id ? "Posting…" : "Post now"}
                    </Text>
                  </Pressable>
                )}
                <Pressable onPress={() => toggle(r)} disabled={busyId !== null} hitSlop={6}><Text className="text-xs font-medium text-zinc-400">{r.active ? "Pause" : "Resume"}</Text></Pressable>
                <Pressable onPress={() => confirmDelete(r)} hitSlop={6}><Text className="text-xs font-medium text-red-400">Delete</Text></Pressable>
              </View>
            </Pressable>
          ))
        )}
        {rules.length > 0 && <Text className="px-1 text-center text-[11px] text-zinc-600">Tap a rule to edit it · long-press to delete.</Text>}
      </ScrollView>

      <RuleSheet
        visible={showAdd}
        editing={editing}
        accounts={accounts}
        onClose={() => { setShowAdd(false); setEditing(null); }}
        onSaved={() => { setShowAdd(false); setEditing(null); load(); }}
      />
    </SafeAreaView>
  );
}

function RuleSheet({ visible, editing, accounts, onClose, onSaved }: {
  visible: boolean; editing: Rule | null; accounts: Account[];
  onClose: () => void; onSaved: () => void;
}) {
  const { authFetch } = useAuth();
  const [direction, setDirection] = useState<Direction>("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [cadence, setCadence] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [startDate, setStartDate] = useState(localISODate());
  const [endDate, setEndDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [picking, setPicking] = useState<"start" | "end" | null>(null);
  const [autoPost, setAutoPost] = useState(false);
  const [saving, setSaving] = useState(false);

  const categoryList = direction === "income" ? INCOME_CATEGORIES : CATEGORIES;
  // An archived account is missing from the picker list but the rule still
  // posts to it, so fall back to a neutral label instead of "no account".
  const editingAccountId = editing?.template.accountId ?? null;
  const editingAccount = editingAccountId
    ? accounts.find((a) => a._id === editingAccountId)?.name ?? "an account"
    : null;

  useEffect(() => {
    if (!visible) return;
    setPicking(null);
    if (editing) {
      setDirection(editing.template.direction);
      setAmount(String(editing.template.amount));
      setCurrency(editing.template.currency);
      setCategory(editing.template.category);
      setDescription(editing.template.description);
      setCadence(editing.cadence);
      setStartDate(editing.nextRunAt.slice(0, 10));
      setEndDate(editing.endDate ? editing.endDate.slice(0, 10) : "");
      setAutoPost(editing.autoPost);
      setAccountId(editing.template.accountId ?? "");
      return;
    }
    setDirection("expense");
    setAmount("");
    setCategory(CATEGORIES[0]);
    setDescription("");
    setCadence("monthly");
    setStartDate(localISODate());
    setEndDate("");
    setAutoPost(false);
    setAccountId("");
    authFetch("/api/projects/expense-tracker/prefs")
      .then((r) => r.json())
      .then((d) => d.prefs?.baseCurrency && setCurrency(d.prefs.baseCurrency))
      .catch(() => {});
  }, [visible, editing, authFetch]);

  function changeDirection(d: Direction) {
    setDirection(d);
    const list = d === "income" ? INCOME_CATEGORIES : CATEGORIES;
    setCategory((c) => ((list as readonly string[]).includes(c) ? c : list[0]));
  }

  async function submit() {
    const amt = parseAmount(amount);
    if (!amt || amt <= 0) return Alert.alert("Enter a valid amount");
    if (!description.trim()) return Alert.alert("Enter a description");
    // An end date before the first/next run leaves the rule with no occurrences
    // at all — the engine just retires it on the next sweep.
    if (endDate && endDate < startDate) {
      return Alert.alert(editing ? "End date is before the next run" : "End date is before the start date");
    }
    setSaving(true);
    try {
      const res = await authFetch(
        editing
          ? `/api/projects/expense-tracker/recurring/${editing._id}`
          : "/api/projects/expense-tracker/recurring",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          // Direction, currency, start date and account are fixed once a rule
          // exists — the update endpoint accepts none of them.
          body: JSON.stringify(
            editing
              ? {
                  amount: amt, category, description: description.trim(),
                  cadence, autoPost, endDate: endDate || null,
                }
              : {
                  amount: amt, currency, category, description: description.trim(),
                  direction, cadence, startDate, autoPost,
                  accountId: accountId || null,
                  endDate: endDate || null,
                }
          ),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed");
      }
      onSaved();
    } catch (e) {
      Alert.alert(
        editing ? "Couldn't update rule" : "Couldn't add rule",
        e instanceof Error ? e.message : ""
      );
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
            <Text className="text-base font-semibold text-zinc-100">
              {editing ? "Edit recurring rule" : "Add recurring rule"}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}><Text className="text-sm text-zinc-500">Close</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
            {editing ? (
              <View className="gap-1 rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-3">
                <Text className="text-xs text-zinc-300">
                  <Text className="capitalize">{editing.template.direction}</Text> · {editing.template.currency} · next {fmtDate(editing.nextRunAt)}
                </Text>
                <Text className="text-xs text-zinc-400">
                  Posts to {editingAccount ?? "no account"}
                </Text>
                <Text className="text-[11px] text-zinc-600">Delete and re-add the rule to change these.</Text>
              </View>
            ) : (
              <View className="flex-row gap-2">
                {(["expense", "income"] as const).map((d) => (
                  <Pressable key={d} onPress={() => changeDirection(d)} className={`flex-1 items-center rounded-xl border py-2.5 ${direction === d ? "border-brand-500/60 bg-brand-500/15" : "border-white/10 bg-zinc-900/40"}`}>
                    <Text className={`text-sm font-medium capitalize ${direction === d ? "text-brand-400" : "text-zinc-400"}`}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View className="gap-1.5">
              <Text className="text-[12px] uppercase tracking-wider text-zinc-500">Amount</Text>
              <Input value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor="#71717a"
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-lg text-zinc-100" />
            </View>

            {!editing && (
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
            )}

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

            {!editing && accounts.length > 0 && (
              <View className="gap-1.5">
                <Text className="text-[12px] uppercase tracking-wider text-zinc-500">Account</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  <Pressable onPress={() => setAccountId("")} className={chip(accountId === "")}>
                    <Text className={chipTxt(accountId === "")}>No account</Text>
                  </Pressable>
                  {accounts.map((a) => (
                    <Pressable key={a._id} onPress={() => setAccountId(a._id)} className={chip(accountId === a._id)}>
                      <Text className={chipTxt(accountId === a._id)}>{a.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text className="text-[11px] text-zinc-600">Each posted bill moves this account’s balance.</Text>
              </View>
            )}

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

            {!editing && (
              <View className="gap-1.5">
                <Text className="text-[12px] uppercase tracking-wider text-zinc-500">Starts on</Text>
                <Pressable onPress={() => setPicking("start")} className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3">
                  <Text className="text-zinc-100">{startDate}</Text>
                </Pressable>
              </View>
            )}

            <View className="gap-1.5">
              <View className="flex-row items-center justify-between">
                <Text className="text-[12px] uppercase tracking-wider text-zinc-500">Ends on</Text>
                {!!endDate && (
                  <Pressable onPress={() => setEndDate("")} hitSlop={8}><Text className="text-xs text-zinc-500">Clear</Text></Pressable>
                )}
              </View>
              <Pressable onPress={() => setPicking("end")} className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3">
                <Text className={endDate ? "text-zinc-100" : "text-zinc-500"}>{endDate || "No end date"}</Text>
              </Pressable>
              <Text className="text-[11px] text-zinc-600">Last day a bill can post — the rule pauses itself once it passes.</Text>
            </View>

            {picking && (
              <DateTimePicker
                value={new Date(picking === "end" && endDate ? endDate : startDate)}
                mode="date"
                onChange={(_, d) => {
                  const field = picking;
                  setPicking(null);
                  if (!d) return;
                  if (field === "end") setEndDate(localISODate(d));
                  else setStartDate(localISODate(d));
                }}
              />
            )}

            <View className="flex-row items-center justify-between rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-3">
              <Text className="text-sm text-zinc-300">Auto-post each period</Text>
              <Switch value={autoPost} onValueChange={setAutoPost} trackColor={{ true: "#6366f1" }} />
            </View>

            <GradientButton label={editing ? "Save changes" : "Add rule"} onPress={submit} loading={saving} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
    </Modal>
  );
}
