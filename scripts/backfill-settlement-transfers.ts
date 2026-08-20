/**
 * One-time backfill: lift settle-up payments out of already-settled batches.
 *
 * Why: individual "X paid Y" payments were stored as expenses with
 * isSettlement and swept into the settled batch. That inflated both Paid and
 * Share for the members involved, so the history table showed them at a net of
 * zero and the batch total counted money that was only moving between members
 * (see PG Partners, 9 Aug). Payments are now recorded on a GroupSettlement
 * document instead; this fixes the batches that predate that change.
 *
 * For every settled batch it creates a GroupSettlement carrying the payments
 * as transfers, then deletes those payment rows. Real expenses are untouched.
 *
 * Idempotent: a batch that already has a GroupSettlement record is skipped.
 * Pass --dry to print what would change without writing.
 *
 * Usage:
 *   npx tsx scripts/backfill-settlement-transfers.ts --dry
 *   npx tsx scripts/backfill-settlement-transfers.ts
 */
import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not found in .env / .env.local");
  process.exit(1);
}

const DRY = process.argv.includes("--dry");

async function run() {
  await mongoose.connect(MONGODB_URI!);
  const db = mongoose.connection.db!;
  const expenses = db.collection("expenses");
  const settlements = db.collection("groupsettlements");

  // Settled settle-up payments, grouped by the batch they were swept into.
  const rows = await expenses
    .find({ isSettlement: true, settledAt: { $ne: null } })
    .toArray();

  const byBatch = new Map<string, typeof rows>();
  for (const r of rows) {
    const sid = (r.settlementId as string) ?? "unknown";
    if (!byBatch.has(sid)) byBatch.set(sid, []);
    byBatch.get(sid)!.push(r);
  }

  if (byBatch.size === 0) {
    console.log("Nothing to backfill — no settled payment rows found.");
    return;
  }

  let created = 0;
  let removed = 0;

  for (const [settlementId, payments] of byBatch) {
    const existing = await settlements.findOne({ settlementId });
    if (existing) {
      console.log(`  skip ${settlementId} — already has a settlement record`);
      continue;
    }

    const first = payments[0];
    const transfers = payments.map((p) => ({
      from: { id: p.paidBy?.id ?? "", name: p.paidBy?.name ?? "-" },
      to: {
        id: p.splits?.[0]?.memberId ?? "",
        name: p.splits?.[0]?.name ?? "-",
      },
      amount: p.amountBase ?? p.amount,
      paidAt: p.date,
    }));

    const total = transfers.reduce((s, t) => s + t.amount, 0);
    console.log(
      `  ${settlementId}: ${transfers.length} payment(s), ${total.toFixed(2)} lifted out of the batch`
    );
    for (const t of transfers) {
      console.log(`      ${t.from.name} → ${t.to.name}  ${t.amount}`);
    }

    if (DRY) continue;

    await settlements.insertOne({
      groupId: first.groupId,
      settlementId,
      settledAt: first.settledAt,
      settledBy: first.createdBy ?? "",
      transfers,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    created++;

    const res = await expenses.deleteMany({
      _id: { $in: payments.map((p) => p._id) },
    });
    removed += res.deletedCount ?? 0;
  }

  console.log(
    DRY
      ? `\nDry run — ${byBatch.size} batch(es) would be rewritten. Re-run without --dry to apply.`
      : `\nDone — ${created} settlement record(s) created, ${removed} payment row(s) removed.`
  );
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
