import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import type { Summary } from "../lib/types";
import { Donut } from "./Donut";
import { BarChart, LineChart } from "./SvgCharts";
import { categoryColor } from "../lib/colors";
import { formatMoney } from "../lib/currency";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Shared report renderer — stat tiles + SVG charts + tables.
 * Used by the main Reports tab and per-group GroupReportView.
 */
export function ReportBody({
  summary,
  baseCurrency = "INR",
}: {
  summary: Summary;
  baseCurrency?: string;
}) {
  const fmt = (n: number) => formatMoney(n, baseCurrency);

  const maxGroup = Math.max(...(summary.byGroup?.map((g) => g.total) ?? [0]), 1);
  const maxPayer = Math.max(...(summary.topPayers?.map((p) => p.total) ?? [0]), 1);
  const hasPayers = (summary.topPayers?.length ?? 0) > 0;

  // Chart data
  const dowData = (summary.byDayOfWeek ?? []).map((x) => ({
    label: DOW[x.day],
    value: x.total,
  }));
  const monthData = (summary.byMonth ?? []).map((m) => ({
    label: `${MONTHS[m.month - 1]} '${String(m.year).slice(2)}`,
    value: m.total,
    count: m.count,
    year: m.year,
    month: m.month,
  }));
  const maxMonth = Math.max(...monthData.map((m) => m.value), 1);

  return (
    <>
      {/* ── Stat tiles ── */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Stat label="Total" value={fmt(summary.totalAmount)} hint={`${summary.totalCount} entries`} />
        <Stat label="My share" value={fmt(summary.myShare)} />
        <Stat label="Paid by me" value={fmt(summary.paidByMe)} />
        <Stat label="Paid by others" value={fmt(summary.paidByOthers)} />
        <Stat label="Avg / day" value={fmt(summary.averagePerDay)} hint={`${summary.daysCovered} days`} />
        <Stat label="Avg / txn" value={fmt(summary.averagePerTransaction)} />
        {(summary.incomeAmount ?? 0) > 0 && (
          <>
            <Stat label="Income" value={fmt(summary.incomeAmount)} hint={`${summary.incomeCount ?? 0} entries`} accent="emerald" />
            <Stat label="Net flow" value={fmt(summary.netAmount ?? 0)} accent="emerald" />
          </>
        )}
      </View>

      {/* ── Largest expense ── */}
      {summary.largest && (
        <Panel title="Largest expense">
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 font-medium text-zinc-100" numberOfLines={1}>
              {summary.largest.description}
            </Text>
            <Text className="font-semibold text-zinc-100">{fmt(summary.largest.amount)}</Text>
          </View>
          <Text className="mt-0.5 text-xs text-zinc-500">
            {summary.largest.category} · {summary.largest.paidBy} ·{" "}
            {new Date(summary.largest.date).toLocaleDateString()}
          </Text>
        </Panel>
      )}

      {/* ── Top payers (group reports) ── */}
      {hasPayers && (
        <Panel title="Top payers in this group">
          <View className="gap-2.5">
            {summary.topPayers!.map((p) => (
              <View key={p.id}>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-zinc-300">
                    {p.name} <Text className="text-zinc-600">({p.count})</Text>
                  </Text>
                  <Text className="text-xs text-zinc-300">
                    {fmt(p.total)} ·{" "}
                    {((p.total / (summary.totalAmount || 1)) * 100).toFixed(0)}%
                  </Text>
                </View>
                <HBar pct={(p.total / maxPayer) * 100} />
              </View>
            ))}
          </View>
        </Panel>
      )}

      {/* ── Personal vs Group donut ── */}
      {!hasPayers && summary.personalTotal > 0 && summary.groupTotal > 0 && (
        <Panel title="Personal vs Group">
          <DonutWithLegend
            data={[
              { label: "Personal", value: summary.personalTotal, color: "#34d399" },
              { label: "Group", value: summary.groupTotal, color: "#818cf8" },
            ]}
            fmt={fmt}
          />
        </Panel>
      )}

      {/* ── Top groups ── */}
      {!hasPayers && (summary.byGroup?.length ?? 0) > 0 && (
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
                <HBar pct={(g.total / maxGroup) * 100} />
              </View>
            ))}
          </View>
        </Panel>
      )}

      {/* ── Day of week — SVG bar chart ── */}
      {dowData.some((x) => x.value > 0) && (
        <Panel title="Spending by day of week">
          <BarChart
            data={dowData}
            height={170}
            gradFrom="#22d3ee"
            gradTo="#0891b2"
            gradId="dow_grad"
          />
        </Panel>
      )}

      {/* ── By category donut ── */}
      {summary.byCategory.length > 0 && (
        <Panel title="By category">
          <DonutWithLegend
            data={summary.byCategory.map((c) => ({
              label: c.category,
              value: c.total,
              color: categoryColor(c.category),
            }))}
            fmt={fmt}
          />
        </Panel>
      )}

      {/* ── Monthly trend — line chart + rows ── */}
      {monthData.length > 0 && (
        <Panel title="Monthly trend">
          {monthData.length >= 2 && (
            <View className="mb-3">
              <LineChart
                data={monthData}
                height={80}
                color="#a78bfa"
                gradId="month_area"
              />
            </View>
          )}
          <View className="gap-2.5">
            {monthData.map((m) => (
              <View key={`${m.year}-${m.month}`}>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-zinc-400">
                    {MONTHS[m.month - 1]} {m.year}
                  </Text>
                  <Text className="text-xs font-medium text-zinc-200">
                    {fmt(m.value)}{" "}
                    <Text className="text-zinc-600">({m.count})</Text>
                  </Text>
                </View>
                <HBar pct={(m.value / maxMonth) * 100} colorHex="#a78bfa" />
              </View>
            ))}
          </View>
        </Panel>
      )}

      {/* ── Category breakdown ── */}
      {summary.byCategory.length > 0 && (
        <Panel title="Category breakdown">
          <View className="gap-2.5">
            {summary.byCategory.map((c) => {
              const pct = (c.total / (summary.totalAmount || 1)) * 100;
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
                  <HBar pct={pct} colorHex={categoryColor(c.category)} />
                </View>
              );
            })}
          </View>
        </Panel>
      )}
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────── */

function DonutWithLegend({
  data,
  fmt,
}: {
  data: { label: string; value: number; color: string }[];
  fmt: (n: number) => string;
}) {
  const slices = data.filter((d) => d.value > 0);
  if (slices.length === 0) return <Text className="text-xs text-zinc-500">No data</Text>;
  return (
    <View className="items-center gap-4">
      <Donut data={slices.map((d) => ({ value: d.value, color: d.color }))} />
      <View className="w-full flex-row flex-wrap justify-center gap-x-4 gap-y-1.5">
        {slices.map((d) => (
          <View key={d.label} className="flex-row items-center gap-1.5">
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.color }} />
            <Text className="text-xs text-zinc-400">{d.label}</Text>
            <Text className="text-xs text-zinc-300">{fmt(d.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function HBar({ pct, colorHex }: { pct: number; colorHex?: string }) {
  return (
    <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
      <View
        className={colorHex ? "h-full rounded-full" : "h-full rounded-full bg-brand-500"}
        style={
          colorHex
            ? { width: `${Math.min(100, pct)}%`, backgroundColor: colorHex }
            : { width: `${Math.min(100, pct)}%` }
        }
      />
    </View>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "emerald";
}) {
  return (
    <View
      className={`rounded-2xl border p-4 ${
        accent === "emerald"
          ? "border-emerald-500/30 bg-emerald-500/[0.06]"
          : "border-white/10 bg-white/[0.04]"
      }`}
      style={{ flexBasis: "47%", flexGrow: 1 }}
    >
      <Text className="text-[12px] uppercase tracking-wider text-zinc-500">{label}</Text>
      <Text className={`mt-1 text-xl font-bold ${accent === "emerald" ? "text-emerald-400" : "text-zinc-50"}`}>
        {value}
      </Text>
      {hint && <Text className="mt-0.5 text-[12px] text-zinc-500">{hint}</Text>}
    </View>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(350)}>
      <View className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <Text className="mb-3 text-sm font-semibold text-zinc-100">{title}</Text>
        {children}
      </View>
    </Animated.View>
  );
}
