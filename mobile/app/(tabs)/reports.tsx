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
import { exportFullReportPdf } from "../../lib/pdf";
import { AppBackground } from "../../components/ui";
import { ReportBody } from "../../components/ReportBody";

type Scope = "all" | "personal" | "group";
type QuickRange =
  | "all"
  | "this-month"
  | "last-30"
  | "last-90"
  | "this-year"
  | "custom";

const QUICK: { id: QuickRange; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "this-month", label: "This month" },
  { id: "last-30", label: "Last 30d" },
  { id: "last-90", label: "Last 90d" },
  { id: "this-year", label: "This year" },
];

export function quickRangeToDates(r: QuickRange): { from: string; to: string } {
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
  const [quickRange, setQuickRange] = useState<QuickRange>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchSummary = useCallback(async () => {
    const params = new URLSearchParams({ settled: "all", scope });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/reports/summary?${params}`
      );
      setSummary((await res.json()) as Summary);
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

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <Text className="text-xl font-bold text-zinc-50">Reports</Text>
        {summary && summary.totalCount > 0 && (
          <Pressable
            onPress={async () => {
              setExporting(true);
              try {
                await exportFullReportPdf({
                  summary,
                  authFetch,
                  userName: user?.name,
                  dateFrom: dateFrom || undefined,
                  dateTo: dateTo || undefined,
                });
              } catch {
                // share cancelled / unavailable
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
        <View className="flex-row gap-2">
          {(["all", "personal", "group"] as const).map((s) => (
            <Chip key={s} label={s} active={scope === s} onPress={() => setScope(s)} />
          ))}
        </View>

        <View className="flex-row flex-wrap gap-2">
          {QUICK.map((q) => (
            <Chip key={q.id} label={q.label} active={quickRange === q.id} onPress={() => applyQuick(q.id)} />
          ))}
        </View>

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
            <Text className="text-sm text-zinc-400">No expenses for this range.</Text>
          </View>
        ) : (
          <ReportBody summary={summary} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export function DateField({
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
      <Text className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</Text>
      <Pressable
        onPress={onPress}
        className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3"
      >
        <Text className={value ? "text-zinc-100" : "text-zinc-500"}>{value || "Any"}</Text>
      </Pressable>
    </View>
  );
}

export function Chip({
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
        active ? "border-brand-500/60 bg-brand-500/15" : "border-white/10 bg-zinc-900/40"
      }`}
    >
      <Text className={`text-xs font-medium capitalize ${active ? "text-brand-400" : "text-zinc-400"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
