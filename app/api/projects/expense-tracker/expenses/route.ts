import { NextResponse } from "next/server";
import { createExpense, listExpenses } from "@/modules/expense-tracker/service";
import { createExpenseSchema, expenseFilterSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";
import {
  getUserPushConfig,
  checkAndNotifyBudget,
  checkAndNotifyAnomaly,
} from "@/modules/expense-tracker/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const filter = expenseFilterSchema.parse(Object.fromEntries(searchParams));
    const result = await listExpenses(filter, auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = createExpenseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const expense = await createExpense(parsed.data, auth);

    // Best-effort push notifications for personal expenses
    if (expense.type === "personal" && expense.direction === "expense") {
      try {
        const config = await getUserPushConfig(auth.userId);
        if (config) {
          await Promise.all([
            checkAndNotifyBudget(auth.userId, config, expense.category),
            checkAndNotifyAnomaly(
              auth.userId,
              config,
              expense.category,
              expense.amountBase ?? expense.amount,
              expense.description
            ),
          ]);
        }
      } catch {
        // never fail the expense save due to push errors
      }
    }

    return NextResponse.json({ expense }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
