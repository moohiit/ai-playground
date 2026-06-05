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
    { description: "Coffee at Starbucks", category: "Food & Groceries", amount: 250 },
    { description: "Uber ride home", category: "Transport", amount: 400 },
    { description: "Weekly grocery run", category: "Food & Groceries", amount: 1200 },
  ].map((e) => ({
    type: "personal",
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

  console.log(`\nSeeding 3 expenses for test user ${TEST_USER_ID}…`);
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

    // no filter → all 3
    const allRes = await fetch(`${API}/expenses?settled=all`, { headers: auth });
    const allData = await allRes.json();
    check("no-query list returns all 3", allData.total === 3, `total=${allData.total}`);

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

    // 3. CSV export
    console.log("\n[export]");
    const eRes = await fetch(`${API}/expenses/export?settled=all`, { headers: auth });
    const ctype = eRes.headers.get("content-type") ?? "";
    const csv = await eRes.text();
    const lines = csv.replace(/^﻿/, "").trim().split(/\r\n/);
    check("GET /expenses/export → 200", eRes.status === 200, `got ${eRes.status}`);
    check("content-type is text/csv", ctype.includes("text/csv"), ctype);
    check("CSV header present", lines[0] === "Date,Description,Category,Type,Paid By,Amount,Split Among,Settled", lines[0]);
    check("CSV has 3 data rows", lines.length === 4, `lines=${lines.length}`);
    check("CSV contains Starbucks row", csv.includes("Coffee at Starbucks"));

    // export honours the search filter too
    const eRes2 = await fetch(`${API}/expenses/export?q=uber&settled=all`, { headers: auth });
    const csv2 = (await eRes2.text()).replace(/^﻿/, "").trim().split(/\r\n/);
    check("filtered export → header + 1 row", csv2.length === 2, `lines=${csv2.length}`);
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
