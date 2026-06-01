import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import type { Summary } from "../lib/types";
import { Donut } from "./Donut";

const COLORS = [
  "#818cf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa",
  "#f472b6", "#22d3ee", "#fb923c", "#2dd4bf", "#c084fc",
];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmt = (n: number) => `₹${n.toFixed(2)}`;

/**
 * Shared report renderer (stat tiles + charts/tables) used by both the main
 * Reports tab and the per-group Report. Adapts panels to the data present:
 * Top Payers for a group summary, Personal-vs-Group / Top Groups otherwise.
 */
export function ReportBody({ summary }: { summary: Summary }) {
  const maxCat = summary.byCategory?.[0]?.total ?? 0;
  const maxDow = Math.max(...(summary.byDayOfWeek?.map((x) => x.total) ?? [0]), 1);
  const maxMonth = Math.max(...(summary.byMonth?.map((m) => m.total) ?? [0]), 1);
  const maxGroup = Math.max(...(summary.byGroup?.map((g) => g.total) ?? [0]), 1);
  const maxPayer = Math.max(...(summary.topPayers?.map((p) => p.total) ?? [0]), 1);
  const hasPayers = (summary.topPayers?.length ?? 0) > 0;

  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
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
            <Text className="font-semibold text-zinc-100">{fmt(summary.largest.amount)}</Text>
          </View>
          <Text className="mt-0.5 text-xs text-zinc-500">
            {summary.largest.category} · {summary.largest.paidBy} ·{" "}
            {new Date(summary.largest.date).toLocaleDateString()}
          </Text>
        </Panel>
      )}

      {/* Top payers (group reports) */}
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
                <Bar pct={(p.total / maxPayer) * 100} />
              </View>
            ))}
          </View>
        </Panel>
      )}

      {/* Personal vs Group (main report, when both present) */}
      {!hasPayers && summary.personalTotal > 0 && summary.groupTotal > 0 && (
        <Panel title="Personal vs Group">
          <DonutWithLegend
            data={[
              { label: "Personal", value: summary.personalTotal, color: "#34d399" },
              { label: "Group", value: summary.groupTotal, color: "#818cf8" },
            ]}
          />
        </Panel>
      )}

      {/* Top groups (main report) */}
      {!hasPayers && (summary.byGroup?.length ?? 0) > 0 && (
        <Panel title="Top groups">
          <View className="gap-2.5">
            {summary.byGroup.map((g) => (
              <View key={g.groupId}>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-zinc-300">{g.groupName}</Text>
                  <Text className="text-xs text-zinc-300">
                    {fmt(g.total)} <Text className="text-fuchsia-300">({fmt(g.myShare)})</Text>
                  </Text>
                </View>
                <Bar pct={(g.total / maxGroup) * 100} />
              </View>
            ))}
          </View>
        </Panel>
      )}

      {/* Day of week */}
      {(summary.byDayOfWeek?.some((x) => x.total > 0) ?? false) && (
        <Panel title="Spending by day of week">
          <View className="mt-1 h-28 flex-row items-end justify-between gap-1.5">
            {summary.byDayOfWeek.map((x) => (
              <View key={x.day} className="flex-1 items-center gap-1">
                <View className="w-full justify-end" style={{ height: 80 }}>
                  <View
                    className="w-full rounded-t bg-cyan-500"
                    style={{ height: Math.max(2, (x.total / maxDow) * 80) }}
                  />
                </View>
                <Text className="text-[9px] text-zinc-500">{DOW[x.day]}</Text>
              </View>
            ))}
          </View>
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
                    {fmt(m.total)} <Text className="text-zinc-600">({m.count})</Text>
                  </Text>
                </View>
                <Bar pct={(m.total / maxMonth) * 100} colorHex="#a78bfa" />
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
              const pct = (c.total / (summary.totalAmount || 1)) * 100;
              return (
                <View key={c.category}>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-zinc-300">
                      {c.category} <Text className="text-zinc-600">({c.count})</Text>
                    </Text>
                    <Text className="text-xs text-zinc-300">
                      {fmt(c.total)} · {pct.toFixed(1)}%
                    </Text>
                  </View>
                  <Bar pct={maxCat > 0 ? (c.total / maxCat) * 100 : 0} colorHex={COLORS[i % COLORS.length]} />
                </View>
              );
            })}
          </View>
        </Panel>
      )}
    </>
  );
}

function DonutWithLegend({
  data,
}: {
  data: { label: string; value: number; color: string }[];
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

function Bar({
  pct,
  colorHex,
}: {
  pct: number;
  colorHex?: string;
}) {
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
      style={{ flexBasis: "47%", flexGrow: 1 }}
    >
      <Text className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</Text>
      <Text className="mt-1 text-xl font-bold text-zinc-50">{value}</Text>
      {hint && <Text className="mt-0.5 text-[10px] text-zinc-500">{hint}</Text>}
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
