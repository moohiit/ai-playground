import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import type { Summary } from "../../lib/types";
import { Donut } from "../../components/Donut";
import { AppBackground, GradientButton, GradientHero } from "../../components/ui";
import { categoryColor } from "../../lib/colors";

const fmt = (n: number) => `₹${n.toFixed(2)}`;
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function Dashboard() {
  const { user, authFetch, logout } = useAuth();
  const router = useRouter();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [personalActive, setPersonalActive] = useState<Summary | null>(null);
  const [groupActive, setGroupActive] = useState<Summary | null>(null);
  const [lastPersonalSettle, setLastPersonalSettle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settling, setSettling] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const [allRes, pActiveRes, gActiveRes, histRes] = await Promise.all([
        authFetch("/api/projects/expense-tracker/reports/summary?scope=all&settled=all"),
        authFetch("/api/projects/expense-tracker/reports/summary?scope=personal&settled=false"),
        authFetch("/api/projects/expense-tracker/reports/summary?scope=group&settled=false"),
        authFetch("/api/projects/expense-tracker/personal/history"),
      ]);
      setSummary((await allRes.json().catch(() => null)) as Summary);
      setPersonalActive((await pActiveRes.json().catch(() => null)) as Summary);
      setGroupActive((await gActiveRes.json().catch(() => null)) as Summary);
      const hist = await histRes.json().catch(() => ({}));
      setLastPersonalSettle(hist.history?.[0]?.settledAt ?? null);
    } catch {
      // keep last good state
    }
  }, [authFetch]);

  function handleSettlePersonal() {
    const count = personalActive?.totalCount ?? 0;
    if (count === 0) return;
    Alert.alert(
      "Settle personal expenses",
      `Mark all ${count} active personal ${count === 1 ? "expense" : "expenses"} as settled? They move to settled history.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Settle",
          onPress: async () => {
            setSettling(true);
            try {
              const res = await authFetch(
                "/api/projects/expense-tracker/personal/settle",
                { method: "POST" }
              );
              const data = await res.json();
              if (!res.ok) throw new Error(data.error ?? "Settle failed");
              Alert.alert("Settled", `Cleared ${data.expenseCount} personal expenses.`);
              await fetchSummary();
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : "Failed");
            } finally {
              setSettling(false);
            }
          },
        },
      ]
    );
  }

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

  // "This month" from the byMonth series.
  const now = new Date();
  const thisMonth =
    summary?.byMonth?.find(
      (m) => m.year === now.getFullYear() && m.month === now.getMonth() + 1
    )?.total ?? 0;

  const topCats = summary?.byCategory?.slice(0, 5) ?? [];
  const maxCat = topCats[0]?.total ?? 0;
  const pvg = summary
    ? [
        { label: "Personal", value: summary.personalTotal, color: "#34d399" },
        { label: "Group", value: summary.groupTotal, color: "#818cf8" },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <View>
          <Text className="text-xl font-bold text-zinc-50">Dashboard</Text>
          <Text className="text-xs text-zinc-500">Hi, {user?.name}</Text>
        </View>
        <Pressable
          onPress={logout}
          className="rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-1.5"
        >
          <Text className="text-xs text-zinc-300">Logout</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 14 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
        }
      >
        {loading && !summary ? (
          <View className="items-center py-16">
            <ActivityIndicator color="#6366f1" />
          </View>
        ) : !summary ? (
          <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-12">
            <Text className="text-sm text-zinc-400">Couldn’t load analytics.</Text>
          </View>
        ) : (
          <>
            {/* Hero */}
            <Animated.View entering={FadeInDown.duration(400)}>
              <GradientHero>
                <Text className="text-[13px] uppercase tracking-wider text-zinc-300">
                  Total Spend (all time)
                </Text>
                <Text className="mt-1 text-4xl font-extrabold text-white">
                  {fmt(summary.totalAmount)}
                </Text>
                <Text className="mt-0.5 text-xs text-zinc-300">
                  {summary.totalCount} entries · {summary.daysCovered} days
                </Text>
              </GradientHero>
            </Animated.View>

            {/* Quick actions */}
            <Animated.View
              entering={FadeInDown.duration(400).delay(60)}
              style={{ flexDirection: "row", gap: 12 }}
            >
              <View className="flex-1">
                <GradientButton
                  label="+ New Expense"
                  onPress={() => router.push("/add-expense")}
                />
              </View>
              <Pressable
                onPress={() => router.push("/expenses")}
                className="flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] py-3"
              >
                <Text className="text-sm font-semibold text-zinc-200">View all →</Text>
              </Pressable>
            </Animated.View>

            {/* Stat tiles */}
            <Animated.View
              entering={FadeInDown.duration(400).delay(120)}
              style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
            >
              <Stat label="My share" value={fmt(summary.myShare)} />
              <Stat label="This month" value={fmt(thisMonth)} />
              <Stat label="Paid by me" value={fmt(summary.paidByMe)} />
              <Stat label="Avg / day" value={fmt(summary.averagePerDay)} />
            </Animated.View>

            {/* Active vs Total breakdown */}
            <Panel title="Active vs total">
              <View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-zinc-100">Personal</Text>
                  {(personalActive?.totalCount ?? 0) > 0 && (
                    <Pressable
                      onPress={handleSettlePersonal}
                      disabled={settling}
                      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1"
                    >
                      <Text className="text-[13px] font-semibold text-amber-300">
                        {settling ? "Settling…" : "Settle"}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <View className="mt-1.5 flex-row gap-3">
                  <MiniStat
                    label="Active"
                    value={fmt(personalActive?.totalAmount ?? 0)}
                    hint={`${personalActive?.totalCount ?? 0} entries${
                      lastPersonalSettle ? ` · since ${shortDate(lastPersonalSettle)}` : ""
                    }`}
                  />
                  <MiniStat label="Total" value={fmt(summary.personalTotal)} />
                </View>
              </View>

              <View className="my-3 h-px bg-white/5" />

              <View>
                <Text className="text-sm font-semibold text-zinc-100">Group</Text>
                <View className="mt-1.5 flex-row gap-3">
                  <MiniStat
                    label="Active"
                    value={fmt(groupActive?.totalAmount ?? 0)}
                    hint={`${groupActive?.totalCount ?? 0} entries`}
                  />
                  <MiniStat label="Total" value={fmt(summary.groupTotal)} />
                </View>
              </View>
            </Panel>

            {summary.largest && (
              <Panel title="Largest expense">
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 font-medium text-zinc-100" numberOfLines={1}>
                    {summary.largest.description}
                  </Text>
                  <Text className="font-semibold text-zinc-100">
                    {fmt(summary.largest.amount)}
                  </Text>
                </View>
                <Text className="mt-0.5 text-xs text-zinc-500">
                  {summary.largest.category} ·{" "}
                  {new Date(summary.largest.date).toLocaleDateString()}
                </Text>
              </Panel>
            )}

            {/* Personal vs Group */}
            {pvg.length > 0 && (
              <Panel title="Personal vs Group">
                <View className="items-center gap-4">
                  <Donut data={pvg.map((d) => ({ value: d.value, color: d.color }))} size={150} />
                  <View className="w-full flex-row justify-center gap-5">
                    {pvg.map((d) => (
                      <View key={d.label} className="flex-row items-center gap-1.5">
                        <View
                          style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.color }}
                        />
                        <Text className="text-xs text-zinc-400">{d.label}</Text>
                        <Text className="text-xs text-zinc-300">{fmt(d.value)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Panel>
            )}

            {/* Top categories */}
            {topCats.length > 0 && (
              <Panel title="Top categories">
                <View className="gap-2.5">
                  {topCats.map((c) => (
                    <View key={c.category}>
                      <View className="flex-row justify-between">
                        <Text className="text-xs text-zinc-300">{c.category}</Text>
                        <Text className="text-xs text-zinc-300">{fmt(c.total)}</Text>
                      </View>
                      <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                        <View
                          className="h-full rounded-full"
                          style={{
                            width: `${maxCat > 0 ? (c.total / maxCat) * 100 : 0}%`,
                            backgroundColor: categoryColor(c.category),
                          }}
                        />
                      </View>
                    </View>
                  ))}
                </View>
                <Pressable onPress={() => router.push("/reports")} className="mt-3">
                  <Text className="text-xs font-medium text-brand-400">
                    Full reports →
                  </Text>
                </Pressable>
              </Panel>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const STAT_ACCENTS = ["#818cf8", "#34d399", "#fbbf24", "#f472b6"];

function Stat({ label, value }: { label: string; value: string }) {
  // Deterministic accent per label so tiles get varied color without randomness.
  const accent =
    STAT_ACCENTS[
      Math.abs(label.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) %
        STAT_ACCENTS.length
    ];
  return (
    <View className="min-w-[45%] flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accent }} />
      <Text className="text-[12px] uppercase tracking-wider text-zinc-500">
        {label}
      </Text>
      <Text className="mt-1 text-lg font-bold text-zinc-50">{value}</Text>
    </View>
  );
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View className="flex-1 rounded-xl border border-white/10 bg-zinc-950/40 p-3">
      <Text className="text-[12px] uppercase tracking-wider text-zinc-500">{label}</Text>
      <Text className="mt-0.5 text-base font-bold text-zinc-50">{value}</Text>
      {hint && <Text className="mt-0.5 text-[12px] text-zinc-500">{hint}</Text>}
    </View>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(400).delay(160)}>
      <View className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <Text className="mb-3 text-sm font-semibold text-zinc-100">{title}</Text>
        {children}
      </View>
    </Animated.View>
  );
}
