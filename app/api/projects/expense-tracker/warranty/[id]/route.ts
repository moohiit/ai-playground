import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleRouteError, ApiError } from "@/lib/apiError";
import { updateWarrantySchema } from "@/modules/expense-tracker/schemas";
import {
  updateWarranty,
  deleteWarranty,
} from "@/modules/expense-tracker/warranty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = updateWarrantySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    return NextResponse.json(
      await updateWarranty(params.id, parsed.data, auth)
    );
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(req);
    return NextResponse.json(await deleteWarranty(params.id, auth));
  } catch (err) {
    return handleRouteError(err);
  }
}
