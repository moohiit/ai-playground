import { exportExpensesCsv } from "@/modules/expense-tracker/service";
import { expenseFilterSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    // Reuse the list filter schema (page/limit are ignored by the export query).
    const filter = expenseFilterSchema.parse(Object.fromEntries(searchParams));
    const csv = await exportExpensesCsv(filter, auth);

    const stamp = new Date().toISOString().slice(0, 10);
    // BOM so Excel opens UTF-8 correctly.
    return new Response("﻿" + csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="expenses-${stamp}.csv"`,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
