"use client";

import { useEffect, useState, useCallback } from "react";
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
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#14b8a6",
  "#a855f7",
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function ReportsTab() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const res = await fetch(
      `/api/projects/expense-tracker/reports/summary?₹{params}`
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
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Clear filter
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : !summary || summary.totalCount === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
          <p className="text-sm text-zinc-400">
            No expenses found for this date range. Add expenses to see reports.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Total Expenses"
              value={`$₹{summary.totalAmount.toFixed(2)}`}
            />
            <StatCard
              label="Number of Entries"
              value={String(summary.totalCount)}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h3 className="mb-4 text-sm font-semibold">By Category</h3>
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
                        strokeWidth={1}
                        stroke="#18181b"
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
                          backgroundColor: "#18181b",
                          border: "1px solid #27272a",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(val: number) => `₹₹{val.toFixed(2)}`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-3">
                    {summary.byCategory.map((c, i) => (
                      <div key={c.category} className="flex items-center gap-1.5 text-xs">
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
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h3 className="mb-4 text-sm font-semibold">Monthly Trend</h3>
              {summary.byMonth.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={summary.byMonth.map((m) => ({
                      label: `₹{MONTH_NAMES[m.month - 1]} ₹{m.year}`,
                      total: m.total,
                    }))}
                  >
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
                      tickFormatter={(v) => `₹₹{v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181b",
                        border: "1px solid #27272a",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(val: number) => `₹₹{val.toFixed(2)}`}
                    />
                    <Bar
                      dataKey="total"
                      fill="#6366f1"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-zinc-500">No data</p>
              )}
            </section>
          </div>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h3 className="mb-3 text-sm font-semibold">Category Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-zinc-500">
                    <th className="pb-2 text-left font-semibold">Category</th>
                    <th className="pb-2 text-right font-semibold">Count</th>
                    <th className="pb-2 text-right font-semibold">Total</th>
                    <th className="pb-2 text-right font-semibold">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byCategory.map((c) => (
                    <tr
                      key={c.category}
                      className="border-t border-zinc-800/60"
                    >
                      <td className="py-2 text-zinc-200">{c.category}</td>
                      <td className="py-2 text-right tabular-nums text-zinc-400">
                        {c.count}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-zinc-200">
                        ₹{c.total.toFixed(2)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-zinc-400">
                        {((c.total / summary.totalAmount) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-zinc-100">
        {value}
      </div>
    </div>
  );
}
