import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import {
  CATEGORIES,
  type Expense,
  type ExpenseListResponse,
  type Summary,
} from "../../lib/types";

type ViewMode = "all" | "personal" | "group";
type RangeKey = "all" | "month" | "30d" | "7d";
const PAGE_SIZE = 25;

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "month", label: "This month" },
  { key: "30d", label: "Last 30d" },
  { key: "7d", label: "Last 7d" },
];

function rangeToDateFrom(range: RangeKey): string | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  const days = range === "7d" ? 7 : 30;
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return from.toISOString();
}

export default function Dashboard() {
  const { user, authFetch, logout } = useAuth();
  const router = useRouter();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [view, setView] = useState<ViewMode>("all");
  const [category, setCategory] = useState<string>("");
  const [range, setRange] = useState<RangeKey>("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchExpenses = useCallback(async () => {
    const dateFrom = rangeToDateFrom(range);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      page: String(page),
    });
    if (view !== "all") params.set("type", view);
    if (category) params.set("category", category);
    if (dateFrom) params.set("dateFrom", dateFrom);

    const summaryParams = new URLSearchParams({ scope: view });
    if (category) summaryParams.set("category", category);
    if (dateFrom) summaryParams.set("dateFrom", dateFrom);

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
  }, [view, category, range, page, authFetch]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchExpenses().finally(() => setLoading(false));
    }, [fetchExpenses])
  );

  // Reset to first page whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [view, category, range]);

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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = view !== "all" || category !== "" || range !== "all";

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

            {/* Filters */}
            <View className="gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-[11px] uppercase tracking-wider text-zinc-500">
                  Filters
                </Text>
                {hasFilters && (
                  <Pressable
                    onPress={() => {
                      setView("all");
                      setCategory("");
                      setRange("all");
                    }}
                    hitSlop={8}
                  >
                    <Text className="text-xs text-zinc-400">Clear</Text>
                  </Pressable>
                )}
              </View>

              <View className="flex-row gap-2">
                {(["all", "personal", "group"] as const).map((v) => (
                  <Chip
                    key={v}
                    label={v}
                    active={view === v}
                    onPress={() => setView(v)}
                  />
                ))}
              </View>

              <View className="flex-row flex-wrap gap-2">
                {RANGES.map((r) => (
                  <Chip
                    key={r.key}
                    label={r.label}
                    active={range === r.key}
                    onPress={() => setRange(r.key)}
                  />
                ))}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                <Chip
                  label="All categories"
                  active={category === ""}
                  onPress={() => setCategory("")}
                />
                {CATEGORIES.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    active={category === c}
                    onPress={() => setCategory(c)}
                  />
                ))}
              </ScrollView>
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
              <Text className="text-sm text-zinc-400">No expenses found.</Text>
            </View>
          )
        }
        ListFooterComponent={
          total > PAGE_SIZE ? (
            <View className="mt-3 flex-row items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <PageBtn
                label="‹ Prev"
                disabled={page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
              />
              <Text className="text-xs text-zinc-400">
                Page {page} of {totalPages}
              </Text>
              <PageBtn
                label="Next ›"
                disabled={page >= totalPages}
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
              />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-lg border px-3 py-1.5 ${
        active
          ? "border-brand-500/60 bg-brand-500/15"
          : "border-white/10 bg-zinc-900/40"
      }`}
    >
      <Text
        className={`text-xs font-medium capitalize ${
          active ? "text-brand-400" : "text-zinc-400"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PageBtn({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`rounded-lg border px-3 py-1.5 ${
        disabled ? "border-white/5 opacity-40" : "border-white/10 bg-zinc-900/40"
      }`}
    >
      <Text className="text-xs font-medium text-zinc-300">{label}</Text>
    </Pressable>
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
