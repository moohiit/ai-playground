import { NextResponse } from "next/server";
import { z } from "zod";
import { respondToInvite } from "@/modules/expense-tracker/service";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type Params = { params: { id: string } };

const respondSchema = z.object({ accept: z.boolean() }).strict();

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const parsed = respondSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "Send { accept: true | false }");
    }
    const result = await respondToInvite(params.id, parsed.data.accept, auth);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
