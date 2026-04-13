import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI not found in .env.local");
  process.exit(1);
}

async function resetDatabase() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI!);
  console.log("Connected.\n");

  const db = mongoose.connection.db;
  if (!db) {
    console.error("No database connection");
    process.exit(1);
  }

  const collections = await db.listCollections().toArray();

  if (collections.length === 0) {
    console.log("Database is already empty.");
  } else {
    console.log(`Found ${collections.length} collections:`);
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`  - ${col.name} (${count} documents)`);
    }

    console.log("\nDropping all collections...");
    for (const col of collections) {
      if (col.name === "usages") continue;
      await db.collection(col.name).drop();
      console.log(`  ✓ Dropped ${col.name}`);
    }
  }

  console.log("\nDatabase reset complete.");
  await mongoose.disconnect();
  process.exit(0);
}

resetDatabase().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
