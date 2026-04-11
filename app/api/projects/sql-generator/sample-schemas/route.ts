import { NextResponse } from "next/server";
import { SAMPLE_SCHEMAS } from "@/modules/sql-generator/sampleSchemas";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ schemas: SAMPLE_SCHEMAS });
}
