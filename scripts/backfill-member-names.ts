/**
 * One-time backfill: sync each user's current display name into every
 * denormalized copy — group memberships, expense payers, and split entries.
 *
 * Why: names are captured at write time, so renaming yourself (e.g. "Michael"
 * -> "Mohit Patel") left old groups/expenses showing the stale name. Going
 * forward, PATCH /api/profile keeps these in sync automatically; this script
 * fixes the data that predates that change.
 *
 * Safe to run repeatedly (idempotent). Usage:
 *   npx tsx scripts/backfill-member-names.ts
 */
import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not found in .env.local");
  process.exit(1);
}

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI!);
  const db = mongoose.connection.db;
  if (!db) {
    console.error("No database connection");
    process.exit(1);
  }
  console.log("Connected.\n");

  const users = await db
    .collection("users")
    .find({}, { projection: { _id: 1, name: 1 } })
    .toArray();
  console.log(`Scanning ${users.length} users...\n`);

  const groups = db.collection("groups");
  const expenses = db.collection("expenses");
  let groupsChanged = 0;
  let payersChanged = 0;
  let splitAmongChanged = 0;
  let splitsChanged = 0;

  for (const u of users) {
    const userId = u._id.toString();
    const name = (u.name ?? "").trim();
    if (!name) continue;

    const [g, p, sa, sp] = await Promise.all([
      groups.updateMany(
        { members: { $elemMatch: { userId, name: { $ne: name } } } },
        { $set: { "members.$[m].name": name } },
        { arrayFilters: [{ "m.userId": userId }] }
      ),
      expenses.updateMany(
        { "paidBy.id": userId, "paidBy.name": { $ne: name } },
        { $set: { "paidBy.name": name } }
      ),
      expenses.updateMany(
        { splitAmong: { $elemMatch: { memberId: userId, name: { $ne: name } } } },
        { $set: { "splitAmong.$[m].name": name } },
        { arrayFilters: [{ "m.memberId": userId }] }
      ),
      expenses.updateMany(
        { splits: { $elemMatch: { memberId: userId, name: { $ne: name } } } },
        { $set: { "splits.$[m].name": name } },
        { arrayFilters: [{ "m.memberId": userId }] }
      ),
    ]);

    if (g.modifiedCount || p.modifiedCount || sa.modifiedCount || sp.modifiedCount) {
      console.log(
        `  ${name} (${userId}): groups=${g.modifiedCount} payers=${p.modifiedCount} splitAmong=${sa.modifiedCount} splits=${sp.modifiedCount}`
      );
    }
    groupsChanged += g.modifiedCount;
    payersChanged += p.modifiedCount;
    splitAmongChanged += sa.modifiedCount;
    splitsChanged += sp.modifiedCount;
  }

  console.log(
    `\nDone. Updated: groups=${groupsChanged}, expense payers=${payersChanged}, splitAmong=${splitAmongChanged}, splits=${splitsChanged}.`
  );
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
