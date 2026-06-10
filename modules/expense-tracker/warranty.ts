import { connectDB } from "@/lib/db";
import type { JWTPayload } from "@/lib/auth";
import { Warranty, Expense } from "./models";
import type { CreateWarrantyInput, UpdateWarrantyInput } from "./schemas";
import mongoose from "mongoose";

const MS_DAY = 86_400_000;

function toObjectId(id: string) {
  if (!mongoose.isValidObjectId(id)) throw new Error("Invalid id");
  return new mongoose.Types.ObjectId(id);
}

function daysUntil(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - now.getTime()) / MS_DAY);
}

function decorate(w: Record<string, unknown>, now: Date) {
  const returnByDate = w.returnByDate as Date | null;
  const warrantyExpiresAt = w.warrantyExpiresAt as Date | null;
  const daysUntilReturn = daysUntil(returnByDate, now);
  const daysUntilWarranty = daysUntil(warrantyExpiresAt, now);

  let returnStatus: "active" | "return-soon" | "missed-return" | null = null;
  if (daysUntilReturn !== null) {
    returnStatus =
      daysUntilReturn < 0
        ? "missed-return"
        : daysUntilReturn <= 7
        ? "return-soon"
        : "active";
  }

  let warrantyStatus: "active" | "warranty-soon" | "warranty-expired" | null =
    null;
  if (daysUntilWarranty !== null) {
    warrantyStatus =
      daysUntilWarranty < 0
        ? "warranty-expired"
        : daysUntilWarranty <= 30
        ? "warranty-soon"
        : "active";
  }

  return { ...w, daysUntilReturn, daysUntilWarranty, returnStatus, warrantyStatus };
}

export async function listWarranties(auth: JWTPayload) {
  await connectDB();
  const now = new Date();
  const rows = await Warranty.find({
    userId: auth.userId,
    archived: false,
  })
    .sort({ purchaseDate: -1 })
    .lean();
  return { warranties: rows.map((w) => decorate(w as Record<string, unknown>, now)) };
}

export async function createWarranty(
  input: CreateWarrantyInput,
  auth: JWTPayload
) {
  await connectDB();
  const doc = await Warranty.create({
    userId: auth.userId,
    expenseId: input.expenseId ? toObjectId(input.expenseId) : null,
    label: input.label,
    purchaseDate: new Date(input.purchaseDate),
    returnByDate: input.returnByDate ? new Date(input.returnByDate) : null,
    warrantyExpiresAt: input.warrantyExpiresAt
      ? new Date(input.warrantyExpiresAt)
      : null,
    notes: input.notes ?? "",
  });
  const now = new Date();
  return { warranty: decorate(doc.toObject() as Record<string, unknown>, now) };
}

// Bulk-create one warranty entry per item[] from a receipt-scanned expense.
// purchaseDate defaults to the expense date. Skips items already tracked.
export async function createWarrantiesFromExpense(
  expenseId: string,
  auth: JWTPayload
) {
  await connectDB();
  const eid = toObjectId(expenseId);
  const expense = await Expense.findOne({
    _id: eid,
    createdBy: auth.userId,
  }).lean();
  if (!expense) throw new Error("Expense not found");
  if (!expense.items || expense.items.length === 0) {
    throw new Error("This expense has no line items to import");
  }

  const existing = await Warranty.find({
    userId: auth.userId,
    expenseId: eid,
  })
    .select("label")
    .lean();
  const existingLabels = new Set(existing.map((w) => w.label.toLowerCase()));

  const toCreate = expense.items
    .filter((it) => !existingLabels.has(it.name.toLowerCase()))
    .map((it) => ({
      userId: auth.userId,
      expenseId: eid,
      label: it.name,
      purchaseDate: expense.date,
      returnByDate: null,
      warrantyExpiresAt: null,
      notes: "",
    }));

  if (toCreate.length === 0) {
    return { created: 0, skipped: expense.items.length };
  }

  await Warranty.insertMany(toCreate);
  return { created: toCreate.length, skipped: expense.items.length - toCreate.length };
}

export async function updateWarranty(
  id: string,
  input: UpdateWarrantyInput,
  auth: JWTPayload
) {
  await connectDB();
  const $set: Record<string, unknown> = {};
  if (input.label !== undefined) $set.label = input.label;
  if (input.purchaseDate !== undefined)
    $set.purchaseDate = new Date(input.purchaseDate);
  if ("returnByDate" in input)
    $set.returnByDate = input.returnByDate ? new Date(input.returnByDate) : null;
  if ("warrantyExpiresAt" in input)
    $set.warrantyExpiresAt = input.warrantyExpiresAt
      ? new Date(input.warrantyExpiresAt)
      : null;
  if (input.notes !== undefined) $set.notes = input.notes;
  if (input.archived !== undefined) $set.archived = input.archived;

  const doc = await Warranty.findOneAndUpdate(
    { _id: toObjectId(id), userId: auth.userId },
    { $set },
    { new: true }
  ).lean();
  if (!doc) throw new Error("Warranty not found");
  return { warranty: decorate(doc as Record<string, unknown>, new Date()) };
}

export async function deleteWarranty(id: string, auth: JWTPayload) {
  await connectDB();
  const result = await Warranty.deleteOne({
    _id: toObjectId(id),
    userId: auth.userId,
  });
  if (result.deletedCount === 0) throw new Error("Warranty not found");
  return { ok: true };
}

// Returns expenses that have items[] (receipt-scanned) for the "import" UI.
export async function listReceiptExpenses(auth: JWTPayload) {
  await connectDB();
  const ninety = new Date();
  ninety.setDate(ninety.getDate() - 90);

  const expenses = await Expense.find({
    createdBy: auth.userId,
    "items.0": { $exists: true },
    date: { $gte: ninety },
  })
    .sort({ date: -1 })
    .select("description date items receiptUrl")
    .limit(50)
    .lean();

  return {
    expenses: expenses.map((e) => ({
      _id: e._id,
      description: e.description,
      date: e.date,
      itemCount: e.items.length,
      itemNames: e.items.map((i) => i.name),
      receiptUrl: e.receiptUrl,
    })),
  };
}
