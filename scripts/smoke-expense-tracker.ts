/**
 * Phase 0 smoke test — exercises search, prefs, and CSV export against a running
 * dev server (http://localhost:3000) with real MongoDB. Inserts a few throwaway
 * expenses under a test user id, mints a JWT (requireAuth only checks the
 * signature, not a DB user), hits the endpoints, asserts, then cleans up.
 *
 * Run: npx tsx scripts/smoke-expense-tracker.ts   (dev server must be running)
 */
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const MONGODB_URI = process.env.MONGODB_URI!;
const JWT_SECRET = process.env.JWT_SECRET!;
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const API = `${BASE}/api/projects/expense-tracker`;

if (!MONGODB_URI || !JWT_SECRET) {
  console.error("Missing MONGODB_URI or JWT_SECRET in .env.local");
  process.exit(1);
}

const TEST_USER_ID = new mongoose.Types.ObjectId().toString();
const token = jwt.sign(
  { userId: TEST_USER_ID, email: "smoke@test.local", name: "Smoke Test" },
  JWT_SECRET,
  { expiresIn: "1h" }
);
const auth = { Authorization: `Bearer ${token}` };

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}  ${detail}`);
  }
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const expenses = mongoose.connection.collection("expenses");
  const prefs = mongoose.connection.collection("userprefs");

  const now = new Date();
  const seed = [
    { description: "Coffee at Starbucks", category: "Food & Groceries", amount: 250, direction: "expense" },
    { description: "Uber ride home", category: "Transport", amount: 400, direction: "expense" },
    { description: "Weekly grocery run", category: "Food & Groceries", amount: 1200, direction: "expense" },
    { description: "Monthly salary", category: "Salary", amount: 50000, direction: "income" },
  ].map((e) => ({
    type: "personal",
    direction: e.direction,
    groupId: null,
    createdBy: TEST_USER_ID,
    paidBy: { id: TEST_USER_ID, name: "Smoke Test" },
    amount: e.amount,
    description: e.description,
    category: e.category,
    date: now,
    splitAmong: [],
    splits: [],
    items: [],
    receiptUrl: null,
    rawExtraction: null,
    settledAt: null,
    settlementId: null,
    createdAt: now,
    updatedAt: now,
  }));

  console.log(`\nSeeding 3 expenses + 1 income for test user ${TEST_USER_ID}…`);
  await expenses.insertMany(seed);

  try {
    // 1. Search — "coffee" should match exactly one row.
    console.log("\n[search]");
    const sRes = await fetch(`${API}/expenses?q=coffee&settled=all`, { headers: auth });
    const sData = await sRes.json();
    check("GET /expenses?q=coffee → 200", sRes.status === 200, `got ${sRes.status}`);
    check("search returns exactly 1 row", sData.total === 1, `total=${sData.total}`);
    check(
      "matched row is the Starbucks one",
      sData.expenses?.[0]?.description === "Coffee at Starbucks"
    );

    // case-insensitive + partial
    const sRes2 = await fetch(`${API}/expenses?q=GROCERY&settled=all`, { headers: auth });
    const sData2 = await sRes2.json();
    check("case-insensitive 'GROCERY' matches 1", sData2.total === 1, `total=${sData2.total}`);

    // 1A. Direction filter (income tracking)
    console.log("\n[direction]");
    const expList = await (await fetch(`${API}/expenses?direction=expense&settled=all`, { headers: auth })).json();
    check("direction=expense → 3 spending rows", expList.total === 3, `total=${expList.total}`);
    const incList = await (await fetch(`${API}/expenses?direction=income&settled=all`, { headers: auth })).json();
    check("direction=income → 1 income row", incList.total === 1, `total=${incList.total}`);
    check("income row is the salary", incList.expenses?.[0]?.description === "Monthly salary");
    const allList = await (await fetch(`${API}/expenses?direction=all&settled=all`, { headers: auth })).json();
    check("direction=all → all 4 rows", allList.total === 4, `total=${allList.total}`);

    // 1A. Summary income/net math
    const sumRes = await fetch(`${API}/reports/summary?scope=personal&settled=all`, { headers: auth });
    const sum = await sumRes.json();
    check("summary spending excludes income (1850)", sum.totalAmount === 1850, `totalAmount=${sum.totalAmount}`);
    check("summary spending count is 3", sum.totalCount === 3, `totalCount=${sum.totalCount}`);
    check("summary incomeAmount is 50000", sum.incomeAmount === 50000, `incomeAmount=${sum.incomeAmount}`);
    check("summary netAmount is 48150", sum.netAmount === 48150, `netAmount=${sum.netAmount}`);

    // 1A. Create + validation rules via the API
    console.log("\n[income create/validation]");
    const goodIncome = await fetch(`${API}/expenses`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "personal", direction: "income", category: "Freelance",
        paidBy: { id: TEST_USER_ID, name: "Smoke Test" },
        amount: 8000, description: "Side gig", date: now.toISOString().slice(0, 10),
      }),
    });
    check("POST income (valid) → 201", goodIncome.status === 201, `got ${goodIncome.status}`);
    const badCat = await fetch(`${API}/expenses`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "personal", direction: "income", category: "Transport",
        paidBy: { id: TEST_USER_ID, name: "Smoke Test" },
        amount: 100, description: "bad", date: now.toISOString().slice(0, 10),
      }),
    });
    check("POST income w/ expense category → 400", badCat.status === 400, `got ${badCat.status}`);
    const badType = await fetch(`${API}/expenses`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "group", direction: "income", category: "Salary",
        paidBy: { id: TEST_USER_ID, name: "Smoke Test" },
        amount: 100, description: "bad", date: now.toISOString().slice(0, 10),
      }),
    });
    check("POST income w/ type group → 400", badType.status === 400, `got ${badType.status}`);

    // 1B. Multi-currency — create a USD expense, expect conversion to INR base.
    console.log("\n[currency]");
    const usdRes = await fetch(`${API}/expenses`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "personal", direction: "expense", currency: "USD", category: "Transport",
        paidBy: { id: TEST_USER_ID, name: "Smoke Test" },
        amount: 100, description: "USD taxi", date: now.toISOString().slice(0, 10),
      }),
    });
    const usd = await usdRes.json();
    check("POST USD expense → 201", usdRes.status === 201, `got ${usdRes.status}`);
    const exp = usd.expense ?? {};
    check("stored currency is USD", exp.currency === "USD", `currency=${exp.currency}`);
    check(
      "amountBase converted to INR (≈ 70–110× )",
      typeof exp.amountBase === "number" && exp.amountBase > 7000 && exp.amountBase < 11000,
      `amountBase=${exp.amountBase}`
    );
    check("base differs from raw amount", exp.amountBase !== 100);

    // base-currency entries should NOT call FX (amountBase === amount)
    const inrRes = await fetch(`${API}/expenses`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "personal", direction: "expense", currency: "INR", category: "Transport",
        paidBy: { id: TEST_USER_ID, name: "Smoke Test" },
        amount: 500, description: "INR auto", date: now.toISOString().slice(0, 10),
      }),
    });
    const inr = (await inrRes.json()).expense ?? {};
    check("INR entry: amountBase === amount", inr.amountBase === 500, `amountBase=${inr.amountBase}`);

    // unsupported currency rejected
    const badCur = await fetch(`${API}/expenses`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "personal", currency: "XYZ", category: "Transport",
        paidBy: { id: TEST_USER_ID, name: "Smoke Test" },
        amount: 10, description: "bad cur", date: now.toISOString().slice(0, 10),
      }),
    });
    check("unsupported currency → 400", badCur.status === 400, `got ${badCur.status}`);

    // summary should sum the converted (base) amount, not the raw 100
    const csum = await (await fetch(`${API}/reports/summary?scope=personal&settled=all`, { headers: auth })).json();
    check(
      "summary spending uses base amounts (USD converted)",
      csum.totalAmount > 1850 + 500 + 7000,
      `totalAmount=${csum.totalAmount}`
    );

    // no filter → all rows (≥4)
    const allRes = await fetch(`${API}/expenses?settled=all`, { headers: auth });
    const allData = await allRes.json();
    check("no-direction list returns all rows (≥4)", allData.total >= 4, `total=${allData.total}`);

    // CORE. Update + delete + settle (flows touched by recent phases)
    console.log("\n[crud + settle]");
    const usdId = exp._id;
    const upd = await fetch(`${API}/expenses/${usdId}`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 50, currency: "EUR" }),
    });
    const updData = await upd.json();
    check("PUT update → 200", upd.status === 200, `got ${upd.status}`);
    check("update re-stored currency EUR", updData.expense?.currency === "EUR", `currency=${updData.expense?.currency}`);
    check(
      "update recomputed amountBase (EUR→INR)",
      updData.expense?.amountBase > 3000 && updData.expense?.amountBase < 7000,
      `amountBase=${updData.expense?.amountBase}`
    );

    const del = await fetch(`${API}/expenses/${usdId}`, { method: "DELETE", headers: auth });
    check("DELETE → 200", del.status === 200, `got ${del.status}`);
    const afterDel = await (await fetch(`${API}/expenses?settled=all`, { headers: auth })).json();
    check("deleted row is gone", !(afterDel.expenses ?? []).some((e: any) => e._id === usdId));

    // Personal settle moves active personal entries into settled history.
    const settle = await fetch(`${API}/personal/settle`, { method: "POST", headers: auth });
    check("personal settle → 200", settle.status === 200, `got ${settle.status}`);
    const histData = await (await fetch(`${API}/personal/history`, { headers: auth })).json();
    check("settlement appears in history", (histData.history?.length ?? 0) >= 1, `history=${histData.history?.length}`);
    const activeAfter = await (await fetch(`${API}/expenses?direction=expense&settled=false`, { headers: auth })).json();
    check("no active personal expenses after settle", activeAfter.total === 0, `active=${activeAfter.total}`);

    // 2. Prefs — defaults, then update, then persistence.
    console.log("\n[prefs]");
    const pRes = await fetch(`${API}/prefs`, { headers: auth });
    const pData = await pRes.json();
    check("GET /prefs → 200", pRes.status === 200, `got ${pRes.status}`);
    check("default baseCurrency is INR", pData.prefs?.baseCurrency === "INR", JSON.stringify(pData));

    const patchRes = await fetch(`${API}/prefs`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ baseCurrency: "usd", weekStart: 0 }),
    });
    const patchData = await patchRes.json();
    check("PATCH /prefs → 200", patchRes.status === 200, `got ${patchRes.status}`);
    check("baseCurrency uppercased to USD", patchData.prefs?.baseCurrency === "USD", JSON.stringify(patchData));
    check("weekStart updated to 0", patchData.prefs?.weekStart === 0);

    const pRes2 = await fetch(`${API}/prefs`, { headers: auth });
    const pData2 = await pRes2.json();
    check("prefs persisted (USD on reread)", pData2.prefs?.baseCurrency === "USD");

    const badPatch = await fetch(`${API}/prefs`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ baseCurrency: "rupees" }),
    });
    check("invalid currency → 400", badPatch.status === 400, `got ${badPatch.status}`);

    // 3. CSV export (direction=expense for a deterministic row count)
    console.log("\n[export]");
    const eRes = await fetch(`${API}/expenses/export?direction=expense&settled=all`, { headers: auth });
    const ctype = eRes.headers.get("content-type") ?? "";
    const csv = await eRes.text();
    const lines = csv.replace(/^﻿/, "").trim().split(/\r\n/);
    check("GET /expenses/export → 200", eRes.status === 200, `got ${eRes.status}`);
    check("content-type is text/csv", ctype.includes("text/csv"), ctype);
    check(
      "CSV header has Direction + Currency columns",
      lines[0] === "Date,Description,Category,Direction,Type,Paid By,Amount,Currency,Amount (base),Split Among,Settled",
      lines[0]
    );
    check("CSV export=expense has ≥3 data rows", lines.length >= 4, `lines=${lines.length}`);
    check("CSV contains Starbucks row", csv.includes("Coffee at Starbucks"));
    check("CSV (expense) excludes salary income", !csv.includes("Monthly salary"));

    // income export shows the income row
    const eRes2 = await fetch(`${API}/expenses/export?direction=income&settled=all`, { headers: auth });
    const csv2 = await eRes2.text();
    check("CSV (income) includes salary row", csv2.includes("Monthly salary"));
    check("CSV income row marked 'income'", /Monthly salary,Salary,income/.test(csv2), csv2);
  } finally {
    console.log("\nCleaning up test data…");
    await expenses.deleteMany({ createdBy: TEST_USER_ID });
    await prefs.deleteMany({ userId: TEST_USER_ID });
    await mongoose.disconnect();
  }

  console.log(`\n──────────\nResult: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
