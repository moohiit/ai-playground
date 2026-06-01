import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { Expense, Group, Settlement, Summary } from "./types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type Fetcher = (path: string, opts?: RequestInit) => Promise<Response>;

const PDF_STYLE = `<style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a1a; padding: 26px; }
    h1 { text-align: center; margin: 0 0 4px; font-size: 22px; }
    .sub { text-align: center; color: #666; font-size: 12px; margin: 2px 0; }
    h2 { font-size: 14px; margin: 22px 0 8px; color: #4f46e5; border-bottom: 1px solid #eee; padding-bottom: 3px; }
    h3 { font-size: 12px; margin: 14px 0 6px; color: #333; }
    .stats p { margin: 4px 0; font-size: 13px; }
    .muted { color: #666; font-size: 11px; margin: 2px 0 8px; }
    .ok { color: #16a34a; font-size: 12px; font-style: italic; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 6px; }
    th { background: #6366f1; color: #fff; text-align: left; padding: 5px 7px; }
    td { padding: 5px 7px; border-bottom: 1px solid #eee; }
    tbody tr:nth-child(even) { background: #f5f5fa; }
  </style>`;

const rs = (n: number) => `Rs.${n.toFixed(2)}`;
const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const d = (s: string) => new Date(s).toLocaleDateString();

function row(cells: (string | number)[], rightCols: number[] = []) {
  return `<tr>${cells
    .map(
      (c, i) =>
        `<td style="${rightCols.includes(i) ? "text-align:right;" : ""}">${
          typeof c === "string" ? c : c
        }</td>`
    )
    .join("")}</tr>`;
}

function table(head: string[], rows: string): string {
  return `<table><thead><tr>${head
    .map((h) => `<th>${esc(h)}</th>`)
    .join("")}</tr></thead><tbody>${rows}</tbody></table>`;
}

async function getJson(authFetch: Fetcher, path: string): Promise<any> {
  try {
    const res = await authFetch(path);
    return await res.json();
  } catch {
    return null;
  }
}

/** Member paid/share/net summary for a group's expenses (mirrors the web PDF). */
function memberSummary(expenses: Expense[]) {
  const map = new Map<string, { name: string; paid: number; share: number }>();
  for (const e of expenses) {
    const payerId = e.paidBy?.id ?? e.paidBy?.name ?? "?";
    if (!map.has(payerId)) map.set(payerId, { name: e.paidBy?.name ?? "-", paid: 0, share: 0 });
    map.get(payerId)!.paid += e.amount;
    for (const s of e.splits ?? []) {
      if (!map.has(s.memberId)) map.set(s.memberId, { name: s.name, paid: 0, share: 0 });
      map.get(s.memberId)!.share += s.amount;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.paid - b.share - (a.paid - a.share));
}

async function renderGroupSection(
  authFetch: Fetcher,
  group: Group
): Promise<string> {
  const [bal, exp] = await Promise.all([
    getJson(authFetch, `/api/projects/expense-tracker/reports/balances/${group._id}`),
    getJson(
      authFetch,
      `/api/projects/expense-tracker/expenses?groupId=${group._id}&limit=500&settled=all`
    ),
  ]);
  const expenses: Expense[] = exp?.expenses ?? [];
  const settlements: Settlement[] = bal?.settlements ?? [];
  if (expenses.length === 0) return "";

  const members = memberSummary(expenses);
  const memberTable = table(
    ["Member", "Total Paid", "Total Share", "Net"],
    members
      .map((m) => {
        const net = m.paid - m.share;
        return row(
          [esc(m.name), rs(m.paid), rs(m.share), `${net > 0 ? "+" : ""}${rs(net)}`],
          [1, 2, 3]
        );
      })
      .join("")
  );

  const settlementBlock =
    settlements.length > 0
      ? `<h3>Settlement Plan</h3>` +
        table(
          ["From", "Pays To", "Amount"],
          settlements
            .map((s) => row([esc(s.from.name), esc(s.to.name), rs(s.amount)], [2]))
            .join("")
        )
      : `<p class="ok">All settled — no pending payments.</p>`;

  const detailTable = table(
    ["Date", "Description", "Paid By", "Split Among", "Amount"],
    expenses
      .map((e) =>
        row(
          [
            d(e.date),
            esc(e.description),
            esc(e.paidBy?.name ?? "-"),
            esc((e.splitAmong ?? []).map((m) => m.name).join(", ") || "-"),
            rs(e.amount),
          ],
          [4]
        )
      )
      .join("")
  );

  return `
    <h2>Group: ${esc(group.name)}</h2>
    <p class="muted">Members: ${esc(group.members.map((m) => m.name).join(", "))}</p>
    <h3>Member Spending Summary</h3>
    ${memberTable}
    ${settlementBlock}
    <h3>Expense Details (${expenses.length} entries)</h3>
    ${detailTable}
  `;
}

/**
 * Full report PDF — mirrors the web Export PDF: summary, top groups, category
 * breakdown, monthly trend, the full All-Expenses table, and a per-group
 * section (member summary + settlement plan + expense details) for each group.
 */
export async function exportFullReportPdf(opts: {
  summary: Summary;
  authFetch: Fetcher;
  userName?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { summary, authFetch, userName, dateFrom, dateTo } = opts;
  const period =
    dateFrom || dateTo
      ? `${dateFrom || "Start"} to ${dateTo || "Present"}`
      : "All time";

  // Fetch all expenses (date-filtered) + every group, in parallel.
  const expParams = new URLSearchParams({ limit: "500", settled: "all" });
  if (dateFrom) expParams.set("dateFrom", dateFrom);
  if (dateTo) expParams.set("dateTo", dateTo);

  const [allExp, groupsData] = await Promise.all([
    getJson(authFetch, `/api/projects/expense-tracker/expenses?${expParams}`),
    getJson(authFetch, `/api/projects/expense-tracker/groups`),
  ]);
  const allExpenses: Expense[] = allExp?.expenses ?? [];
  const groups: Group[] = groupsData?.groups ?? [];

  const groupSections = (
    await Promise.all(groups.map((g) => renderGroupSection(authFetch, g)))
  ).join("");

  const topGroups =
    summary.byGroup.length > 0
      ? `<h2>Top Groups</h2>` +
        table(
          ["Group", "Entries", "Total", "My Share"],
          summary.byGroup
            .map((g) => row([esc(g.groupName), g.count, rs(g.total), rs(g.myShare)], [1, 2, 3]))
            .join("")
        )
      : "";

  const categories =
    summary.byCategory.length > 0
      ? `<h2>Category Breakdown</h2>` +
        table(
          ["Category", "Count", "Total", "% of Total"],
          summary.byCategory
            .map((c) =>
              row(
                [
                  esc(c.category),
                  c.count,
                  rs(c.total),
                  `${((c.total / summary.totalAmount) * 100).toFixed(1)}%`,
                ],
                [1, 2, 3]
              )
            )
            .join("")
        )
      : "";

  const monthly =
    summary.byMonth.length > 0
      ? `<h2>Monthly Trend</h2>` +
        table(
          ["Month", "Count", "Total"],
          summary.byMonth
            .map((m) => row([`${MONTHS[m.month - 1]} ${m.year}`, m.count, rs(m.total)], [1, 2]))
            .join("")
        )
      : "";

  const allExpensesTable =
    allExpenses.length > 0
      ? `<h2>All Expenses (${allExpenses.length})</h2>` +
        table(
          ["Date", "Description", "Category", "Paid By", "Split Among", "Amount", "Type"],
          allExpenses
            .map((e) =>
              row(
                [
                  d(e.date),
                  esc(e.description),
                  esc(e.category),
                  esc(e.paidBy?.name ?? "-"),
                  esc((e.splitAmong ?? []).map((m) => m.name).join(", ") || "-"),
                  rs(e.amount),
                  esc(e.type),
                ],
                [5]
              )
            )
            .join("")
        )
      : "";

  const largest = summary.largest
    ? `<p><b>Largest:</b> ${esc(summary.largest.description)} — ${rs(
        summary.largest.amount
      )} (${d(summary.largest.date)})</p>`
    : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />${PDF_STYLE}</head>
  <body>
    <h1>Expense Report</h1>
    <div class="sub">Period: ${esc(period)}</div>
    <div class="sub">Generated by ${esc(userName ?? "User")} on ${new Date().toLocaleDateString()}</div>
    <div class="stats">
      <h2>Summary</h2>
      <p><b>Total Expenses:</b> ${rs(summary.totalAmount)} &nbsp;·&nbsp; <b>Entries:</b> ${summary.totalCount}</p>
      <p><b>My Share:</b> ${rs(summary.myShare)} &nbsp;·&nbsp; <b>Paid by Me:</b> ${rs(summary.paidByMe)} &nbsp;·&nbsp; <b>Paid by Others:</b> ${rs(summary.paidByOthers)}</p>
      <p><b>Avg/Day:</b> ${rs(summary.averagePerDay)} &nbsp;·&nbsp; <b>Avg/Txn:</b> ${rs(summary.averagePerTransaction)} &nbsp;·&nbsp; <b>Days:</b> ${summary.daysCovered}</p>
      ${largest}
    </div>
    ${topGroups}
    ${categories}
    ${monthly}
    ${allExpensesTable}
    ${groupSections}
  </body></html>`;

  await printAndShare(html, "Expense Report");
}

/** Group-scoped report PDF: summary, top payers, category, monthly + the
 * group's member summary / settlement plan / expense details. */
export async function exportGroupReportPdf(opts: {
  summary: Summary;
  authFetch: Fetcher;
  groupId: string;
  groupName: string;
  userName?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { summary, authFetch, groupId, groupName, userName, dateFrom, dateTo } = opts;
  const period =
    dateFrom || dateTo ? `${dateFrom || "Start"} to ${dateTo || "Present"}` : "All time";

  const gData = await getJson(authFetch, `/api/projects/expense-tracker/groups/${groupId}`);
  const group: Group | undefined = gData?.group;
  const groupSection = group ? await renderGroupSection(authFetch, group) : "";

  const topPayers =
    (summary.topPayers?.length ?? 0) > 0
      ? `<h2>Top Payers</h2>` +
        table(
          ["Member", "Entries", "Total Paid", "Share"],
          summary
            .topPayers!.map((p) =>
              row(
                [
                  esc(p.name),
                  p.count,
                  rs(p.total),
                  `${((p.total / (summary.totalAmount || 1)) * 100).toFixed(1)}%`,
                ],
                [2, 3]
              )
            )
            .join("")
        )
      : "";

  const categories =
    summary.byCategory.length > 0
      ? `<h2>Category Breakdown</h2>` +
        table(
          ["Category", "Count", "Total", "% of Total"],
          summary.byCategory
            .map((c) =>
              row(
                [esc(c.category), c.count, rs(c.total), `${((c.total / (summary.totalAmount || 1)) * 100).toFixed(1)}%`],
                [1, 2, 3]
              )
            )
            .join("")
        )
      : "";

  const monthly =
    summary.byMonth.length > 0
      ? `<h2>Monthly Trend</h2>` +
        table(
          ["Month", "Count", "Total"],
          summary.byMonth
            .map((m) => row([`${MONTHS[m.month - 1]} ${m.year}`, m.count, rs(m.total)], [1, 2]))
            .join("")
        )
      : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />${PDF_STYLE}</head>
  <body>
    <h1>Group Report: ${esc(groupName)}</h1>
    <div class="sub">Period: ${esc(period)}</div>
    <div class="sub">Generated by ${esc(userName ?? "User")} on ${new Date().toLocaleDateString()}</div>
    <div class="stats">
      <h2>Summary</h2>
      <p><b>Total Expenses:</b> ${rs(summary.totalAmount)} &nbsp;·&nbsp; <b>Entries:</b> ${summary.totalCount}</p>
      <p><b>My Share:</b> ${rs(summary.myShare)} &nbsp;·&nbsp; <b>Paid by Me:</b> ${rs(summary.paidByMe)} &nbsp;·&nbsp; <b>Paid by Others:</b> ${rs(summary.paidByOthers)}</p>
      <p><b>Avg/Day:</b> ${rs(summary.averagePerDay)} &nbsp;·&nbsp; <b>Avg/Txn:</b> ${rs(summary.averagePerTransaction)} &nbsp;·&nbsp; <b>Days:</b> ${summary.daysCovered}</p>
    </div>
    ${topPayers}
    ${categories}
    ${monthly}
    ${groupSection}
  </body></html>`;

  await printAndShare(html, `Group Report — ${groupName}`);
}

async function printAndShare(html: string, dialogTitle: string) {
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle,
      UTI: "com.adobe.pdf",
    });
  }
}
