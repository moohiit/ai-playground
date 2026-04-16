"use client";

import { useEffect, useState, useCallback } from "react";
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

type Summary = {
  totalAmount: number;
  totalCount: number;
  byCategory: CategoryEntry[];
  byMonth: MonthEntry[];
};

const CHART_COLORS = [
  "#818cf8",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#a78bfa",
  "#f472b6",
  "#22d3ee",
  "#fb923c",
  "#2dd4bf",
  "#c084fc",
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function ReportsTab() {
  const { authFetch } = useAuth();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const res = await authFetch(
      `/api/projects/expense-tracker/reports/summary?${params}`
    );
    const data = await res.json();
    setSummary(data);
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return (
    <div className="flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-4 backdrop-blur-sm">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-500/60 to-transparent" />
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
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
              className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="rounded-md border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
            >
              Clear filter
            </button>
          )}
          <div className="ml-auto">
            {summary && summary.totalCount > 0 && (
              <ExportPdfButton
                summary={summary}
                dateFrom={dateFrom || undefined}
                dateTo={dateTo || undefined}
              />
            )}
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
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Total Expenses"
              value={`₹${summary.totalAmount.toFixed(2)}`}
              accent="from-brand-500/40"
            />
            <StatCard
              label="Number of Entries"
              value={String(summary.totalCount)}
              accent="from-fuchsia-500/40"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
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
                      formatter={(val: number) => `₹${val.toFixed(2)}`}
                    />
                    <Bar
                      dataKey="total"
                      fill="url(#barGradient)"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-zinc-500">No data</p>
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
                          ₹{c.total.toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-zinc-400">
                          {pct.toFixed(1)}%
                        </td>
                        <td className="w-1/4 py-2.5 pl-4">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
                            <div
                              className="h-full rounded-full transition-all"
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

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5 backdrop-blur-sm">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent",
          accent ?? "from-brand-500/40"
        )}
      />
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-gradient-brand">
        {value}
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
