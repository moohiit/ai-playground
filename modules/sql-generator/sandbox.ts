import path from "path";
import type { SqlJsStatic } from "sql.js";

let sqlPromise: Promise<SqlJsStatic> | null = null;

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const initSqlJs = (await import("sql.js")).default;
      return initSqlJs({
        locateFile: (file: string) =>
          path.join(process.cwd(), "node_modules/sql.js/dist/", file),
      });
    })();
  }
  return sqlPromise;
}

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
  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  const started = Date.now();

  try {
    db.exec(ddl);
    if (seed.trim()) db.exec(seed);

    const results = db.exec(query);
    const elapsedMs = Date.now() - started;

    if (results.length === 0) {
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        truncated: false,
        elapsedMs,
      };
    }

    const first = results[0];
    const rowCount = first.values.length;
    const truncated = rowCount > MAX_ROWS;
    const rows = (truncated ? first.values.slice(0, MAX_ROWS) : first.values).map(
      (row) =>
        row.map((v) => {
          if (v === null || v === undefined) return null;
          if (typeof v === "number" || typeof v === "string") return v;
          if (v instanceof Uint8Array) return "<blob>";
          return String(v);
        })
    );

    return {
      columns: first.columns,
      rows,
      rowCount,
      truncated,
      elapsedMs,
    };
  } finally {
    db.close();
  }
}
