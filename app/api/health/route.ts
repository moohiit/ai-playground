import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { handleRouteError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const started = Date.now();
    const mongoose = await connectDB();
    const dbState = mongoose.connection.readyState;

    return NextResponse.json({
      status: "ok",
      uptime: process.uptime(),
      db: {
        connected: dbState === 1,
        readyState: dbState,
      },
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
