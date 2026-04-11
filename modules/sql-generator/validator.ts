const FORBIDDEN_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "CREATE",
  "ALTER",
  "TRUNCATE",
  "ATTACH",
  "DETACH",
  "PRAGMA",
  "VACUUM",
  "REINDEX",
  "REPLACE",
];

export type ValidationResult =
  | { ok: true; cleaned: string }
  | { ok: false; error: string };

export function validateSelectOnly(sql: string): ValidationResult {
  const stripped = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .replace(/;+\s*$/, "")
    .trim();

  if (!stripped) {
    return { ok: false, error: "Query is empty" };
  }

  if (stripped.includes(";")) {
    return { ok: false, error: "Multiple statements are not allowed" };
  }

  const firstKeyword = stripped.match(/^\s*(\w+)/)?.[1]?.toUpperCase();
  if (firstKeyword !== "SELECT" && firstKeyword !== "WITH") {
    return {
      ok: false,
      error: `Only SELECT queries are allowed (got ${firstKeyword ?? "empty"})`,
    };
  }

  const forbiddenRegex = new RegExp(
    `\\b(${FORBIDDEN_KEYWORDS.join("|")})\\b`,
    "i"
  );
  const match = stripped.match(forbiddenRegex);
  if (match) {
    return {
      ok: false,
      error: `Query contains forbidden keyword: ${match[1].toUpperCase()}`,
    };
  }

  return { ok: true, cleaned: stripped };
}

export function validateDdlSafe(ddl: string): ValidationResult {
  const upper = ddl.toUpperCase();
  const dangerous = ["ATTACH", "DETACH", "PRAGMA", "LOAD_EXTENSION"];
  for (const kw of dangerous) {
    if (new RegExp(`\\b${kw}\\b`).test(upper)) {
      return { ok: false, error: `Schema contains forbidden keyword: ${kw}` };
    }
  }
  return { ok: true, cleaned: ddl };
}
