import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import type { Expense, ExpenseListResponse, Summary } from "../../lib/types";

type ViewMode = "all" | "personal" | "group";
const PAGE_SIZE = 25;

export default function Dashboard() {
  const { user, authFetch, logout } = useAuth();
  const router = useRouter();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [view, setView] = useState<ViewMode>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchExpenses = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: "1" });
    if (view !== "all") params.set("type", view);
    const summaryParams = new URLSearchParams({ scope: view });

    try {
      const [expRes, sumRes] = await Promise.all([
        authFetch(`/api/projects/expense-tracker/expenses?${params}`),
        authFetch(`/api/projects/expense-tracker/reports/summary?${summaryParams}`),
      ]);
      const expData: ExpenseListResponse = await expRes.json();
      const sumData: Summary = await sumRes.json();
      setExpenses(expData.expenses ?? []);
      setTotal(expData.total ?? 0);
      setTotalAmount(sumData.totalAmount ?? 0);
    } catch {
      // keep last good state on transient errors
    }
  }, [view, authFetch]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchExpenses().finally(() => setLoading(false));
    }, [fetchExpenses])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchExpenses();
    setRefreshing(false);
  }, [fetchExpenses]);

  function handleEdit(e: Expense) {
    router.push({
      pathname: "/add-expense",
      params: { expense: JSON.stringify(e) },
    });
  }

  function handleDelete(e: Expense) {
    Alert.alert("Delete expense", `Delete "${e.description}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await authFetch(`/api/projects/expense-tracker/expenses/${e._id}`, {
              method: "DELETE",
            });
            fetchExpenses();
          } catch {
            Alert.alert("Error", "Failed to delete expense");
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-[#05060a]" edges={["top"]}>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <View>
          <Text className="text-xl font-bold text-zinc-50">Expense Tracker</Text>
          <Text className="text-xs text-zinc-500">Hi, {user?.name}</Text>
        </View>
        <Pressable
          onPress={logout}
          className="rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-1.5"
        >
          <Text className="text-xs text-zinc-300">Logout</Text>
        </Pressable>
      </View>

      <FlatList
        data={expenses}
        keyExtractor={(e) => e._id}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366f1"
          />
        }
        ListHeaderComponent={
          <View className="mb-2 gap-4">
            <View className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <Text className="text-[11px] uppercase tracking-wider text-zinc-500">
                Total Expenses
              </Text>
              <Text className="mt-1 text-3xl font-bold text-zinc-50">
                ₹{totalAmount.toFixed(2)}
              </Text>
              <Text className="mt-0.5 text-xs text-zinc-500">
                {total} {total === 1 ? "entry" : "entries"} · {view}
              </Text>
            </View>

            <Pressable
              onPress={() => router.push("/add-expense")}
              className="flex-row items-center justify-center gap-2 rounded-xl bg-brand-600 py-3"
            >
              <Text className="text-base font-semibold text-white">+</Text>
              <Text className="text-sm font-semibold text-white">
                New Expense
              </Text>
            </Pressable>

            <View className="flex-row gap-2">
              {(["all", "personal", "group"] as const).map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setView(v)}
                  className={`rounded-lg border px-3 py-1.5 ${
                    view === v
                      ? "border-brand-500/60 bg-brand-500/15"
                      : "border-white/10 bg-zinc-900/40"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium capitalize ${
                      view === v ? "text-brand-400" : "text-zinc-400"
                    }`}
                  >
                    {v}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <ExpenseCard
            expense={item}
            onEdit={() => handleEdit(item)}
            onDelete={() => handleDelete(item)}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View className="items-center py-16">
              <ActivityIndicator color="#6366f1" />
            </View>
          ) : (
            <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-12">
              <Text className="text-sm text-zinc-400">No expenses yet.</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

function ExpenseCard({
  expense: e,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const splitNames =
    e.splitAmong && e.splitAmong.length > 0
      ? e.splitAmong.map((m) => m.name).join(", ")
      : null;

  return (
    <View className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-medium text-zinc-100" numberOfLines={1}>
            {e.description}
          </Text>
          <Text className="mt-0.5 text-xs text-zinc-500">
            {new Date(e.date).toLocaleDateString()} · {e.paidBy.name}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-base font-semibold text-zinc-100">
            ₹{e.amount.toFixed(2)}
          </Text>
          <View
            className={`mt-1 rounded-full px-2 py-0.5 ${
              e.type === "group" ? "bg-brand-500/15" : "bg-zinc-800/60"
            }`}
          >
            <Text
              className={`text-[10px] font-medium uppercase ${
                e.type === "group" ? "text-brand-400" : "text-zinc-400"
              }`}
            >
              {e.type}
            </Text>
          </View>
        </View>
      </View>

      <View className="mt-3 flex-row flex-wrap items-center gap-2">
        <View className="rounded-md border border-white/10 bg-zinc-900/60 px-2 py-0.5">
          <Text className="text-[11px] text-zinc-300">{e.category}</Text>
        </View>
        {splitNames && (
          <Text className="flex-1 text-[11px] text-zinc-500" numberOfLines={1}>
            Split: {splitNames}
          </Text>
        )}
      </View>

      <View className="mt-3 flex-row justify-end gap-4 border-t border-white/5 pt-3">
        <Pressable onPress={onEdit} hitSlop={8}>
          <Text className="text-xs font-medium text-zinc-400">Edit</Text>
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={8}>
          <Text className="text-xs font-medium text-red-400">Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}
