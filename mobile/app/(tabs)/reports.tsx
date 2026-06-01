import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth";
import type { Summary } from "../../lib/types";

type Scope = "all" | "personal" | "group";
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function ReportsTab() {
  const { authFetch } = useAuth();
  const [scope, setScope] = useState<Scope>("all");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/reports/summary?scope=${scope}`
      );
      const data: Summary = await res.json();
      setSummary(data);
    } catch {
      // keep last good state
    }
  }, [scope, authFetch]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchSummary().finally(() => setLoading(false));
    }, [fetchSummary])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSummary();
    setRefreshing(false);
  }, [fetchSummary]);

  const maxCat = summary?.byCategory?.[0]?.total ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-[#05060a]" edges={["top"]}>
      <View className="px-5 pb-2 pt-2">
        <Text className="text-xl font-bold text-zinc-50">Reports</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366f1"
          />
        }
      >
        <View className="flex-row gap-2">
          {(["all", "personal", "group"] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setScope(s)}
              className={`rounded-lg border px-3 py-1.5 ${
                scope === s
                  ? "border-brand-500/60 bg-brand-500/15"
                  : "border-white/10 bg-zinc-900/40"
              }`}
            >
              <Text
                className={`text-xs font-medium capitalize ${
                  scope === s ? "text-brand-400" : "text-zinc-400"
                }`}
              >
                {s}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading && !summary ? (
          <View className="items-center py-16">
            <ActivityIndicator color="#6366f1" />
          </View>
        ) : !summary || summary.totalCount === 0 ? (
          <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-12">
            <Text className="text-sm text-zinc-400">No data for this scope.</Text>
          </View>
        ) : (
          <>
            <View className="flex-row flex-wrap gap-3">
              <Stat label="Total" value={`₹${summary.totalAmount.toFixed(2)}`} />
              <Stat label="My share" value={`₹${summary.myShare.toFixed(2)}`} />
              <Stat label="Paid by me" value={`₹${summary.paidByMe.toFixed(2)}`} />
              <Stat
                label="Paid by others"
                value={`₹${summary.paidByOthers.toFixed(2)}`}
              />
              <Stat
                label="Avg / day"
                value={`₹${summary.averagePerDay.toFixed(2)}`}
              />
              <Stat
                label="Avg / txn"
                value={`₹${summary.averagePerTransaction.toFixed(2)}`}
              />
            </View>

            {summary.largest && (
              <View className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <Text className="text-[11px] uppercase tracking-wider text-zinc-500">
                  Largest expense
                </Text>
                <View className="mt-1 flex-row items-center justify-between">
                  <Text className="flex-1 font-medium text-zinc-100" numberOfLines={1}>
                    {summary.largest.description}
                  </Text>
                  <Text className="font-semibold text-zinc-100">
                    ₹{summary.largest.amount.toFixed(2)}
                  </Text>
                </View>
                <Text className="mt-0.5 text-xs text-zinc-500">
                  {summary.largest.category} · {summary.largest.paidBy} ·{" "}
                  {new Date(summary.largest.date).toLocaleDateString()}
                </Text>
              </View>
            )}

            {summary.byCategory.length > 0 && (
              <View className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <Text className="mb-3 text-sm font-semibold text-zinc-100">
                  By category
                </Text>
                <View className="gap-2.5">
                  {summary.byCategory.map((c) => (
                    <View key={c.category}>
                      <View className="flex-row justify-between">
                        <Text className="text-xs text-zinc-300">{c.category}</Text>
                        <Text className="text-xs font-medium text-zinc-300">
                          ₹{c.total.toFixed(2)}
                        </Text>
                      </View>
                      <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                        <View
                          className="h-full rounded-full bg-brand-500"
                          style={{
                            width: `${maxCat > 0 ? (c.total / maxCat) * 100 : 0}%`,
                          }}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {summary.byMonth.length > 0 && (
              <View className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <Text className="mb-3 text-sm font-semibold text-zinc-100">
                  By month
                </Text>
                <View className="gap-2">
                  {summary.byMonth.map((m) => (
                    <View
                      key={`${m.year}-${m.month}`}
                      className="flex-row justify-between"
                    >
                      <Text className="text-xs text-zinc-400">
                        {MONTHS[m.month - 1]} {m.year}
                      </Text>
                      <Text className="text-xs font-medium text-zinc-200">
                        ₹{m.total.toFixed(2)}{" "}
                        <Text className="text-zinc-600">({m.count})</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[30%] flex-1 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <Text className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </Text>
      <Text className="mt-1 text-lg font-bold text-zinc-50">{value}</Text>
    </View>
  );
}
