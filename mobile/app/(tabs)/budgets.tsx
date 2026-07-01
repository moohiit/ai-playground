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
import { useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth";
import { CATEGORIES } from "../../lib/types";
import { AppBackground, GradientButton, Input } from "../../components/ui";
import { formatMoney } from "../../lib/currency";
import { categoryColor } from "../../lib/colors";

type BudgetItem = {
  _id: string;
  scope: "overall" | "category";
  category: string | null;
  limit: number;
  spent: number;
  remaining: number;
  pct: number;
  status: "ok" | "warn" | "over";
};

const BAR: Record<BudgetItem["status"], string> = {
  ok: "#10b981",
  warn: "#f59e0b",
  over: "#ef4444",
};

function thisMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function BudgetsScreen() {
  const { authFetch } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [budgets, setBudgets] = useState<BudgetItem[]>([]);
  const [base, setBase] = useState("INR");
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      const [bRes, pRes] = await Promise.all([
        authFetch(`/api/projects/expense-tracker/budgets?month=${month}`),
        authFetch("/api/projects/expense-tracker/prefs"),
      ]);
      const bData = await bRes.json().catch(() => ({}));
      const pData = await pRes.json().catch(() => ({}));
      setBudgets(bData.budgets ?? []);
      if (pData.prefs?.baseCurrency) setBase(pData.prefs.baseCurrency);
    } catch {
      // keep last good
    }
  }, [authFetch, month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const overall = budgets.find((b) => b.scope === "overall");
  const cats = budgets.filter((b) => b.scope === "category");
  const used = new Set(cats.map((b) => b.category));

  function confirmDelete(b: BudgetItem) {
    Alert.alert("Delete budget", "Remove this budget?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await authFetch(`/api/projects/expense-tracker/budgets/${b._id}`, { method: "DELETE" });
          load();
        },
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <Text className="text-xl font-bold text-zinc-50">Budgets</Text>
        <Pressable onPress={() => setShowAdd(true)} className="rounded-lg bg-brand-600 px-3 py-1.5">
          <Text className="text-xs font-semibold text-white">+ Add</Text>
        </Pressable>
      </View>

      <View className="flex-row items-center justify-center gap-3 pb-2">
        <Pressable onPress={() => setMonth((m) => shiftMonth(m, -1))} hitSlop={8}>
          <Text className="text-xl text-zinc-400">‹</Text>
        </Pressable>
        <Text className="min-w-[150px] text-center text-sm font-semibold text-zinc-100">{monthLabel(month)}</Text>
        <Pressable onPress={() => setMonth((m) => (m < thisMonth() ? shiftMonth(m, 1) : m))} hitSlop={8} disabled={month >= thisMonth()}>
          <Text className={`text-xl ${month >= thisMonth() ? "text-zinc-700" : "text-zinc-400"}`}>›</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        {budgets.length === 0 ? (
          <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-12">
            <Text className="text-sm text-zinc-400">No budgets yet.</Text>
            <Text className="mt-1 px-8 text-center text-xs text-zinc-500">
              Add an overall monthly cap or per-category budgets to track overspending.
            </Text>
          </View>
        ) : (
          <>
            {overall && <BudgetCard b={overall} base={base} onLongPress={() => confirmDelete(overall)} highlight />}
            {cats.map((b) => (
              <BudgetCard key={b._id} b={b} base={base} onLongPress={() => confirmDelete(b)} />
            ))}
            <Text className="px-1 text-center text-[11px] text-zinc-600">Long-press a budget to delete it.</Text>
          </>
        )}
      </ScrollView>

      <AddBudgetSheet
        visible={showAdd}
        hasOverall={!!overall}
        used={used}
        onClose={() => setShowAdd(false)}
        onSaved={() => { setShowAdd(false); load(); }}
      />
    </SafeAreaView>
  );
}

function BudgetCard({ b, base, onLongPress, highlight }: { b: BudgetItem; base: string; onLongPress: () => void; highlight?: boolean }) {
  const title = b.scope === "overall" ? "Overall" : b.category ?? "Category";
  const color = b.scope === "category" && b.category ? categoryColor(b.category) : undefined;
  const widthPct = Math.min(100, Math.round(b.pct * 100));
  return (
    <Pressable
      onLongPress={onLongPress}
      className={`rounded-2xl border p-4 ${highlight ? "border-brand-500/30 bg-brand-500/[0.06]" : "border-white/10 bg-white/[0.04]"}`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          {color && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />}
          <Text className="font-semibold text-zinc-100">{title}</Text>
        </View>
        <Text className="text-xs font-medium" style={{ color: BAR[b.status] }}>
          {Math.round(b.pct * 100)}%
        </Text>
      </View>
      <View className="mt-2 flex-row items-end justify-between">
        <Text className="text-base font-bold text-zinc-100">
          {formatMoney(b.spent, base)}
          <Text className="text-xs font-normal text-zinc-500"> of {formatMoney(b.limit, base)}</Text>
        </Text>
        <Text className={`text-xs ${b.remaining < 0 ? "text-red-400" : "text-zinc-400"}`}>
          {b.remaining < 0 ? `${formatMoney(Math.abs(b.remaining), base)} over` : `${formatMoney(b.remaining, base)} left`}
        </Text>
      </View>
      <View className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
        <View style={{ width: `${widthPct}%`, height: "100%", backgroundColor: BAR[b.status], borderRadius: 999 }} />
      </View>
    </Pressable>
  );
}

function AddBudgetSheet({ visible, hasOverall, used, onClose, onSaved }: {
  visible: boolean; hasOverall: boolean; used: Set<string | null>; onClose: () => void; onSaved: () => void;
}) {
  const { authFetch } = useAuth();
  const available = CATEGORIES.filter((c) => !used.has(c));
  const [scope, setScope] = useState<"overall" | "category">("category");
  const [category, setCategory] = useState<string>(available[0] ?? "");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setScope(hasOverall ? "category" : "overall");
      setCategory(available[0] ?? "");
      setAmount("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return Alert.alert("Enter a valid amount");
    if (scope === "category" && !category) return Alert.alert("Pick a category");
    setSaving(true);
    try {
      const res = await authFetch("/api/projects/expense-tracker/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, category: scope === "category" ? category : undefined, amount: amt }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed");
      }
      onSaved();
    } catch (e) {
      Alert.alert("Couldn't add budget", e instanceof Error ? e.message : "");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Pressable className="rounded-t-3xl border-t border-white/10 bg-[#0a0b14] p-5" onPress={(e) => e.stopPropagation()}>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-base font-semibold text-zinc-100">Add monthly budget</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text className="text-sm text-zinc-500">Close</Text></Pressable>
          </View>
          <View className="gap-3">
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => !hasOverall && setScope("overall")}
                disabled={hasOverall}
                className={`flex-1 items-center rounded-xl border py-2.5 ${scope === "overall" ? "border-brand-500/60 bg-brand-500/15" : "border-white/10 bg-zinc-900/40"} ${hasOverall ? "opacity-40" : ""}`}
              >
                <Text className={`text-sm font-medium ${scope === "overall" ? "text-brand-400" : "text-zinc-400"}`}>
                  Overall {hasOverall ? "(exists)" : ""}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setScope("category")}
                className={`flex-1 items-center rounded-xl border py-2.5 ${scope === "category" ? "border-brand-500/60 bg-brand-500/15" : "border-white/10 bg-zinc-900/40"}`}
              >
                <Text className={`text-sm font-medium ${scope === "category" ? "text-brand-400" : "text-zinc-400"}`}>Category</Text>
              </Pressable>
            </View>

            {scope === "category" && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {available.length === 0 ? (
                  <Text className="text-xs text-zinc-500">All categories already have budgets.</Text>
                ) : (
                  available.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setCategory(c)}
                      className={`rounded-lg border px-3 py-1.5 ${category === c ? "border-brand-500/60 bg-brand-500/15" : "border-white/10 bg-zinc-900/40"}`}
                    >
                      <Text className={`text-xs font-medium ${category === c ? "text-brand-400" : "text-zinc-400"}`}>{c}</Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            )}

            <Input
              value={amount}
              onChangeText={setAmount}
              placeholder="Monthly limit"
              keyboardType="decimal-pad"
              placeholderTextColor="#71717a"
              className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
            />

            <GradientButton label="Add budget" onPress={submit} loading={saving} />
          </View>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
    </Modal>
  );
}
