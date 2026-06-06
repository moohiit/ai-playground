"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "../../../../lib/utils";
import { useAuth } from "../../../../lib/authContext";
import { CATEGORIES } from "../../../../modules/expense-tracker/schemas";
import { formatMoney, currencySymbol } from "../../../../modules/expense-tracker/currencies";
import { AddExpenseModal } from "../components/AddExpenseModal";
import { categoryColor } from "../colors";

type Expense = {
  _id: string;
  type: "personal" | "group";
  direction?: "expense" | "income";
  currency?: string;
  amountBase?: number;
  groupId?: string;
  paidBy: { id: string; name: string };
  amount: number;
  description: string;
  category: string;
  date: string;
  splitAmong?: { memberId: string; name: string }[];
  splits: { memberId: string; name: string; amount: number }[];
};

type ViewMode = "all" | "personal" | "group";
type DirectionFilter = "expense" | "income" | "all";
type RangeKey = "all" | "month" | "30d" | "7d";

type Breakdown = {
  personalTotal: number;
  groupTotal: number;
  personalActive: number;
  personalActiveCount: number;
  groupActive: number;
  groupActiveCount: number;
  lastPersonalSettle: string | null;
};

const PAGE_SIZE = 25;

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "month", label: "This month" },
  { key: "30d", label: "Last 30d" },
  { key: "7d", label: "Last 7d" },
];

function rangeToDateFrom(range: RangeKey): string | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  const days = range === "7d" ? 7 : 30;
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return from.toISOString();
}

export function Dashboard() {
  const { authFetch } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [incomeAmount, setIncomeAmount] = useState(0);
  const [netAmount, setNetAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("all");
  const [direction, setDirection] = useState<DirectionFilter>("expense");
  const [category, setCategory] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [range, setRange] = useState<RangeKey>("all");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [nlText, setNlText] = useState("");
  const [nlBusy, setNlBusy] = useState(false);
  const [nlError, setNlError] = useState<string | null>(null);
  const [prefillDraft, setPrefillDraft] = useState<Record<string, unknown> | null>(null);
  const [forecast, setForecast] = useState<{
    projectedTotal: number;
    monthToDate: number;
    upcomingRecurring: number;
    overallBudget: number | null;
    projectedVsBudget: number | null;
  } | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [settling, setSettling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [base, setBase] = useState("INR");
  const [settled, setSettled] = useState<"false" | "true" | "all">("false");

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    const dateFrom = rangeToDateFrom(range);

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      page: String(page),
    });
    if (view !== "all") params.set("type", view);
    params.set("direction", direction);
    if (category) params.set("category", category);
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (dateFrom) params.set("dateFrom", dateFrom);
    params.set("settled", settled);

    // Summary is intentionally direction-agnostic so the Expense/Income/Net
    // cards always show the full picture regardless of the list's direction filter.
    const summaryParams = new URLSearchParams({ scope: view, settled });
    if (category) summaryParams.set("category", category);
    if (debouncedSearch) summaryParams.set("q", debouncedSearch);
    if (dateFrom) summaryParams.set("dateFrom", dateFrom);

    try {
      const [expRes, sumRes] = await Promise.all([
        authFetch(`/api/projects/expense-tracker/expenses?${params}`),
        authFetch(`/api/projects/expense-tracker/reports/summary?${summaryParams}`),
      ]);
      const [expData, sumData] = await Promise.all([
        expRes.json().catch(() => ({})),
        sumRes.json().catch(() => ({})),
      ]);
      setExpenses(expData.expenses ?? []);
      setTotal(expData.total ?? 0);
      setTotalAmount(sumData.totalAmount ?? 0);
      setIncomeAmount(sumData.incomeAmount ?? 0);
      setNetAmount(sumData.netAmount ?? 0);
    } catch {
      // leave the last good state in place
    } finally {
      setLoading(false);
    }
  }, [view, direction, category, debouncedSearch, range, settled, page, authFetch]);

  const fetchBreakdown = useCallback(async () => {
    const [allRes, pRes, gRes, hRes] = await Promise.all([
      authFetch(`/api/projects/expense-tracker/reports/summary?scope=all&settled=all`),
      authFetch(`/api/projects/expense-tracker/reports/summary?scope=personal&settled=false`),
      authFetch(`/api/projects/expense-tracker/reports/summary?scope=group&settled=false`),
      authFetch(`/api/projects/expense-tracker/personal/history`),
    ]);
    const [all, p, g, h] = await Promise.all([
      allRes.json().catch(() => ({})),
      pRes.json().catch(() => ({})),
      gRes.json().catch(() => ({})),
      hRes.json().catch(() => ({})),
    ]);
    setBreakdown({
      personalTotal: all.personalTotal ?? 0,
      groupTotal: all.groupTotal ?? 0,
      personalActive: p.totalAmount ?? 0,
      personalActiveCount: p.totalCount ?? 0,
      groupActive: g.totalAmount ?? 0,
      groupActiveCount: g.totalCount ?? 0,
      lastPersonalSettle: h.history?.[0]?.settledAt ?? null,
    });
  }, [authFetch]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  useEffect(() => {
    fetchBreakdown();
  }, [fetchBreakdown]);

  useEffect(() => {
    authFetch("/api/projects/expense-tracker/prefs")
      .then((r) => r.json())
      .then((d) => d.prefs?.baseCurrency && setBase(d.prefs.baseCurrency))
      .catch(() => {});
  }, [authFetch]);

  const fetchForecast = useCallback(() => {
    authFetch("/api/projects/expense-tracker/forecast")
      .then((r) => r.json())
      .then((d) => setForecast(d))
      .catch(() => {});
  }, [authFetch]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  async function handleNlParse() {
    const text = nlText.trim();
    if (!text || nlBusy) return;
    setNlBusy(true);
    setNlError(null);
    try {
      const res = await authFetch("/api/projects/expense-tracker/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't understand that");
      setPrefillDraft(data.draft);
      setNlText("");
    } catch (e) {
      setNlError(e instanceof Error ? e.message : "Couldn't understand that");
    } finally {
      setNlBusy(false);
    }
  }

  // Debounce the search box so we don't fire a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [view, direction, category, debouncedSearch, range, settled]);

  const hasActiveFilters =
    view !== "all" ||
    direction !== "expense" ||
    category !== "" ||
    search !== "" ||
    range !== "all" ||
    settled !== "false";

  async function handleSettlePersonal() {
    const count = breakdown?.personalActiveCount ?? 0;
    if (count === 0) return;
    if (
      !confirm(
        `Settle all ${count} active personal ${count === 1 ? "expense" : "expenses"}? They move to settled history.`
      )
    )
      return;
    setSettling(true);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/personal/settle`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Settlement failed");
      setPage(1);
      await Promise.all([fetchBreakdown(), fetchExpenses()]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Settlement failed");
    } finally {
      setSettling(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this expense?")) return;
    await authFetch(`/api/projects/expense-tracker/expenses/${id}`, {
      method: "DELETE",
    });
    fetchExpenses();
  }

  async function handleExportCsv() {
    if (exporting || total === 0) return;
    setExporting(true);
    const dateFrom = rangeToDateFrom(range);
    const params = new URLSearchParams();
    if (view !== "all") params.set("type", view);
    params.set("direction", direction);
    if (category) params.set("category", category);
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (dateFrom) params.set("dateFrom", dateFrom);
    params.set("settled", settled);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/expenses/export?${params}`
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showPagination = total > PAGE_SIZE;
  // Headline card follows the active direction filter so it matches the listed rows.
  const headline =
    direction === "income"
      ? { label: "Total Income", value: incomeAmount, accent: "from-emerald-500/40" }
      : direction === "all"
        ? { label: "Net (income − spend)", value: netAmount, accent: "from-brand-500/40" }
        : { label: "Total Expenses", value: totalAmount, accent: "from-brand-500/40" };
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, page * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={headline.label}
          value={formatMoney(headline.value, base)}
          hint={`${total} ${total === 1 ? "entry" : "entries"}`}
          accent={headline.accent}
        />
        <StatCard
          label="Net flow"
          value={formatMoney(netAmount, base)}
          hint={`Income ${formatMoney(incomeAmount, base)}`}
          accent={netAmount < 0 ? "from-red-500/40" : "from-emerald-500/40"}
        />
        <button
          onClick={() => setShowAdd(true)}
          className="group relative flex items-center justify-between overflow-hidden rounded-xl border border-brand-500/40 bg-gradient-to-br from-brand-600/30 via-brand-500/20 to-fuchsia-500/20 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-[0_15px_40px_-10px_rgba(99,102,241,0.5)]"
        >
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          <div className="relative">
            <div className="text-xs uppercase tracking-wider text-zinc-300">
              Quick add
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              + New Expense
            </div>
          </div>
          <div className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition-transform group-hover:rotate-90">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
        </button>
      </div>

      {/* AI quick-add (natural language) */}
      <div className="rounded-xl border border-brand-500/30 bg-gradient-to-b from-brand-500/[0.07] to-zinc-950/40 p-3">
        <div className="flex items-center gap-2">
          <span className="hidden shrink-0 items-center gap-1 rounded-md bg-brand-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-300 sm:inline-flex">
            ✨ AI
          </span>
          <input
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNlParse()}
            placeholder="Type an expense — e.g. “250 coffee” or “got salary 50000”"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500/60 focus:outline-none"
          />
          <button
            onClick={handleNlParse}
            disabled={nlBusy || !nlText.trim()}
            className="shrink-0 rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {nlBusy ? "Reading…" : "Add"}
          </button>
        </div>
        {nlError && <p className="mt-2 px-1 text-xs text-red-400">{nlError}</p>}
      </div>

      {forecast && (totalAmount > 0 || forecast.projectedTotal > 0) && (
        <ForecastCard forecast={forecast} base={base} />
      )}

      {breakdown && (
        <div className="grid gap-4 sm:grid-cols-2">
          <BreakdownCard
            title="Personal"
            accent="from-emerald-500/40"
            base={base}
            activeAmount={breakdown.personalActive}
            activeCount={breakdown.personalActiveCount}
            totalAmount={breakdown.personalTotal}
            since={breakdown.lastPersonalSettle}
            onSettle={handleSettlePersonal}
            settling={settling}
          />
          <BreakdownCard
            title="Group"
            accent="from-brand-500/40"
            base={base}
            activeAmount={breakdown.groupActive}
            activeCount={breakdown.groupActiveCount}
            totalAmount={breakdown.groupTotal}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-3 backdrop-blur-sm sm:p-4">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, items, or category…"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 py-2 pl-9 pr-9 text-sm text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 hover:border-zinc-600 focus:border-brand-500/60"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-200"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] uppercase tracking-wider text-zinc-500 sm:inline">
              Type
            </span>
            <div className="flex gap-1.5">
              {(["all", "personal", "group"] as const).map((v) => (
                <FilterChip
                  key={v}
                  active={view === v}
                  onClick={() => setView(v)}
                >
                  {v}
                </FilterChip>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] uppercase tracking-wider text-zinc-500 sm:inline">
              Flow
            </span>
            <div className="flex gap-1.5">
              {([
                ["expense", "Expense"],
                ["income", "Income"],
                ["all", "All"],
              ] as const).map(([val, label]) => (
                <FilterChip
                  key={val}
                  active={direction === val}
                  onClick={() => setDirection(val)}
                >
                  {label}
                </FilterChip>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] uppercase tracking-wider text-zinc-500 sm:inline">
              Status
            </span>
            <div className="flex gap-1.5">
              {([
                ["false", "Active"],
                ["true", "Settled"],
                ["all", "All"],
              ] as const).map(([val, label]) => (
                <FilterChip
                  key={val}
                  active={settled === val}
                  onClick={() => setSettled(val)}
                >
                  {label}
                </FilterChip>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] uppercase tracking-wider text-zinc-500 sm:inline">
              When
            </span>
            <div className="flex flex-wrap gap-1.5">
              {RANGES.map((r) => (
                <FilterChip
                  key={r.key}
                  active={range === r.key}
                  onClick={() => setRange(r.key)}
                >
                  {r.label}
                </FilterChip>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] uppercase tracking-wider text-zinc-500 sm:inline">
              Category
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-200 outline-none transition-colors hover:border-zinc-600 focus:border-brand-500/60"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              disabled={exporting || total === 0}
              title="Export the filtered expenses as CSV"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              {exporting ? "Exporting…" : "CSV"}
            </button>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setView("all");
                  setDirection("expense");
                  setCategory("");
                  setSearch("");
                  setRange("all");
                  setSettled("false");
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg border border-zinc-800/60 bg-zinc-900/30"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      ) : expenses.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:hidden">
            {expenses.map((e, i) => (
              <ExpenseCard
                key={e._id}
                expense={e}
                index={i}
                base={base}
                onEdit={() => setEditingExpense(e)}
                onDelete={() => handleDelete(e._id)}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 backdrop-blur-sm sm:block">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-xs">
              <tr>
                {[
                  "Date",
                  "Description",
                  "Category",
                  "Paid by",
                  "Amount",
                  "Split among",
                  "Type",
                  "",
                ].map((h, i) => (
                  <th
                    key={i}
                    className={cn(
                      "px-4 py-3 font-semibold uppercase tracking-wider text-zinc-500",
                      h === "Amount" ? "text-right" : "text-left"
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expenses.map((e, i) => (
                <tr
                  key={e._id}
                  className="animate-fade-up border-t border-zinc-800/60 transition-colors hover:bg-brand-500/5"
                  style={{ animationDelay: `${i * 25}ms` }}
                >
                  <td className="px-4 py-3 tabular-nums text-zinc-300">
                    {new Date(e.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-100">{e.description}</td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-md border px-2 py-0.5 text-[11px]"
                      style={{
                        color: categoryColor(e.category),
                        borderColor: `${categoryColor(e.category)}66`,
                        backgroundColor: `${categoryColor(e.category)}1f`,
                      }}
                    >
                      {e.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{e.paidBy.name}</td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-mono tabular-nums",
                      e.direction === "income" ? "text-emerald-400" : "text-zinc-100"
                    )}
                  >
                    {e.direction === "income" ? "+" : ""}
                    {formatMoney(e.amountBase ?? e.amount, base)}
                    {e.currency && e.currency !== base && (
                      <div className="text-[10px] font-normal text-zinc-500">
                        {currencySymbol(e.currency)}
                        {e.amount.toFixed(2)} {e.currency}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {e.splitAmong && e.splitAmong.length > 0
                      ? e.splitAmong.map((m) => m.name).join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ring-1",
                        e.type === "group"
                          ? "bg-brand-500/10 text-brand-500 ring-brand-500/30"
                          : "bg-zinc-800/60 text-zinc-400 ring-zinc-700"
                      )}
                    >
                      {e.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setEditingExpense(e)}
                        className="text-xs text-zinc-500 transition-colors hover:text-brand-400"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(e._id)}
                        className="text-xs text-zinc-500 transition-colors hover:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      {!loading && showPagination && (
        <Pagination
          page={page}
          totalPages={totalPages}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          total={total}
          onChange={setPage}
        />
      )}

      {showAdd && (
        <AddExpenseModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            fetchExpenses();
            fetchForecast();
          }}
        />
      )}

      {editingExpense && (
        <AddExpenseModal
          editExpense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onSaved={() => {
            setEditingExpense(null);
            fetchExpenses();
            fetchForecast();
          }}
        />
      )}

      {prefillDraft && (
        <AddExpenseModal
          prefill={prefillDraft as never}
          onClose={() => setPrefillDraft(null)}
          onSaved={() => {
            setPrefillDraft(null);
            fetchExpenses();
            fetchForecast();
          }}
        />
      )}
    </div>
  );
}

function ForecastCard({
  forecast,
  base,
}: {
  forecast: {
    projectedTotal: number;
    monthToDate: number;
    upcomingRecurring: number;
    overallBudget: number | null;
    projectedVsBudget: number | null;
  };
  base: string;
}) {
  const over = forecast.projectedVsBudget != null && forecast.projectedVsBudget > 0;
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5">
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent", over ? "from-red-500/40" : "from-brand-500/40")} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
            ✨ Projected this month
          </div>
          <div className={cn("mt-1 text-2xl font-bold tabular-nums", over ? "text-red-400" : "text-zinc-100")}>
            {formatMoney(forecast.projectedTotal, base)}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {formatMoney(forecast.monthToDate, base)} so far · at your current daily pace
          </div>
        </div>
        <div className="text-right text-xs">
          {forecast.upcomingRecurring > 0 && (
            <div className="text-zinc-400">
              + {formatMoney(forecast.upcomingRecurring, base)} recurring due
            </div>
          )}
          {forecast.overallBudget != null && (
            <div className={cn("mt-0.5 font-medium", over ? "text-red-400" : "text-emerald-400")}>
              {over
                ? `${formatMoney(forecast.projectedVsBudget!, base)} over budget`
                : `within ${formatMoney(forecast.overallBudget, base)} budget`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
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
      <div className="mt-1 text-2xl font-bold tabular-nums text-zinc-100">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

function BreakdownCard({
  title,
  accent,
  base,
  activeAmount,
  activeCount,
  totalAmount,
  since,
  onSettle,
  settling,
}: {
  title: string;
  accent?: string;
  base: string;
  activeAmount: number;
  activeCount: number;
  totalAmount: number;
  since?: string | null;
  onSettle?: () => void;
  settling?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5 backdrop-blur-sm">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent",
          accent ?? "from-brand-500/40"
        )}
      />
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        {onSettle && activeCount > 0 && (
          <button
            onClick={onSettle}
            disabled={settling}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
          >
            {settling ? "Settling…" : "Settle all"}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            Active
          </div>
          <div className="mt-0.5 text-xl font-bold tabular-nums text-zinc-100">
            {formatMoney(activeAmount, base)}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {activeCount} {activeCount === 1 ? "entry" : "entries"}
            {since
              ? ` · since ${new Date(since).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
              : ""}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            Total
          </div>
          <div className="mt-0.5 text-xl font-bold tabular-nums text-zinc-100">
            {formatMoney(totalAmount, base)}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">all time</div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-all",
        active
          ? "border-brand-500/60 bg-brand-500/15 text-brand-500 shadow-[0_0_20px_-5px_rgba(99,102,241,0.5)]"
          : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:-translate-y-0.5 hover:border-zinc-600 hover:text-zinc-200"
      )}
    >
      {children}
    </button>
  );
}

function ExpenseCard({
  expense: e,
  index,
  base,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  index: number;
  base: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const splitNames =
    e.splitAmong && e.splitAmong.length > 0
      ? e.splitAmong.map((m) => m.name).join(", ")
      : null;

  return (
    <div
      className="animate-fade-up rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-4 backdrop-blur-sm"
      style={{ animationDelay: `${index * 25}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium text-zinc-100">
            {e.description}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {new Date(e.date).toLocaleDateString()} · {e.paidBy.name}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={cn(
              "font-mono tabular-nums text-base font-semibold",
              e.direction === "income" ? "text-emerald-400" : "text-zinc-100"
            )}
          >
            {e.direction === "income" ? "+" : ""}
            {formatMoney(e.amountBase ?? e.amount, base)}
          </div>
          {e.currency && e.currency !== base && (
            <div className="text-[10px] text-zinc-500">
              {currencySymbol(e.currency)}
              {e.amount.toFixed(2)} {e.currency}
            </div>
          )}
          <span
            className={cn(
              "mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ring-1",
              e.direction === "income"
                ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30"
                : e.type === "group"
                  ? "bg-brand-500/10 text-brand-500 ring-brand-500/30"
                  : "bg-zinc-800/60 text-zinc-400 ring-zinc-700"
            )}
          >
            {e.direction === "income" ? "income" : e.type}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[11px] text-zinc-300">
          {e.category}
        </span>
        {splitNames && (
          <span className="truncate text-[11px] text-zinc-500">
            Split: {splitNames}
          </span>
        )}
      </div>

      <div className="mt-3 flex justify-end gap-4 border-t border-zinc-800/60 pt-3">
        <button
          onClick={onEdit}
          className="text-xs font-medium text-zinc-400 transition-colors hover:text-brand-400"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="text-xs font-medium text-zinc-400 transition-colors hover:text-red-400"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  onChange: (p: number) => void;
}) {
  const pages = pageNumbers(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 px-4 py-3 backdrop-blur-sm">
      <div className="text-xs text-zinc-500">
        Showing{" "}
        <span className="font-mono text-zinc-300">
          {rangeStart}–{rangeEnd}
        </span>{" "}
        of <span className="font-mono text-zinc-300">{total}</span>
      </div>
      <div className="flex items-center gap-1">
        <PageBtn
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </PageBtn>
        {pages.map((p, i) =>
          p === "…" ? (
            <span
              key={`ellipsis-${i}`}
              className="px-2 text-xs text-zinc-600"
            >
              …
            </span>
          ) : (
            <PageBtn
              key={p}
              active={p === page}
              onClick={() => onChange(p)}
            >
              {p}
            </PageBtn>
          )
        )}
        <PageBtn
          disabled={page === totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </PageBtn>
      </div>
    </div>
  );
}

function PageBtn({
  active,
  disabled,
  onClick,
  children,
  ...rest
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-medium transition-all",
        active
          ? "border-brand-500/60 bg-brand-500/15 text-brand-500 shadow-[0_0_15px_-5px_rgba(99,102,241,0.6)]"
          : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
        disabled && "cursor-not-allowed opacity-40 hover:border-zinc-800 hover:text-zinc-400"
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-12 text-center backdrop-blur-sm">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-3xl" />
      <div className="relative mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      </div>
      <p className="relative text-sm text-zinc-400">
        No expenses yet. Add one to get started.
      </p>
    </div>
  );
}
