import { useCallback, useEffect, useState } from "react";
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
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { localISODate } from "../../lib/dates";
import { CATEGORIES, type Summary } from "../../lib/types";
import { exportFullReportPdf } from "../../lib/pdf";
import { AppBackground, Input } from "../../components/ui";
import { ReportBody } from "../../components/ReportBody";
import { getBaseCurrency } from "../../lib/prefs";
import {
  Chip,
  DateField,
  quickRangeToDates,
  type QuickRange,
} from "../../components/reportControls";

type Scope = "all" | "personal" | "group";
type Settled = "all" | "false" | "true";

const SETTLED: { id: Settled; label: string }[] = [
  { id: "all", label: "All" },
  { id: "false", label: "Active" },
  { id: "true", label: "Settled" },
];

const QUICK: { id: QuickRange; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "this-month", label: "This month" },
  { id: "last-30", label: "Last 30d" },
  { id: "last-90", label: "Last 90d" },
  { id: "this-year", label: "This year" },
];

export default function ReportsTab() {
  const { user, authFetch } = useAuth();
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("all");
  const [quickRange, setQuickRange] = useState<QuickRange>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  // Everything the summary endpoint can filter on, so the report (and the PDF
  // built from it) can answer the same questions the Expenses tab can.
  const [settled, setSettled] = useState<Settled>("all");
  const [category, setCategory] = useState("");
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState("INR");

  // One place builds the query so the on-screen report and the exported PDF
  // can never drift apart.
  const filterParams = useCallback(() => {
    const params = new URLSearchParams({ settled, scope });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (category) params.set("category", category);
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (mine) params.set("mine", "true");
    return params;
  }, [scope, settled, dateFrom, dateTo, category, debouncedSearch, mine]);

  const fetchSummary = useCallback(async () => {
    const params = filterParams();
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/reports/summary?${params}`
      );
      if (!res.ok) return; // keep last good state (401/500 body is not a Summary)
      const data = (await res.json()) as Summary;
      if (typeof data?.totalAmount === "number") setSummary(data);
    } catch {
      // keep last good state
    }
  }, [filterParams, authFetch]);

  // Fetch base currency once on mount
  const fetchPrefs = useCallback(async () => {
    try {
      setBaseCurrency(await getBaseCurrency(authFetch));
    } catch {
      // keep default INR
    }
  }, [authFetch]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchPrefs();
      fetchSummary().finally(() => setLoading(false));
    }, [fetchSummary, fetchPrefs])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSummary();
    setRefreshing(false);
  }, [fetchSummary]);

  // Don't refetch the whole report on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const hasFilters =
    scope !== "all" ||
    settled !== "all" ||
    category !== "" ||
    search !== "" ||
    mine ||
    quickRange !== "all" ||
    dateFrom !== "" ||
    dateTo !== "";

  function clearFilters() {
    setScope("all");
    setSettled("all");
    setCategory("");
    setSearch("");
    setMine(false);
    setQuickRange("all");
    setDateFrom("");
    setDateTo("");
  }

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
    const iso = localISODate(date);
    if (which === "from") setDateFrom(iso);
    else setDateTo(iso);
    setQuickRange("custom");
  }

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <View className="flex-row items-center gap-2">
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text className="text-2xl text-zinc-400">‹</Text>
          </Pressable>
          <Text className="text-xl font-bold text-zinc-50">Reports</Text>
        </View>
        {summary && summary.totalCount > 0 && (
          <Pressable
            onPress={async () => {
              setExporting(true);
              try {
                await exportFullReportPdf({
                  summary,
                  authFetch,
                  userName: user?.name,
                  baseCurrency,
                  filters: {
                    scope,
                    settled,
                    category,
                    q: debouncedSearch,
                    mine,
                    dateFrom: dateFrom || undefined,
                    dateTo: dateTo || undefined,
                  },
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
        <View className="flex-row items-center justify-between">
          <Text className="text-[13px] uppercase tracking-wider text-zinc-500">
            Filters
          </Text>
          {hasFilters && (
            <Pressable onPress={clearFilters} hitSlop={8}>
              <Text className="text-xs text-zinc-400">Clear</Text>
            </Pressable>
          )}
        </View>

        <View className="flex-row items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/40 px-3">
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Search description, items, category…"
            placeholderTextColor="#52525b"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            className="flex-1 py-2 text-sm text-zinc-200"
          />
          {search !== "" && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Text className="text-base text-zinc-500">✕</Text>
            </Pressable>
          )}
        </View>

        <View className="flex-row gap-2">
          {(["all", "personal", "group"] as const).map((s) => (
            <Chip key={s} label={s} active={scope === s} onPress={() => setScope(s)} />
          ))}
        </View>

        <View className="flex-row gap-2">
          {SETTLED.map((st) => (
            <Chip
              key={st.id}
              label={st.label}
              active={settled === st.id}
              onPress={() => setSettled(st.id)}
            />
          ))}
        </View>

        <View className="flex-row gap-2">
          <Chip label="Everyone" active={!mine} onPress={() => setMine(false)} />
          <Chip label="Only mine" active={mine} onPress={() => setMine(true)} />
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
            <Text className="text-sm text-zinc-400">
              {hasFilters ? "No expenses match these filters." : "No expenses yet."}
            </Text>
          </View>
        ) : (
          <ReportBody summary={summary} baseCurrency={baseCurrency} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

