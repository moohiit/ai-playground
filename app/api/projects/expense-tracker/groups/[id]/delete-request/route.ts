import { NextResponse } from "next/server";
import {
  requestGroupDeletion,
  clearGroupDeletionRequest,
} from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type Params = { params: { id: string } };

/** A member asks the creator to delete the group. */
export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const result = await requestGroupDeletion(params.id, auth);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Withdraw your own request; as the creator, dismiss them all. */
export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const result = await clearGroupDeletionRequest(params.id, auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
