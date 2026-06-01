import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function handleRouteError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }

  // Invalid request body / query params → 400 (not 500).
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: err.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // Errors that already carry a status (e.g. AuthError → 401).
  if (
    err instanceof Error &&
    "status" in err &&
    typeof (err as { status?: unknown }).status === "number"
  ) {
    return NextResponse.json(
      { error: err.message },
      { status: (err as unknown as { status: number }).status }
    );
  }

  // Bad Mongo ObjectId (e.g. ?groupId=foo) → 400 instead of a leaked 500.
  if (err instanceof Error && err.name === "CastError") {
    return NextResponse.json({ error: "Invalid identifier" }, { status: 400 });
  }

  // Map known service-layer business errors to proper 4xx codes.
  if (err instanceof Error) {
    const m = err.message;
    if (/not found/i.test(m)) {
      return NextResponse.json({ error: m }, { status: 404 });
    }
    if (/access denied|not a member|only the|not authenticated|access denied/i.test(m)) {
      return NextResponse.json({ error: m }, { status: 403 });
    }
    if (
      /no unsettled|already|must |required|not registered|need to (create|register)|invalid/i.test(
        m
      )
    ) {
      return NextResponse.json({ error: m }, { status: 400 });
    }
  }

  // Truly unexpected → log detail, return a generic message (no internal leak).
  console.error("[api]", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
