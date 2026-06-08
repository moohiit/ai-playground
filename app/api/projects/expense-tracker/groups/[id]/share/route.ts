import { NextResponse } from "next/server";
import {
  enableGroupShare,
  disableGroupShare,
} from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const result = await enableGroupShare(params.id, auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const result = await disableGroupShare(params.id, auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
