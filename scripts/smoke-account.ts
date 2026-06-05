/**
 * Account smoke test — profile read/update, change password, and delete account.
 * Creates a throwaway verified user, exercises the endpoints against a running
 * dev server, and cleans up. Never touches real accounts.
 *
 * Run: SMOKE_BASE_URL=http://localhost:3000 npx tsx scripts/smoke-account.ts
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const MONGODB_URI = process.env.MONGODB_URI!;
const JWT_SECRET = process.env.JWT_SECRET!;
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

let pass = 0,
  fail = 0;
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
  const users = mongoose.connection.collection("users");

  const stamp = `${Date.now()}`;
  const email = `smoke-acct-${stamp}@test.local`;
  const hash = await bcrypt.hash("oldpass123", 12);
  const insert = await users.insertOne({
    name: "Smoke Acct",
    email,
    passwordHash: hash,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const userId = insert.insertedId.toString();
  const token = jwt.sign({ userId, email, name: "Smoke Acct" }, JWT_SECRET, {
    expiresIn: "10m",
  });
  const auth = { Authorization: `Bearer ${token}` };
  console.log(`\nCreated throwaway user ${email}`);

  let userStillExists = true;
  try {
    // Profile read
    console.log("\n[profile]");
    const prof = await (await fetch(`${BASE}/api/profile`, { headers: auth })).json();
    check("GET /api/profile name", prof.user?.name === "Smoke Acct", JSON.stringify(prof));
    check("GET /api/profile email", prof.user?.email === email);

    // Update name
    const patch = await fetch(`${BASE}/api/profile`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Acct" }),
    });
    const patchData = await patch.json();
    check("PATCH /api/profile → 200", patch.status === 200, `got ${patch.status}`);
    check("name updated", patchData.user?.name === "Renamed Acct", JSON.stringify(patchData));

    // Change password — wrong current rejected
    console.log("\n[change-password]");
    const wrong = await fetch(`${BASE}/api/profile/change-password`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "nope", newPassword: "newpass123" }),
    });
    check("wrong current password → 401", wrong.status === 401, `got ${wrong.status}`);

    // too-short new password rejected
    const short = await fetch(`${BASE}/api/profile/change-password`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "oldpass123", newPassword: "123" }),
    });
    check("short new password → 400", short.status === 400, `got ${short.status}`);

    // correct change
    const ok = await fetch(`${BASE}/api/profile/change-password`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "oldpass123", newPassword: "newpass123" }),
    });
    check("valid change → 200", ok.status === 200, `got ${ok.status}`);

    // login with the NEW password works (end-to-end)
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "newpass123" }),
    });
    check("login with new password → 200", login.status === 200, `got ${login.status}`);

    // Delete account
    console.log("\n[delete-account]");
    const del = await fetch(`${BASE}/api/auth/account`, { method: "DELETE", headers: auth });
    check("DELETE /api/auth/account → 200", del.status === 200, `got ${del.status}`);
    const gone = await users.findOne({ _id: insert.insertedId });
    check("user document removed", gone === null);
    if (gone === null) userStillExists = false;
  } finally {
    if (userStillExists) {
      await users.deleteOne({ _id: insert.insertedId });
      console.log("\nCleaned up throwaway user.");
    }
    await mongoose.disconnect();
  }

  console.log(`\n──────────\nResult: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Account smoke crashed:", e);
  process.exit(1);
});
