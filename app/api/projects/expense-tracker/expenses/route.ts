import { NextResponse } from "next/server";
import {
  createExpense,
  listExpenses,
} from "@/modules/expense-tracker/service";
import {
  createExpenseSchema,
  expenseFilterSchema,
} from "@/modules/expense-tracker/schemas";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = expenseFilterSchema.parse(Object.fromEntries(searchParams));
    const result = await listExpenses(filter);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = createExpenseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid input"
      );
    }
    const expense = await createExpense(parsed.data);
    return NextResponse.json({ expense }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
