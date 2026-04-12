import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function handleRouteError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (
    err instanceof Error &&
    "status" in err &&
    typeof (err as any).status === "number"
  ) {
    return NextResponse.json(
      { error: err.message },
      { status: (err as any).status }
    );
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[api]", err);
  return NextResponse.json({ error: message }, { status: 500 });
}
