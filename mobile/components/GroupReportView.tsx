import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../lib/auth";
import type { Summary } from "../lib/types";
import { exportGroupReportPdf } from "../lib/pdf";
import { ReportBody } from "./ReportBody";
import { Chip, DateField, quickRangeToDates } from "../app/(tabs)/reports";

type Show = "false" | "true" | "all";
type QuickRange =
  | "all"
  | "this-month"
  | "last-30"
  | "last-90"
  | "this-year"
  | "custom";

const SHOWS: { id: Show; label: string; sub: string }[] = [
  { id: "false", label: "Unsettled", sub: "Active only" },
  { id: "true", label: "Settled", sub: "Past settled" },
  { id: "all", label: "All", sub: "Everything" },
];

const QUICK: { id: QuickRange; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "this-month", label: "This month" },
  { id: "last-30", label: "Last 30d" },
  { id: "last-90", label: "Last 90d" },
  { id: "this-year", label: "This year" },
];

export function GroupReportView({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName: string;
}) {
  const { user, authFetch } = useAuth();
  const [show, setShow] = useState<Show>("all");
  const [quickRange, setQuickRange] = useState<QuickRange>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchSummary = useCallback(async () => {
    const params = new URLSearchParams({ groupId, settled: show });
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
  }, [groupId, show, dateFrom, dateTo, authFetch]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchSummary().finally(() => setLoading(false));
    }, [fetchSummary])
  );

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

  async function handleExport() {
    setExporting(true);
    try {
      if (!summary) return;
      await exportGroupReportPdf({
        summary,
        authFetch,
        groupId,
        groupName,
        userName: user?.name,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
    } catch {
      // share cancelled / unavailable
    } finally {
      setExporting(false);
    }
  }

  return (
    <View className="gap-4">
      {/* Filters card */}
      <View className="gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-[13px] uppercase tracking-wider text-zinc-500">
            Filters
          </Text>
          {summary && summary.totalCount > 0 && (
            <Pressable
              onPress={handleExport}
              disabled={exporting}
              className="rounded-lg border border-brand-500/50 bg-brand-500/10 px-3 py-1.5"
            >
              <Text className="text-xs font-semibold text-brand-400">
                {exporting ? "Exporting…" : "Export PDF"}
              </Text>
            </Pressable>
          )}
        </View>

        <View className="gap-2">
          <Text className="text-[12px] uppercase tracking-wider text-zinc-500">
            Show
          </Text>
          <View className="flex-row gap-2">
            {SHOWS.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setShow(s.id)}
                className={`flex-1 rounded-xl border px-2 py-2 ${
                  show === s.id
                    ? "border-brand-500/60 bg-brand-500/10"
                    : "border-white/10 bg-zinc-900/40"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    show === s.id ? "text-brand-300" : "text-zinc-300"
                  }`}
                >
                  {s.label}
                </Text>
                <Text className="mt-0.5 text-[11px] text-zinc-500">{s.sub}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-[12px] uppercase tracking-wider text-zinc-500">
            Time range
          </Text>
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
        </View>

        <View className="flex-row gap-3">
          <DateField label="From" value={dateFrom} onPress={() => setPicker("from")} />
          <DateField label="To" value={dateTo} onPress={() => setPicker("to")} />
        </View>
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
        <View className="items-center py-12">
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : !summary || summary.totalCount === 0 ? (
        <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-12">
          <Text className="text-sm text-zinc-400">No data for this filter.</Text>
        </View>
      ) : (
        <ReportBody summary={summary} />
      )}
    </View>
  );
}
