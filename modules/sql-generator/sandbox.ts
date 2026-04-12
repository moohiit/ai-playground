import Database from "better-sqlite3";

export type QueryResult = {
  columns: string[];
  rows: Array<Array<string | number | null>>;
  rowCount: number;
  truncated: boolean;
  elapsedMs: number;
};

const MAX_ROWS = 100;

export async function runSandboxQuery(
  ddl: string,
  seed: string,
  query: string
): Promise<QueryResult> {
  const db = new Database(":memory:");
  const started = Date.now();

  try {
    db.exec(ddl);
    if (seed.trim()) db.exec(seed);

    const stmt = db.prepare(query);
    const rows = stmt.all() as Record<string, unknown>[];
    const elapsedMs = Date.now() - started;

    if (rows.length === 0) {
      const columns = stmt.columns().map((c) => c.name);
      return { columns, rows: [], rowCount: 0, truncated: false, elapsedMs };
    }

    const columns = Object.keys(rows[0]);
    const rowCount = rows.length;
    const truncated = rowCount > MAX_ROWS;
    const sliced = truncated ? rows.slice(0, MAX_ROWS) : rows;

    const mapped = sliced.map((row) =>
      columns.map((col) => {
        const v = row[col];
        if (v === null || v === undefined) return null;
        if (typeof v === "number" || typeof v === "string") return v;
        if (Buffer.isBuffer(v)) return "<blob>";
        return String(v);
      })
    );

    return { columns, rows: mapped, rowCount, truncated, elapsedMs };
  } finally {
    db.close();
  }
}
