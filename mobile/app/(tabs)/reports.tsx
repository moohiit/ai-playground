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
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth";
import type { Summary } from "../../lib/types";
import { Donut } from "../../components/Donut";
import { exportSummaryPdf } from "../../lib/pdf";

type Scope = "all" | "personal" | "group";
type QuickRange =
  | "all"
  | "this-month"
  | "last-30"
  | "last-90"
  | "this-year"
  | "custom";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COLORS = [
  "#818cf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa",
  "#f472b6", "#22d3ee", "#fb923c", "#2dd4bf", "#c084fc",
];

const QUICK: { id: QuickRange; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "this-month", label: "This month" },
  { id: "last-30", label: "Last 30d" },
  { id: "last-90", label: "Last 90d" },
  { id: "this-year", label: "This year" },
];

const fmt = (n: number) => `₹${n.toFixed(2)}`;

function quickRangeToDates(r: QuickRange): { from: string; to: string } {
  if (r === "all" || r === "custom") return { from: "", to: "" };
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const start = new Date(now);
  if (r === "this-month") start.setDate(1);
  else if (r === "last-30") start.setDate(start.getDate() - 30);
  else if (r === "last-90") start.setDate(start.getDate() - 90);
  else if (r === "this-year") start.setMonth(0, 1);
  return { from: start.toISOString().slice(0, 10), to };
}

export default function ReportsTab() {
  const { user, authFetch } = useAuth();
  const [scope, setScope] = useState<Scope>("all");
  const [exporting, setExporting] = useState(false);
  const [quickRange, setQuickRange] = useState<QuickRange>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSummary = useCallback(async () => {
    const params = new URLSearchParams({ settled: "all", scope });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/reports/summary?${params}`
      );
      const data: Summary = await res.json();
      setSummary(data);
    } catch {
      // keep last good state
    }
  }, [scope, dateFrom, dateTo, authFetch]);

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

  function applyQuick(r: QuickRange) {
    setQuickRange(r);
    const { from, to } = quickRangeToDates(r);
    setDateFrom(from);
    setDateTo(to);
  }

  function onPickDate(_: unknown, date?: Date) {
    const which = picker;
    setPicker(null);
    if (!date || !which) return;
    const iso = date.toISOString().slice(0, 10);
    if (which === "from") setDateFrom(iso);
    else setDateTo(iso);
    setQuickRange("custom");
  }

  const maxCat = summary?.byCategory?.[0]?.total ?? 0;
  const maxDow = Math.max(...(summary?.byDayOfWeek?.map((d) => d.total) ?? [0]), 1);
  const maxMonth = Math.max(...(summary?.byMonth?.map((m) => m.total) ?? [0]), 1);
  const maxGroup = Math.max(...(summary?.byGroup?.map((g) => g.total) ?? [0]), 1);

  return (
    <SafeAreaView className="flex-1 bg-[#05060a]" edges={["top"]}>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <Text className="text-xl font-bold text-zinc-50">Reports</Text>
        {summary && summary.totalCount > 0 && (
          <Pressable
            onPress={async () => {
              setExporting(true);
              try {
                await exportSummaryPdf({
                  summary,
                  userName: user?.name,
                  dateFrom: dateFrom || undefined,
                  dateTo: dateTo || undefined,
                });
              } catch {
                // share sheet cancelled or unavailable
              } finally {
                setExporting(false);
              }
            }}
            disabled={exporting}
            className="rounded-lg border border-brand-500/50 bg-brand-500/10 px-3 py-1.5"
          >
            <Text className="text-xs font-semibold text-brand-400">
              {exporting ? "…" : "Export PDF"}
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 14 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
        }
      >
        {/* Scope */}
        <View className="flex-row gap-2">
          {(["all", "personal", "group"] as const).map((s) => (
            <Chip key={s} label={s} active={scope === s} onPress={() => setScope(s)} />
          ))}
        </View>

        {/* Quick ranges */}
        <View className="flex-row flex-wrap gap-2">
          {QUICK.map((q) => (
            <Chip
              key={q.id}
              label={q.label}
              active={quickRange === q.id}
              onPress={() => applyQuick(q.id)}
            />
          ))}
        </View>

        {/* Custom date range */}
        <View className="flex-row gap-3">
          <DateField label="From" value={dateFrom} onPress={() => setPicker("from")} />
          <DateField label="To" value={dateTo} onPress={() => setPicker("to")} />
        </View>

        {picker && (
          <DateTimePicker
            value={
              picker === "from" && dateFrom
                ? new Date(dateFrom)
                : picker === "to" && dateTo
                ? new Date(dateTo)
                : new Date()
            }
            mode="date"
            onChange={onPickDate}
          />
        )}

        {loading && !summary ? (
          <View className="items-center py-16">
            <ActivityIndicator color="#6366f1" />
          </View>
        ) : !summary || summary.totalCount === 0 ? (
          <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-12">
            <Text className="text-sm text-zinc-400">
              No expenses for this range.
            </Text>
          </View>
        ) : (
          <>
            {/* Hero stats */}
            <View className="flex-row flex-wrap gap-3">
              <Stat label="Total" value={fmt(summary.totalAmount)} hint={`${summary.totalCount} entries`} />
              <Stat label="My share" value={fmt(summary.myShare)} />
              <Stat label="Paid by me" value={fmt(summary.paidByMe)} />
              <Stat label="Paid by others" value={fmt(summary.paidByOthers)} />
              <Stat label="Avg / day" value={fmt(summary.averagePerDay)} hint={`${summary.daysCovered} days`} />
              <Stat label="Avg / txn" value={fmt(summary.averagePerTransaction)} />
            </View>

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
                  {summary.largest.category} · {summary.largest.paidBy} ·{" "}
                  {new Date(summary.largest.date).toLocaleDateString()}
                </Text>
              </Panel>
            )}

            {/* Personal vs Group (all scope) */}
            {scope === "all" &&
              (summary.personalTotal > 0 || summary.groupTotal > 0) && (
                <Panel title="Personal vs Group">
                  <DonutWithLegend
                    data={[
                      { label: "Personal", value: summary.personalTotal, color: "#34d399" },
                      { label: "Group", value: summary.groupTotal, color: "#818cf8" },
                    ].filter((d) => d.value > 0)}
                  />
                </Panel>
              )}

            {/* Day of week */}
            {summary.byDayOfWeek.some((d) => d.total > 0) && (
              <Panel title="Spending by day of week">
                <View className="mt-1 h-28 flex-row items-end justify-between gap-1.5">
                  {summary.byDayOfWeek.map((d) => (
                    <View key={d.day} className="flex-1 items-center gap-1">
                      <View className="w-full justify-end" style={{ height: 80 }}>
                        <View
                          className="w-full rounded-t bg-cyan-500"
                          style={{ height: Math.max(2, (d.total / maxDow) * 80) }}
                        />
                      </View>
                      <Text className="text-[9px] text-zinc-500">{DOW[d.day]}</Text>
                    </View>
                  ))}
                </View>
              </Panel>
            )}

            {/* Top groups */}
            {scope !== "personal" && summary.byGroup.length > 0 && (
              <Panel title="Top groups">
                <View className="gap-2.5">
                  {summary.byGroup.map((g) => (
                    <View key={g.groupId}>
                      <View className="flex-row justify-between">
                        <Text className="text-xs text-zinc-300">{g.groupName}</Text>
                        <Text className="text-xs text-zinc-300">
                          {fmt(g.total)}{" "}
                          <Text className="text-fuchsia-300">({fmt(g.myShare)})</Text>
                        </Text>
                      </View>
                      <Bar pct={(g.total / maxGroup) * 100} />
                    </View>
                  ))}
                </View>
                <Text className="mt-2 text-[10px] text-zinc-600">
                  total (your share)
                </Text>
              </Panel>
            )}

            {/* By category donut */}
            {summary.byCategory.length > 0 && (
              <Panel title="By category">
                <DonutWithLegend
                  data={summary.byCategory.map((c, i) => ({
                    label: c.category,
                    value: c.total,
                    color: COLORS[i % COLORS.length],
                  }))}
                />
              </Panel>
            )}

            {/* Monthly trend */}
            {summary.byMonth.length > 0 && (
              <Panel title="Monthly trend">
                <View className="gap-2.5">
                  {summary.byMonth.map((m) => (
                    <View key={`${m.year}-${m.month}`}>
                      <View className="flex-row justify-between">
                        <Text className="text-xs text-zinc-400">
                          {MONTHS[m.month - 1]} {m.year}
                        </Text>
                        <Text className="text-xs font-medium text-zinc-200">
                          {fmt(m.total)}{" "}
                          <Text className="text-zinc-600">({m.count})</Text>
                        </Text>
                      </View>
                      <Bar pct={(m.total / maxMonth) * 100} color="bg-fuchsia-500" />
                    </View>
                  ))}
                </View>
              </Panel>
            )}

            {/* Category breakdown with % */}
            {summary.byCategory.length > 0 && (
              <Panel title="Category breakdown">
                <View className="gap-2.5">
                  {summary.byCategory.map((c, i) => {
                    const pct = (c.total / summary.totalAmount) * 100;
                    return (
                      <View key={c.category}>
                        <View className="flex-row justify-between">
                          <Text className="text-xs text-zinc-300">
                            {c.category}{" "}
                            <Text className="text-zinc-600">({c.count})</Text>
                          </Text>
                          <Text className="text-xs text-zinc-300">
                            {fmt(c.total)} · {pct.toFixed(1)}%
                          </Text>
                        </View>
                        <Bar
                          pct={maxCat > 0 ? (c.total / maxCat) * 100 : 0}
                          colorHex={COLORS[i % COLORS.length]}
                        />
                      </View>
                    );
                  })}
                </View>
              </Panel>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DonutWithLegend({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  if (data.length === 0)
    return <Text className="text-xs text-zinc-500">No data</Text>;
  return (
    <View className="items-center gap-4">
      <Donut data={data.map((d) => ({ value: d.value, color: d.color }))} />
      <View className="w-full flex-row flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((d) => (
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
  );
}

function Bar({
  pct,
  color = "bg-brand-500",
  colorHex,
}: {
  pct: number;
  color?: string;
  colorHex?: string;
}) {
  return (
    <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
      <View
        className={colorHex ? "h-full rounded-full" : `h-full rounded-full ${color}`}
        style={
          colorHex
            ? { width: `${Math.min(100, pct)}%`, backgroundColor: colorHex }
            : { width: `${Math.min(100, pct)}%` }
        }
      />
    </View>
  );
}

function DateField({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <View className="flex-1 gap-1.5">
      <Text className="text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </Text>
      <Pressable
        onPress={onPress}
        className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3"
      >
        <Text className={value ? "text-zinc-100" : "text-zinc-500"}>
          {value || "Any"}
        </Text>
      </Pressable>
    </View>
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

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View className="min-w-[30%] flex-1 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <Text className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </Text>
      <Text className="mt-1 text-lg font-bold text-zinc-50">{value}</Text>
      {hint && <Text className="mt-0.5 text-[10px] text-zinc-500">{hint}</Text>}
    </View>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <Text className="mb-3 text-sm font-semibold text-zinc-100">{title}</Text>
      {children}
    </View>
  );
}
