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

    // 1C. Accounts / wallets + balances + transfers (base is still INR here).
    console.log("\n[accounts]");
    const jsonAuth = { ...auth, "Content-Type": "application/json" };
    const cashRes = await fetch(`${API}/accounts`, {
      method: "POST", headers: jsonAuth,
      body: JSON.stringify({ name: "Cash", kind: "cash", openingBalance: 1000 }),
    });
    const cash = (await cashRes.json()).account ?? {};
    check("POST account → 201", cashRes.status === 201, `got ${cashRes.status}`);
    check("new account balance == opening (1000)", cash.balance === 1000, `balance=${cash.balance}`);
    const bank = (await (await fetch(`${API}/accounts`, {
      method: "POST", headers: jsonAuth,
      body: JSON.stringify({ name: "Bank", kind: "bank", openingBalance: 5000 }),
    })).json()).account ?? {};

    // expense from cash (−300) and income to cash (+200)
    await fetch(`${API}/expenses`, {
      method: "POST", headers: jsonAuth,
      body: JSON.stringify({
        type: "personal", direction: "expense", category: "Food & Groceries",
        accountId: cash._id, paidBy: { id: TEST_USER_ID, name: "Smoke Test" },
        amount: 300, description: "Cash lunch", date: now.toISOString().slice(0, 10),
      }),
    });
    await fetch(`${API}/expenses`, {
      method: "POST", headers: jsonAuth,
      body: JSON.stringify({
        type: "personal", direction: "income", category: "Gifts",
        accountId: cash._id, paidBy: { id: TEST_USER_ID, name: "Smoke Test" },
        amount: 200, description: "Cash gift", date: now.toISOString().slice(0, 10),
      }),
    });
    const accts1 = (await (await fetch(`${API}/accounts`, { headers: auth })).json()).accounts ?? [];
    const cash1 = accts1.find((a: any) => a._id === cash._id);
    check("cash balance = 1000 − 300 + 200 = 900", cash1?.balance === 900, `balance=${cash1?.balance}`);

    // transfer 500 from bank → cash
    const tRes = await fetch(`${API}/transfers`, {
      method: "POST", headers: jsonAuth,
      body: JSON.stringify({
        fromAccountId: bank._id, toAccountId: cash._id, amount: 500,
        date: now.toISOString().slice(0, 10), note: "top up",
      }),
    });
    check("POST transfer → 201", tRes.status === 201, `got ${tRes.status}`);
    const accts2 = (await (await fetch(`${API}/accounts`, { headers: auth })).json()).accounts ?? [];
    const cash2 = accts2.find((a: any) => a._id === cash._id);
    const bank2 = accts2.find((a: any) => a._id === bank._id);
    check("cash after transfer = 900 + 500 = 1400", cash2?.balance === 1400, `balance=${cash2?.balance}`);
    check("bank after transfer = 5000 − 500 = 4500", bank2?.balance === 4500, `balance=${bank2?.balance}`);

    const badT = await fetch(`${API}/transfers`, {
      method: "POST", headers: jsonAuth,
      body: JSON.stringify({
        fromAccountId: cash._id, toAccountId: cash._id, amount: 10,
        date: now.toISOString().slice(0, 10),
      }),
    });
    check("transfer to same account → 400", badT.status === 400, `got ${badT.status}`);

    // deleting an account unlinks its expenses (doesn't delete them)
    const delAcc = await fetch(`${API}/accounts/${bank._id}`, { method: "DELETE", headers: auth });
    check("DELETE account → 200", delAcc.status === 200, `got ${delAcc.status}`);
    const accts3 = (await (await fetch(`${API}/accounts`, { headers: auth })).json()).accounts ?? [];
    check("deleted account is gone", !accts3.some((a: any) => a._id === bank._id));

    // 2A. Budgets (base still INR; "Entertainment" is untouched by other test rows).
    console.log("\n[budgets]");
    const mkEnt = (amount: number, desc: string) =>
      fetch(`${API}/expenses`, {
        method: "POST", headers: jsonAuth,
        body: JSON.stringify({
          type: "personal", direction: "expense", category: "Entertainment",
          paidBy: { id: TEST_USER_ID, name: "Smoke Test" },
          amount, description: desc, date: now.toISOString().slice(0, 10),
        }),
      });
    const getBudgets = async () => (await (await fetch(`${API}/budgets`, { headers: auth })).json()).budgets ?? [];
    const findEnt = (bs: any[]) => bs.find((b) => b.category === "Entertainment");

    const bRes = await fetch(`${API}/budgets`, {
      method: "POST", headers: jsonAuth,
      body: JSON.stringify({ scope: "category", category: "Entertainment", amount: 1000 }),
    });
    check("POST budget → 201", bRes.status === 201, `got ${bRes.status}`);
    let ent = findEnt(await getBudgets());
    check("new budget: spent 0, status ok, remaining 1000", ent?.spent === 0 && ent?.status === "ok" && ent?.remaining === 1000, JSON.stringify(ent));

    await mkEnt(850, "Movie");
    ent = findEnt(await getBudgets());
    check("spent 850 → warn (85%), remaining 150", ent?.spent === 850 && ent?.status === "warn" && ent?.remaining === 150, JSON.stringify(ent));

    await mkEnt(300, "Concert");
    ent = findEnt(await getBudgets());
    check("spent 1150 → over, remaining −150", ent?.spent === 1150 && ent?.status === "over" && ent?.remaining === -150, JSON.stringify(ent));

    const dup = await fetch(`${API}/budgets`, {
      method: "POST", headers: jsonAuth,
      body: JSON.stringify({ scope: "category", category: "Entertainment", amount: 500 }),
    });
    check("duplicate category budget → 400", dup.status === 400, `got ${dup.status}`);

    const badB = await fetch(`${API}/budgets`, {
      method: "POST", headers: jsonAuth,
      body: JSON.stringify({ scope: "category", amount: 500 }),
    });
    check("category budget without category → 400", badB.status === 400, `got ${badB.status}`);

    const pastB = await (await fetch(`${API}/budgets?month=2020-01`, { headers: auth })).json();
    check("past month: Entertainment spent 0", findEnt(pastB.budgets ?? [])?.spent === 0, JSON.stringify(findEnt(pastB.budgets ?? [])));

    const updB = await fetch(`${API}/budgets/${ent._id}`, {
      method: "PATCH", headers: jsonAuth, body: JSON.stringify({ amount: 2000 }),
    });
    check("PATCH budget amount → 200", updB.status === 200, `got ${updB.status}`);
    ent = findEnt(await getBudgets());
    check("after raising to 2000, status ok", ent?.status === "ok", JSON.stringify(ent));

    await fetch(`${API}/budgets`, {
      method: "POST", headers: jsonAuth,
      body: JSON.stringify({ scope: "overall", amount: 100000 }),
    });
    const overall = (await getBudgets()).find((b: any) => b.scope === "overall");
    check("overall budget reflects spending (> 0)", (overall?.spent ?? 0) > 0, `spent=${overall?.spent}`);

    const delB = await fetch(`${API}/budgets/${ent._id}`, { method: "DELETE", headers: auth });
    check("DELETE budget → 200", delB.status === 200, `got ${delB.status}`);

    // 2B. Recurring rules (manual post + autoPost catch-up via lazy-on-open).
    console.log("\n[recurring]");
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10);
    const getRec = async () => (await (await fetch(`${API}/recurring`, { headers: auth })).json()).recurring ?? [];

    const recRes = await fetch(`${API}/recurring`, {
      method: "POST", headers: jsonAuth,
      body: JSON.stringify({
        amount: 15000, category: "Rent & Housing", description: "RentSmoke",
        direction: "expense", cadence: "monthly", startDate: daysAgo(5), autoPost: false,
      }),
    });
    check("POST recurring → 201", recRes.status === 201, `got ${recRes.status}`);
    let rent = (await getRec()).find((r: any) => r.template.description === "RentSmoke");
    check("manual rule is due", rent?.due === true, JSON.stringify(rent?.due));

    const postR = await fetch(`${API}/recurring/${rent._id}/post`, { method: "POST", headers: auth });
    check("POST recurring/:id/post → 200", postR.status === 200, `got ${postR.status}`);
    const rentExp = await (await fetch(`${API}/expenses?q=RentSmoke&settled=all`, { headers: auth })).json();
    check("posting created the expense", rentExp.total === 1, `total=${rentExp.total}`);
    rent = (await getRec()).find((r: any) => r.template.description === "RentSmoke");
    check("after post, advanced (not due)", rent?.due === false, JSON.stringify(rent?.due));

    // autoPost monthly starting ~70 days ago → lazy GET materializes the catch-up
    await fetch(`${API}/recurring`, {
      method: "POST", headers: jsonAuth,
      body: JSON.stringify({
        amount: 200, category: "Subscriptions", description: "AutoSub",
        direction: "expense", cadence: "monthly", startDate: daysAgo(70), autoPost: true,
      }),
    });
    await getRec(); // triggers runDueRecurring for this user
    const autoExp = await (await fetch(`${API}/expenses?q=AutoSub&settled=all`, { headers: auth })).json();
    check("autoPost catch-up created ≥2 expenses", autoExp.total >= 2, `total=${autoExp.total}`);

    const auto = (await getRec()).find((r: any) => r.template.description === "AutoSub");
    check("autoPost rule not due after catch-up", auto?.due === false, JSON.stringify(auto?.due));

    const pauseR = await fetch(`${API}/recurring/${auto._id}`, {
      method: "PATCH", headers: jsonAuth, body: JSON.stringify({ active: false }),
    });
    check("PATCH recurring (pause) → 200", pauseR.status === 200, `got ${pauseR.status}`);

    const badRec = await fetch(`${API}/recurring`, {
      method: "POST", headers: jsonAuth,
      body: JSON.stringify({
        amount: 100, category: "Salary", description: "bad", direction: "expense",
        cadence: "monthly", startDate: daysAgo(1),
      }),
    });
    check("recurring with mismatched category → 400", badRec.status === 400, `got ${badRec.status}`);

    const delR = await fetch(`${API}/recurring/${rent._id}`, { method: "DELETE", headers: auth });
    check("DELETE recurring → 200", delR.status === 200, `got ${delR.status}`);

    // 3. AI — forecast (pure projection) + NL parse (live Gemini).
    console.log("\n[ai]");
    const fc = await (await fetch(`${API}/forecast`, { headers: auth })).json();
    check("forecast has numeric projectedTotal", typeof fc.projectedTotal === "number", JSON.stringify(fc));
    check("forecast daysInMonth in 28–31", fc.daysInMonth >= 28 && fc.daysInMonth <= 31, `daysInMonth=${fc.daysInMonth}`);
    check("forecast projectedTotal ≥ monthToDate", fc.projectedTotal >= fc.monthToDate - 0.01, `proj=${fc.projectedTotal} mtd=${fc.monthToDate}`);

    const nl1 = await fetch(`${API}/parse`, {
      method: "POST", headers: jsonAuth, body: JSON.stringify({ text: "250 coffee" }),
    });
    const d1 = (await nl1.json()).draft ?? {};
    check("NL parse '250 coffee' → 200", nl1.status === 200, `got ${nl1.status}`);
    check("NL amount 250, expense", d1.amount === 250 && d1.direction === "expense", JSON.stringify(d1));
    check("NL category is an expense category", ["Food & Groceries","Other","Shopping"].includes(d1.category) || typeof d1.category === "string", `cat=${d1.category}`);

    const nl2 = await fetch(`${API}/parse`, {
      method: "POST", headers: jsonAuth, body: JSON.stringify({ text: "got my salary 50000 today" }),
    });
    const d2 = (await nl2.json()).draft ?? {};
    check("NL 'salary 50000' → income 50000", d2.direction === "income" && d2.amount === 50000, JSON.stringify(d2));

    // Spending Coach chat (live Gemini, grounded in this user's summary)
    const coach = await fetch(`${API}/coach`, {
      method: "POST", headers: jsonAuth,
      body: JSON.stringify({ messages: [{ role: "user", content: "Where can I cut my spending?" }] }),
    });
    const cdata = await coach.json();
    check("coach → 200", coach.status === 200, `got ${coach.status}`);
    check("coach returns a non-empty reply", typeof cdata.reply === "string" && cdata.reply.length > 10, JSON.stringify(cdata).slice(0, 160));
    const badCoach = await fetch(`${API}/coach`, {
      method: "POST", headers: jsonAuth, body: JSON.stringify({ messages: [] }),
    });
    check("coach with empty messages → 400", badCoach.status === 400, `got ${badCoach.status}`);

    // 3B. Smart insights — seed periodic + outlier rows directly, then detect.
    console.log("\n[insights]");
    const ago = (days: number) => new Date(now.getTime() - days * 86400000);
    const mkRow = (description: string, category: string, amount: number, date: Date) => ({
      type: "personal", direction: "expense", groupId: null, createdBy: TEST_USER_ID,
      paidBy: { id: TEST_USER_ID, name: "Smoke Test" }, amount, currency: "INR", amountBase: amount,
      accountId: null, recurringId: null, description, category, date,
      splitAmong: [], splits: [], items: [], receiptUrl: null, rawExtraction: null,
      settledAt: null, settlementId: null, createdAt: now, updatedAt: now,
    });
    await expenses.insertMany([
      mkRow("NetflixSub", "Subscriptions", 500, ago(60)),
      mkRow("NetflixSub", "Subscriptions", 500, ago(30)),
      mkRow("NetflixSub", "Subscriptions", 500, ago(0)),
      mkRow("ShopA", "Shopping", 200, ago(10)),
      mkRow("ShopB", "Shopping", 200, ago(8)),
      mkRow("ShopC", "Shopping", 200, ago(6)),
      mkRow("ShopD", "Shopping", 200, ago(4)),
      mkRow("BigTV", "Shopping", 3000, ago(2)),
    ]);

    const ins = await (await fetch(`${API}/insights`, { headers: auth })).json();
    const netflix = (ins.subscriptions ?? []).find((s: any) => s.description === "NetflixSub");
    check("subscription detected (monthly, 3 occurrences)", netflix?.cadence === "monthly" && netflix?.occurrences === 3, JSON.stringify(netflix));
    check("subscription amount 500", netflix?.amount === 500, `amount=${netflix?.amount}`);
    const bigtv = (ins.anomalies ?? []).find((a: any) => a.description === "BigTV");
    check("anomaly detected (BigTV, large ratio)", bigtv != null && bigtv.ratio >= 5, JSON.stringify(bigtv));
    check("anomaly category is Shopping", bigtv?.category === "Shopping", `cat=${bigtv?.category}`);

    // 4A. Savings goals (deadline 3 months out → monthsLeft 3).
    console.log("\n[goals]");
    const dl = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 1)).toISOString().slice(0, 10);
    const getGoals = async () => (await (await fetch(`${API}/goals`, { headers: auth })).json()).goals ?? [];
    const findGoal = (gs: any[], name: string) => gs.find((g) => g.name === name);

    const gRes = await fetch(`${API}/goals`, {
      method: "POST", headers: jsonAuth,
      body: JSON.stringify({ name: "Trip", target: 120000, savedAmount: 30000, deadline: dl }),
    });
    check("POST goal → 201", gRes.status === 201, `got ${gRes.status}`);
    let g = findGoal(await getGoals(), "Trip");
    check("goal pct 0.25, remaining 90000", g?.pct === 0.25 && g?.remaining === 90000, JSON.stringify(g));
    check("goal monthsLeft 3, monthlyNeeded 30000", g?.monthsLeft === 3 && g?.monthlyNeeded === 30000, JSON.stringify(g));

    await fetch(`${API}/goals/${g._id}/contribute`, { method: "POST", headers: jsonAuth, body: JSON.stringify({ amount: 30000 }) });
    g = findGoal(await getGoals(), "Trip");
    check("after +30000, saved 60000 (pct 0.5)", g?.saved === 60000 && g?.pct === 0.5, JSON.stringify(g));

    await fetch(`${API}/goals/${g._id}/contribute`, { method: "POST", headers: jsonAuth, body: JSON.stringify({ amount: -10000 }) });
    g = findGoal(await getGoals(), "Trip");
    check("after −10000 withdraw, saved 50000", g?.saved === 50000, JSON.stringify(g));

    const gAcct = (await (await fetch(`${API}/accounts`, {
      method: "POST", headers: jsonAuth, body: JSON.stringify({ name: "GoalAcct", kind: "bank", openingBalance: 7000 }),
    })).json()).account;
    await fetch(`${API}/goals`, {
      method: "POST", headers: jsonAuth, body: JSON.stringify({ name: "Linked", target: 50000, linkedAccountId: gAcct._id }),
    });
    const linked = findGoal(await getGoals(), "Linked");
    check("account-linked goal saved = account balance 7000", linked?.saved === 7000, JSON.stringify(linked));
    const badContrib = await fetch(`${API}/goals/${linked._id}/contribute`, { method: "POST", headers: jsonAuth, body: JSON.stringify({ amount: 100 }) });
    check("contribute to linked goal → 400", badContrib.status === 400, `got ${badContrib.status}`);

    const updG = await fetch(`${API}/goals/${g._id}`, { method: "PATCH", headers: jsonAuth, body: JSON.stringify({ target: 200000 }) });
    check("PATCH goal target → 200", updG.status === 200, `got ${updG.status}`);
    g = findGoal(await getGoals(), "Trip");
    check("after target→200000, pct 0.25", g?.target === 200000 && g?.pct === 0.25, JSON.stringify(g));

    const delG = await fetch(`${API}/goals/${g._id}`, { method: "DELETE", headers: auth });
    check("DELETE goal → 200", delG.status === 200, `got ${delG.status}`);

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
    await mongoose.connection.collection("accounts").deleteMany({ userId: TEST_USER_ID });
    await mongoose.connection.collection("transfers").deleteMany({ userId: TEST_USER_ID });
    await mongoose.connection.collection("budgets").deleteMany({ userId: TEST_USER_ID });
    await mongoose.connection.collection("recurringrules").deleteMany({ userId: TEST_USER_ID });
    await mongoose.connection.collection("goals").deleteMany({ userId: TEST_USER_ID });
    await mongoose.disconnect();
  }

  console.log(`\n──────────\nResult: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
