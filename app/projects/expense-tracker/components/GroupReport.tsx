"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { cn } from "../../../../lib/utils";
import { useAuth } from "../../../../lib/authContext";
import { ExportPdfButton } from "./ExportPdf";
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
type PayerEntry = { id: string; name: string; total: number; count: number };
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
  topPayers: PayerEntry[];
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const fmt = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function pct(part: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

const CHART_COLORS = [
  "#818cf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa",
  "#f472b6", "#22d3ee", "#fb923c", "#2dd4bf", "#c084fc",
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type Scope = "unsettled" | "settled" | "all";
type QuickRange = "all" | "this-month" | "last-30" | "last-90" | "this-year";

const SCOPE_OPTIONS: { id: Scope; label: string; hint: string }[] = [
  { id: "unsettled", label: "Unsettled", hint: "Active expenses only" },
  { id: "settled", label: "Settled", hint: "Past, settled expenses" },
  { id: "all", label: "All", hint: "Everything in this group" },
];

const QUICK_RANGES: { id: QuickRange; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "this-month", label: "This month" },
  { id: "last-30", label: "Last 30 days" },
  { id: "last-90", label: "Last 90 days" },
  { id: "this-year", label: "This year" },
];

function quickRangeToDates(r: QuickRange): { from: string; to: string } {
  if (r === "all") return { from: "", to: "" };
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const start = new Date(now);
  if (r === "this-month") {
    start.setDate(1);
  } else if (r === "last-30") {
    start.setDate(start.getDate() - 30);
  } else if (r === "last-90") {
    start.setDate(start.getDate() - 90);
  } else if (r === "this-year") {
    start.setMonth(0, 1);
  }
  return { from: start.toISOString().slice(0, 10), to };
}

type Props = {
  groupId: string;
  groupName: string;
};

export function GroupReport({ groupId, groupName }: Props) {
  const { authFetch } = useAuth();
  const [scope, setScope] = useState<Scope>("unsettled");
  const [quickRange, setQuickRange] = useState<QuickRange>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const settledDisabled = scope === "unsettled";

  function applyQuickRange(r: QuickRange) {
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

  function onCustomFrom(v: string) {
    setDateFrom(v);
    setQuickRange("all");
  }
  function onCustomTo(v: string) {
    setDateTo(v);
    setQuickRange("all");
  }

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ groupId });
    params.set(
      "settled",
      scope === "unsettled" ? "false" : scope === "settled" ? "true" : "all"
    );
    if (!settledDisabled) {
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    }
    const res = await authFetch(
      `/api/projects/expense-tracker/reports/summary?${params}`
    );
    const data = await res.json();
    setSummary(data);
    setLoading(false);
  }, [groupId, scope, dateFrom, dateTo, settledDisabled]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const scopeLabel = useMemo(
    () => SCOPE_OPTIONS.find((s) => s.id === scope)?.label ?? "All",
    [scope]
  );

  const dateRangeLabel = useMemo(() => {
    if (settledDisabled) return "Active expenses · no date filter";
    if (quickRange !== "all") {
      return QUICK_RANGES.find((q) => q.id === quickRange)?.label ?? "Custom";
    }
    if (dateFrom || dateTo) return `${dateFrom || "…"} → ${dateTo || "…"}`;
    return "All time";
  }, [settledDisabled, quickRange, dateFrom, dateTo]);

  return (
    <div className="flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5 backdrop-blur-sm">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-500/60 to-transparent" />

        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-fuchsia-400/90">
              Report scope
            </div>
            <h3 className="text-base font-semibold text-zinc-100">
              {groupName}
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              {scopeLabel} · {dateRangeLabel}
            </p>
          </div>
          {summary && summary.totalCount > 0 && (
            <ExportPdfButton
              summary={summary}
              dateFrom={dateFrom || undefined}
              dateTo={dateTo || undefined}
              groupId={groupId}
              groupName={groupName}
            />
          )}
        </div>

        <div className="mb-4">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">
            Show
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {SCOPE_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScope(s.id)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-all",
                  scope === s.id
                    ? "border-brand-500/60 bg-brand-500/15 shadow-[0_0_20px_-5px_rgba(99,102,241,0.5)]"
                    : "border-zinc-800 bg-zinc-900/40 hover:-translate-y-0.5 hover:border-zinc-600"
                )}
              >
                <div
                  className={cn(
                    "text-sm font-semibold",
                    scope === s.id ? "text-brand-500" : "text-zinc-200"
                  )}
                >
                  {s.label}
                </div>
                <div className="text-[11px] text-zinc-500">{s.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div
          className={cn(
            "transition-opacity",
            settledDisabled && "pointer-events-none opacity-40"
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              Time range
            </div>
            {(dateFrom || dateTo) && !settledDisabled && (
              <button
                onClick={clearDates}
                className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
              >
                Clear
              </button>
            )}
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {QUICK_RANGES.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => applyQuickRange(q.id)}
                disabled={settledDisabled}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                  quickRange === q.id && !settledDisabled
                    ? "border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-300 shadow-[0_0_15px_-5px_rgba(232,121,249,0.5)]"
                    : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:-translate-y-0.5 hover:border-zinc-600 hover:text-zinc-200"
                )}
              >
                {q.label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => onCustomFrom(e.target.value)}
                disabled={settledDisabled}
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
                onChange={(e) => onCustomTo(e.target.value)}
                disabled={settledDisabled}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/30"
              />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/30" />
        </div>
      ) : !summary || summary.totalCount === 0 ? (
        <EmptyState scope={scope} groupName={groupName} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <HeroStat
              label={`Total · ${scopeLabel}`}
              value={fmt(summary.totalAmount)}
              hint={`${summary.totalCount} entries`}
              accent="from-brand-500/40"
            />
            <HeroStat
              label="My Share"
              value={fmt(summary.myShare)}
              hint={`${pct(summary.myShare, summary.totalAmount)} of total`}
              accent="from-fuchsia-500/40"
              emphasized
            />
            <HeroStat
              label="Paid by Me"
              value={fmt(summary.paidByMe)}
              hint={`${pct(summary.paidByMe, summary.totalAmount)} of total`}
              accent="from-emerald-500/40"
            />
            <HeroStat
              label="Paid by Others"
              value={fmt(summary.paidByOthers)}
              hint={`${pct(summary.paidByOthers, summary.totalAmount)} of total`}
              accent="from-amber-500/40"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <MiniStat
              label="Avg / Day"
              value={fmt(summary.averagePerDay)}
              hint={`${summary.daysCovered} days covered`}
            />
            <MiniStat
              label="Avg / Transaction"
              value={fmt(summary.averagePerTransaction)}
              hint="Across all entries"
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
            />
          </div>

          {summary.topPayers.length > 0 && (
            <ChartPanel title="Top Payers in this Group" accent="from-emerald-500/40">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-zinc-500">
                      <th className="pb-2 text-left font-semibold">Member</th>
                      <th className="pb-2 text-right font-semibold">Entries</th>
                      <th className="pb-2 text-right font-semibold">Total Paid</th>
                      <th className="pb-2 pl-4 text-left font-semibold">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topPayers.map((p, i) => {
                      const pctPaid = (p.total / summary.totalAmount) * 100;
                      return (
                        <tr
                          key={p.id}
                          className="animate-fade-up border-t border-zinc-800/60"
                          style={{ animationDelay: `${i * 40}ms` }}
                        >
                          <td className="py-2.5 text-zinc-200">{p.name}</td>
                          <td className="py-2.5 text-right tabular-nums text-zinc-400">
                            {p.count}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-zinc-100">
                            {fmt(p.total)}
                          </td>
                          <td className="w-1/3 py-2.5 pl-4">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800/80">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-brand-500"
                                  style={{ width: `${pctPaid}%` }}
                                />
                              </div>
                              <span className="text-[11px] tabular-nums text-zinc-500">
                                {pctPaid.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ChartPanel>
          )}

          <ChartPanel title="Spending by Day of Week" accent="from-cyan-500/40">
            {summary.byDayOfWeek.some((d) => d.total > 0) ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={summary.byDayOfWeek.map((d) => ({
                    label: DOW[d.day],
                    total: d.total,
                  }))}
                >
                  <defs>
                    <linearGradient
                      id="grpDowGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
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
                    fill="url(#grpDowGradient)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-zinc-500">No data</p>
            )}
          </ChartPanel>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartPanel title="By Category" accent="from-brand-500/40">
              {summary.byCategory.length > 0 ? (
                <div className="flex flex-col items-center gap-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={summary.byCategory}
                        dataKey="total"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                        strokeWidth={2}
                        stroke="#0a0a0a"
                      >
                        {summary.byCategory.map((_, i) => (
                          <Cell
                            key={i}
                            fill={CHART_COLORS[i % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#09090b",
                          border: "1px solid #27272a",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(val: number) => `₹${val.toFixed(2)}`}
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
                          style={{
                            backgroundColor:
                              CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                        <span className="text-zinc-400">{c.category}</span>
                        <span className="font-mono tabular-nums text-zinc-300">
                          ₹{c.total.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No data</p>
              )}
            </ChartPanel>

            <ChartPanel title="Monthly Trend" accent="from-fuchsia-500/40">
              {summary.byMonth.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={summary.byMonth.map((m) => ({
                      label: `${MONTH_NAMES[m.month - 1]} ${m.year}`,
                      total: m.total,
                    }))}
                  >
                    <defs>
                      <linearGradient
                        id="groupBarGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
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
                      formatter={(val: number) => `₹${val.toFixed(2)}`}
                    />
                    <Bar
                      dataKey="total"
                      fill="url(#groupBarGradient)"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-zinc-500">Not enough data</p>
              )}
            </ChartPanel>
          </div>

          <ChartPanel title="Category Breakdown" accent="from-emerald-500/40">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-zinc-500">
                    <th className="pb-2 text-left font-semibold">Category</th>
                    <th className="pb-2 text-right font-semibold">Count</th>
                    <th className="pb-2 text-right font-semibold">Total</th>
                    <th className="pb-2 text-right font-semibold">%</th>
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
                          ₹{c.total.toFixed(2)}
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
        </>
      )}
    </div>
  );
}

function EmptyState({ scope, groupName }: { scope: Scope; groupName: string }) {
  const message =
    scope === "unsettled"
      ? `No unsettled expenses in ${groupName} for this range.`
      : scope === "settled"
      ? `No settled expenses in ${groupName} for this range.`
      : `No expenses found for ${groupName} in this range.`;
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
      <p className="relative text-sm text-zinc-400">{message}</p>
    </div>
  );
}

function HeroStat({
  label,
  value,
  hint,
  accent,
  emphasized,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5 backdrop-blur-sm transition-all hover:-translate-y-0.5",
        emphasized
          ? "border-fuchsia-500/40 shadow-[0_15px_40px_-15px_rgba(232,121,249,0.4)]"
          : "border-zinc-800/80"
      )}
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
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="mt-1 font-mono text-base font-semibold tabular-nums text-zinc-100">
        {value}
      </div>
      {hint && (
        <div className="mt-1 line-clamp-1 text-[11px] text-zinc-500">{hint}</div>
      )}
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
