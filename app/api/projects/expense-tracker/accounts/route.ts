import { NextResponse } from "next/server";
import { listAccounts, createAccount } from "@/modules/expense-tracker/service";
import { createAccountSchema } from "@/modules/expense-tracker/schemas";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get("archived") === "true";
    const accounts = await listAccounts(auth, { includeArchived });
    return NextResponse.json({ accounts });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = createAccountSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const account = await createAccount(parsed.data, auth);
    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
