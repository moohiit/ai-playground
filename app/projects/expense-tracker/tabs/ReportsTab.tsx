"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { cn } from "../../../../lib/utils";
import { useAuth } from "../../../../lib/authContext";
import { ExportPdfButton } from "../components/ExportPdf";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type CategoryEntry = { category: string; total: number; count: number };
type MonthEntry = { year: number; month: number; total: number; count: number };
type DayEntry = { day: number; total: number; count: number };
type GroupEntry = {
  groupId: string;
  groupName: string;
  total: number;
  myShare: number;
  count: number;
};
type Largest = {
  description: string;
  amount: number;
  date: string;
  paidBy: string;
  category: string;
} | null;

type Summary = {
  totalAmount: number;
  totalCount: number;
  myShare: number;
  paidByMe: number;
  paidByOthers: number;
  personalTotal: number;
  groupTotal: number;
  averagePerDay: number;
  averagePerTransaction: number;
  daysCovered: number;
  largest: Largest;
  byCategory: CategoryEntry[];
  byMonth: MonthEntry[];
  byDayOfWeek: DayEntry[];
  byGroup: GroupEntry[];
};

const CHART_COLORS = [
  "#818cf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa",
  "#f472b6", "#22d3ee", "#fb923c", "#2dd4bf", "#c084fc",
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type QuickRange = "all" | "this-month" | "last-30" | "last-90" | "this-year";

const QUICK_RANGES: { id: QuickRange; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "this-month", label: "This month" },
  { id: "last-30", label: "Last 30 days" },
  { id: "last-90", label: "Last 90 days" },
  { id: "this-year", label: "This year" },
];

type Scope = "all" | "personal" | "group";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "all", label: "All expenses" },
  { id: "personal", label: "Personal only" },
  { id: "group", label: "Groups only" },
];

function quickRangeToDates(r: QuickRange): { from: string; to: string } {
  if (r === "all") return { from: "", to: "" };
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const start = new Date(now);
  if (r === "this-month") start.setDate(1);
  else if (r === "last-30") start.setDate(start.getDate() - 30);
  else if (r === "last-90") start.setDate(start.getDate() - 90);
  else if (r === "this-year") start.setMonth(0, 1);
  return { from: start.toISOString().slice(0, 10), to };
}

const fmt = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ReportsTab() {
  const { authFetch } = useAuth();
  const [quickRange, setQuickRange] = useState<QuickRange>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  function applyQuick(r: QuickRange) {
    setQuickRange(r);
    const { from, to } = quickRangeToDates(r);
    setDateFrom(from);
    setDateTo(to);
  }

  function clearDates() {
    setQuickRange("all");
    setDateFrom("");
    setDateTo("");
  }

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ settled: "all", scope });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const res = await authFetch(
      `/api/projects/expense-tracker/reports/summary?${params}`
    );
    const data = await res.json();
    setSummary(data);
    setLoading(false);
  }, [dateFrom, dateTo, scope]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const rangeLabel = useMemo(() => {
    if (quickRange !== "all") {
      return QUICK_RANGES.find((q) => q.id === quickRange)?.label ?? "Custom";
    }
    if (dateFrom || dateTo) return `${dateFrom || "…"} → ${dateTo || "…"}`;
    return "All time";
  }, [quickRange, dateFrom, dateTo]);

  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        quickRange={quickRange}
        applyQuick={applyQuick}
        dateFrom={dateFrom}
        dateTo={dateTo}
        setDateFrom={(v) => {
          setDateFrom(v);
          setQuickRange("all");
        }}
        setDateTo={(v) => {
          setDateTo(v);
          setQuickRange("all");
        }}
        clearDates={clearDates}
        rangeLabel={rangeLabel}
        scope={scope}
        setScope={setScope}
        right={
          summary && summary.totalCount > 0 ? (
            <ExportPdfButton
              summary={summary}
              dateFrom={dateFrom || undefined}
              dateTo={dateTo || undefined}
            />
          ) : null
        }
      />

      {loading ? (
        <SkeletonReport />
      ) : !summary || summary.totalCount === 0 ? (
        <EmptyState />
      ) : (
        <>
          <HeroStats summary={summary} />
          <InsightsRow summary={summary} />

          <div className="grid gap-6 lg:grid-cols-2">
            {scope === "all" ? (
              <PersonalVsGroupCard summary={summary} />
            ) : (
              <ScopeBadgeCard scope={scope} summary={summary} />
            )}
            <DayOfWeekCard summary={summary} />
          </div>

          {scope !== "personal" && summary.byGroup.length > 0 && (
            <TopGroupsCard summary={summary} />
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <CategoryPieCard summary={summary} />
            <MonthlyTrendCard summary={summary} />
          </div>

          <CategoryBreakdownCard summary={summary} />
        </>
      )}
    </div>
  );
}

function FilterBar({
  quickRange,
  applyQuick,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  clearDates,
  rangeLabel,
  scope,
  setScope,
  right,
}: {
  quickRange: QuickRange;
  applyQuick: (r: QuickRange) => void;
  dateFrom: string;
  dateTo: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  clearDates: () => void;
  rangeLabel: string;
  scope: Scope;
  setScope: (s: Scope) => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-4 backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-500/60 to-transparent" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-fuchsia-400/90">
            Reports
          </div>
          <div className="text-xs text-zinc-500">{rangeLabel}</div>
        </div>
        {right}
      </div>
      <div className="mb-3 inline-flex rounded-lg border border-zinc-800 bg-zinc-950/40 p-1">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScope(s.id)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition",
              scope === s.id
                ? "bg-fuchsia-500/15 text-fuchsia-300 ring-1 ring-fuchsia-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK_RANGES.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => applyQuick(q.id)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
              quickRange === q.id
                ? "border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-300 shadow-[0_0_15px_-5px_rgba(232,121,249,0.5)]"
                : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:-translate-y-0.5 hover:border-zinc-600 hover:text-zinc-200"
            )}
          >
            {q.label}
          </button>
        ))}
        {(dateFrom || dateTo) && (
          <button
            onClick={clearDates}
            className="rounded-md border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            Clear
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
            From
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
            To
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
      </div>
    </div>
  );
}

function HeroStats({ summary }: { summary: Summary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total Spend"
        value={fmt(summary.totalAmount)}
        hint={`${summary.totalCount} entries`}
        accent="from-brand-500/40"
        tooltip="Gross sum of every expense (incl. amounts paid by others in groups)"
      />
      <StatCard
        label="My Share"
        value={fmt(summary.myShare)}
        hint={`${pct(summary.myShare, summary.totalAmount)} of total`}
        accent="from-fuchsia-500/40"
        emphasized
        tooltip="What you actually owe — your portion of group splits + all personal expenses"
      />
      <StatCard
        label="Paid by Me"
        value={fmt(summary.paidByMe)}
        hint={`${pct(summary.paidByMe, summary.totalAmount)} of total`}
        accent="from-emerald-500/40"
        tooltip="Cash you laid out (regardless of who owes what)"
      />
      <StatCard
        label="Paid by Others"
        value={fmt(summary.paidByOthers)}
        hint={`${pct(summary.paidByOthers, summary.totalAmount)} of total`}
        accent="from-amber-500/40"
        tooltip="Group expenses other members paid for"
      />
    </div>
  );
}

function InsightsRow({ summary }: { summary: Summary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <MiniStat
        label="Avg / Day"
        value={fmt(summary.averagePerDay)}
        hint={`${summary.daysCovered} days covered`}
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        }
      />
      <MiniStat
        label="Avg / Transaction"
        value={fmt(summary.averagePerTransaction)}
        hint="Across all entries"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        }
      />
      <MiniStat
        label="Largest Single Expense"
        value={summary.largest ? fmt(summary.largest.amount) : "—"}
        hint={
          summary.largest
            ? `${summary.largest.description} · ${new Date(
                summary.largest.date
              ).toLocaleDateString()}`
            : "No data"
        }
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 19 21 12 17 5 21 12 2" />
          </svg>
        }
      />
    </div>
  );
}

function PersonalVsGroupCard({ summary }: { summary: Summary }) {
  const data = [
    { name: "Personal", value: summary.personalTotal, color: "#34d399" },
    { name: "Group", value: summary.groupTotal, color: "#818cf8" },
  ].filter((d) => d.value > 0);
  const has = data.length > 0;
  return (
    <ChartPanel title="Personal vs Group" accent="from-emerald-500/40">
      {has ? (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                cx="50%"
                cy="50%"
                outerRadius={70}
                innerRadius={40}
                strokeWidth={2}
                stroke="#0a0a0a"
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#09090b",
                  border: "1px solid #27272a",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(val: number) => fmt(val)}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex w-full flex-col gap-2 sm:max-w-[180px]">
            {data.map((d) => (
              <div
                key={d.name}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="text-zinc-300">{d.name}</span>
                </div>
                <span className="font-mono tabular-nums text-zinc-100">
                  {fmt(d.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">No data</p>
      )}
    </ChartPanel>
  );
}

function ScopeBadgeCard({
  scope,
  summary,
}: {
  scope: Scope;
  summary: Summary;
}) {
  const isPersonal = scope === "personal";
  const total = isPersonal ? summary.personalTotal : summary.groupTotal;
  const label = isPersonal ? "Personal only" : "Groups only";
  const accent = isPersonal ? "from-emerald-500/40" : "from-brand-500/40";
  const dotColor = isPersonal ? "#34d399" : "#818cf8";

  return (
    <ChartPanel title={label} accent={accent}>
      <div className="flex h-[180px] flex-col items-center justify-center gap-3">
        <span
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <div className="font-mono text-3xl font-bold tabular-nums text-zinc-100">
          {fmt(total)}
        </div>
        <div className="text-xs text-zinc-500">
          {summary.totalCount} {isPersonal ? "personal" : "group"} entries
          {isPersonal
            ? ""
            : ` · your share ${fmt(summary.myShare)}`}
        </div>
      </div>
    </ChartPanel>
  );
}

function DayOfWeekCard({ summary }: { summary: Summary }) {
  const data = summary.byDayOfWeek.map((d) => ({
    label: DOW[d.day],
    total: d.total,
  }));
  const has = data.some((d) => d.total > 0);
  return (
    <ChartPanel title="Spending by Day of Week" accent="from-cyan-500/40">
      {has ? (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data}>
            <defs>
              <linearGradient id="dowGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#0891b2" stopOpacity={0.6} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `₹${v}`}
            />
            <Tooltip
              cursor={{ fill: "rgba(34,211,238,0.08)" }}
              contentStyle={{
                backgroundColor: "#09090b",
                border: "1px solid #27272a",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(val: number) => fmt(val)}
            />
            <Bar
              dataKey="total"
              fill="url(#dowGradient)"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-xs text-zinc-500">No data</p>
      )}
    </ChartPanel>
  );
}

function TopGroupsCard({ summary }: { summary: Summary }) {
  const max = Math.max(...summary.byGroup.map((g) => g.total), 1);
  return (
    <ChartPanel title="Top Groups" accent="from-brand-500/40">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="pb-2 text-left font-semibold">Group</th>
              <th className="pb-2 text-right font-semibold">Entries</th>
              <th className="pb-2 text-right font-semibold">Total</th>
              <th className="pb-2 text-right font-semibold">My Share</th>
              <th className="pb-2 pl-4 text-left font-semibold">Share of Total</th>
            </tr>
          </thead>
          <tbody>
            {summary.byGroup.map((g, i) => (
              <tr
                key={g.groupId}
                className="animate-fade-up border-t border-zinc-800/60"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <td className="py-2.5 text-zinc-200">{g.groupName}</td>
                <td className="py-2.5 text-right tabular-nums text-zinc-400">
                  {g.count}
                </td>
                <td className="py-2.5 text-right font-mono tabular-nums text-zinc-100">
                  {fmt(g.total)}
                </td>
                <td className="py-2.5 text-right font-mono tabular-nums text-fuchsia-300">
                  {fmt(g.myShare)}
                </td>
                <td className="w-1/3 py-2.5 pl-4">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500"
                      style={{ width: `${(g.total / max) * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartPanel>
  );
}

function CategoryPieCard({ summary }: { summary: Summary }) {
  return (
    <ChartPanel title="By Category" accent="from-brand-500/40">
      {summary.byCategory.length > 0 ? (
        <div className="flex flex-col items-center gap-4">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={summary.byCategory}
                dataKey="total"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={45}
                strokeWidth={2}
                stroke="#0a0a0a"
              >
                {summary.byCategory.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#09090b",
                  border: "1px solid #27272a",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(val: number) => fmt(val)}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap justify-center gap-3">
            {summary.byCategory.map((c, i) => (
              <div
                key={c.category}
                className="flex items-center gap-1.5 text-xs"
              >
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span className="text-zinc-400">{c.category}</span>
                <span className="font-mono tabular-nums text-zinc-300">
                  {fmt(c.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">No data</p>
      )}
    </ChartPanel>
  );
}

function MonthlyTrendCard({ summary }: { summary: Summary }) {
  return (
    <ChartPanel title="Monthly Trend" accent="from-fuchsia-500/40">
      {summary.byMonth.length > 0 ? (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={summary.byMonth.map((m) => ({
              label: `${MONTH_NAMES[m.month - 1]} ${m.year}`,
              total: m.total,
            }))}
          >
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.6} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `₹${v}`}
            />
            <Tooltip
              cursor={{ fill: "rgba(99,102,241,0.08)" }}
              contentStyle={{
                backgroundColor: "#09090b",
                border: "1px solid #27272a",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(val: number) => fmt(val)}
            />
            <Bar dataKey="total" fill="url(#barGradient)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-xs text-zinc-500">No data</p>
      )}
    </ChartPanel>
  );
}

function CategoryBreakdownCard({ summary }: { summary: Summary }) {
  return (
    <ChartPanel title="Category Breakdown" accent="from-emerald-500/40">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="pb-2 text-left font-semibold">Category</th>
              <th className="pb-2 text-right font-semibold">Count</th>
              <th className="pb-2 text-right font-semibold">Total</th>
              <th className="pb-2 text-right font-semibold">% of Total</th>
              <th className="pb-2 pl-4 text-left font-semibold">Share</th>
            </tr>
          </thead>
          <tbody>
            {summary.byCategory.map((c, i) => {
              const pct = (c.total / summary.totalAmount) * 100;
              return (
                <tr
                  key={c.category}
                  className="animate-fade-up border-t border-zinc-800/60"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <td className="py-2.5 text-zinc-200">{c.category}</td>
                  <td className="py-2.5 text-right tabular-nums text-zinc-400">
                    {c.count}
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-zinc-100">
                    {fmt(c.total)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-zinc-400">
                    {pct.toFixed(1)}%
                  </td>
                  <td className="w-1/4 py-2.5 pl-4">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor:
                            CHART_COLORS[i % CHART_COLORS.length],
                        }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ChartPanel>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
  emphasized,
  tooltip,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  emphasized?: boolean;
  tooltip?: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5 backdrop-blur-sm transition-all hover:-translate-y-0.5",
        emphasized
          ? "border-fuchsia-500/40 shadow-[0_15px_40px_-15px_rgba(232,121,249,0.4)]"
          : "border-zinc-800/80"
      )}
      title={tooltip}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent",
          accent ?? "from-brand-500/40"
        )}
      />
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          emphasized ? "text-gradient-brand" : "text-zinc-100"
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            {label}
          </div>
          <div className="mt-1 font-mono text-base font-semibold tabular-nums text-zinc-100">
            {value}
          </div>
          {hint && (
            <div className="mt-1 line-clamp-1 text-[11px] text-zinc-500">
              {hint}
            </div>
          )}
        </div>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500 ring-1 ring-brand-500/30">
          {icon}
        </span>
      </div>
    </div>
  );
}

function ChartPanel({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5 backdrop-blur-sm">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent",
          accent ?? "from-brand-500/40"
        )}
      />
      <h3 className="mb-4 text-sm font-semibold text-zinc-100">{title}</h3>
      {children}
    </section>
  );
}

function SkeletonReport() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/30"
          />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/30"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/30" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-12 text-center backdrop-blur-sm">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />
      <div className="relative mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      </div>
      <p className="relative text-sm text-zinc-400">
        No expenses found for this date range. Add expenses to see reports.
      </p>
    </div>
  );
}

function pct(part: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}
