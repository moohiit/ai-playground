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
  "LOAD_EXTENSION",
  "SAVEPOINT",
  "RELEASE",
  "ROLLBACK",
  "COMMIT",
  "BEGIN",
];

export type ValidationResult =
  | { ok: true; cleaned: string }
  | { ok: false; error: string };

function stripAllComments(sql: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  let stringChar = "";

  while (i < sql.length) {
    if (inString) {
      if (sql[i] === stringChar) {
        if (i + 1 < sql.length && sql[i + 1] === stringChar) {
          result += sql[i] + sql[i + 1];
          i += 2;
        } else {
          result += sql[i];
          inString = false;
          i++;
        }
      } else {
        result += sql[i];
        i++;
      }
    } else if (sql[i] === "'" || sql[i] === '"') {
      inString = true;
      stringChar = sql[i];
      result += sql[i];
      i++;
    } else if (sql[i] === "-" && i + 1 < sql.length && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
    } else if (sql[i] === "/" && i + 1 < sql.length && sql[i + 1] === "*") {
      i += 2;
      while (i + 1 < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
    } else {
      result += sql[i];
      i++;
    }
  }

  return result;
}

export function validateSelectOnly(sql: string): ValidationResult {
  const stripped = stripAllComments(sql).trim().replace(/;+\s*$/, "").trim();

  if (!stripped) {
    return { ok: false, error: "Query is empty" };
  }

  if (stripped.includes(";")) {
    return { ok: false, error: "Multiple statements are not allowed" };
  }

  const normalized = stripped.replace(/\s+/g, " ");

  const firstKeyword = normalized.match(/^\s*(\w+)/)?.[1]?.toUpperCase();
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
  const match = normalized.match(forbiddenRegex);
  if (match) {
    return {
      ok: false,
      error: `Query contains forbidden keyword: ${match[1].toUpperCase()}`,
    };
  }

  if (/\/\*!/.test(sql)) {
    return { ok: false, error: "MySQL-style executable comments are not allowed" };
  }

  return { ok: true, cleaned: stripped };
}

export function validateDdlSafe(ddl: string): ValidationResult {
  const stripped = stripAllComments(ddl);
  const dangerous = ["ATTACH", "DETACH", "PRAGMA", "LOAD_EXTENSION"];
  for (const kw of dangerous) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(stripped)) {
      return { ok: false, error: `Schema contains forbidden keyword: ${kw}` };
    }
  }
  return { ok: true, cleaned: ddl };
}
