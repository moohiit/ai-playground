import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleRouteError, ApiError } from "@/lib/apiError";
import { createWarrantySchema } from "@/modules/expense-tracker/schemas";
import {
  listWarranties,
  createWarranty,
  listReceiptExpenses,
} from "@/modules/expense-tracker/warranty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    if (searchParams.get("receipts") === "1") {
      return NextResponse.json(await listReceiptExpenses(auth));
    }
    return NextResponse.json(await listWarranties(auth));
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = createWarrantySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    return NextResponse.json(await createWarranty(parsed.data, auth), {
      status: 201,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
