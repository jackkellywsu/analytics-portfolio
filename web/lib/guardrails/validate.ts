/**
 * SQL validation, TypeScript side.
 *
 * The parser here is DuckDB's own, reached through `json_serialize_sql()`. That
 * is the whole trick: the thing that checks the query and the thing that runs it
 * are the same engine, so there is no dialect gap for a query to slip through.
 * A second SQL parser would have its own idea of what the SQL means, and the
 * difference between the two ideas is where a bypass lives.
 *
 * DuckDB's serializer refuses anything that is not a SELECT before this code
 * runs at all — DROP, PRAGMA, INSERT and friends all come back as
 * "Only SELECT statements can be serialized to json!" — so statement-type
 * enforcement is free and cannot be talked out of. What is left for this module
 * is everything DuckDB considers valid SQL but the layer does not permit:
 * unpublished tables, table-valued functions, meaningless joins, runaway
 * cartesian products, and missing limits.
 *
 * The pure half (`validateParsed`) takes a parse tree and returns a verdict, so
 * it is tested in Node against the same corpus as the Python implementation in
 * semantic/guardrail_cases.json.
 */

export type Violation = { code: string; message: string };

export type Verdict = {
  allowed: boolean;
  violations: Violation[];
  /** SQL as it will actually execute: the limit is applied here, not requested. */
  sql: string | null;
  tables: string[];
  limitApplied: number | null;
};

export type Policy = {
  allowed_tables: string[];
  columns_by_table: Record<string, string[]>;
  forbidden_pairs: string[][];
  max_rows: number;
  max_joins: number;
  max_chars: number;
  max_depth: number;
};

type Json = Record<string, unknown>;

const FORBIDDEN_FUNCTIONS = new Set([
  "read_csv",
  "read_csv_auto",
  "read_json",
  "read_json_auto",
  "read_parquet",
  "read_text",
  "glob",
  "install",
  "load",
  "copy",
  "system",
  "shell",
  "getenv",
]);

export function codesOf(verdict: Verdict): string[] {
  return [...new Set(verdict.violations.map((v) => v.code))].sort();
}

/** Walk every nested object and array in the parse tree. */
function* walk(node: unknown): Generator<Json> {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) yield* walk(item);
    return;
  }
  yield node as Json;
  for (const value of Object.values(node as Json)) yield* walk(value);
}

function depthOf(node: unknown, level = 0): number {
  let deepest = level;
  if (node === null || typeof node !== "object") return deepest;
  const entries = Array.isArray(node) ? node : Object.values(node as Json);
  for (const child of entries) {
    if (child && typeof child === "object") {
      const isSubquery =
        !Array.isArray(child) && (child as Json).type === "SUBQUERY";
      deepest = Math.max(deepest, depthOf(child, isSubquery ? level + 1 : level));
    }
  }
  return deepest;
}

/**
 * Apply the policy to an already-parsed query.
 *
 * `serialized` is the JSON string returned by json_serialize_sql. `original` is
 * the SQL it came from, used only to rebuild the statement with a limit.
 */
export function validateParsed(
  serialized: string,
  original: string,
  policy: Policy,
): Verdict {
  const deny = (code: string, message: string): Verdict => ({
    allowed: false,
    violations: [{ code, message }],
    sql: null,
    tables: [],
    limitApplied: null,
  });

  let parsed: Json;
  try {
    parsed = JSON.parse(serialized) as Json;
  } catch {
    return deny("unparseable", "The parser returned something that was not JSON.");
  }

  if (parsed.error === true) {
    const message = String(parsed.error_message ?? "Could not parse as SQL.");
    // DuckDB refuses to serialise anything that is not a SELECT, which is
    // exactly the check we want and is reported here as such.
    if (/only select statements/i.test(message)) {
      return deny(
        "not_select",
        "Only SELECT statements are permitted; queries are read-only.",
      );
    }
    return deny("unparseable", `Could not parse as SQL: ${message}`);
  }

  const statements = Array.isArray(parsed.statements) ? parsed.statements : [];
  if (statements.length !== 1) {
    return deny(
      "multiple_statements",
      `Expected one statement, found ${statements.length}. Chaining statements ` +
        "is how a second, unreviewed query gets in.",
    );
  }

  const violations: Violation[] = [];
  const allowed = new Set(policy.allowed_tables);

  const cteNames = new Set<string>();
  for (const node of walk(statements[0])) {
    const map = node.cte_map as Json | undefined;
    const entries = map?.map;
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        const key = (entry as Json)?.key;
        if (typeof key === "string") cteNames.add(key.toLowerCase());
      }
    }
  }

  const referenced = new Set<string>();
  let joinCount = 0;

  for (const node of walk(statements[0])) {
    switch (node.type) {
      case "BASE_TABLE": {
        const name = String(node.table_name ?? "").toLowerCase();
        if (name && !cteNames.has(name)) referenced.add(name);
        break;
      }
      case "TABLE_FUNCTION": {
        // read_parquet('http://…'), read_csv('/etc/passwd'), glob('*'). These
        // occupy a table position but are not tables, so a check that only
        // inspects BASE_TABLE nodes waves them straight through.
        const fn = node.function as Json | undefined;
        const name = String(
          (fn?.function_name as string) ?? (node.function_name as string) ?? "",
        ).toLowerCase();
        violations.push({
          code: "unknown_table",
          message: name
            ? `${name}() is a table-valued function, not a published table.`
            : "A table-valued function is not a published table.",
        });
        break;
      }
      case "JOIN": {
        joinCount += 1;
        const kind = String(node.ref_type ?? "").toUpperCase();
        const using = node.using_columns;
        const hasUsing = Array.isArray(using) ? using.length > 0 : using != null;
        // A comma join reports condition: null and using_columns: [] - an empty
        // array, not null. Checking for null alone lets it through, which is
        // what this validator did until the shared corpus caught it.
        if (node.condition == null && !hasUsing && kind !== "NATURAL") {
          violations.push({
            code: "cartesian_join",
            message:
              "A join without an ON condition multiplies both tables together.",
          });
        }
        break;
      }
      case "FUNCTION": {
        const name = String(node.function_name ?? "").toLowerCase();
        if (FORBIDDEN_FUNCTIONS.has(name)) {
          violations.push({
            code: "forbidden_function",
            message: `${name}() reaches outside the published tables.`,
          });
        }
        break;
      }
    }
  }

  // Columns, for unambiguously qualified references only. An unqualified column
  // in a multi-table query cannot be attributed without full alias resolution,
  // and guessing would reject correct queries.
  const aliasMap = new Map<string, string>();
  for (const node of walk(statements[0])) {
    if (node.type !== "BASE_TABLE") continue;
    const table = String(node.table_name ?? "").toLowerCase();
    if (!allowed.has(table)) continue;
    const alias = String(node.alias ?? "").toLowerCase();
    aliasMap.set(alias || table, table);
    aliasMap.set(table, table);
  }
  for (const node of walk(statements[0])) {
    if (node.type !== "COLUMN_REF") continue;
    const parts = node.column_names;
    if (!Array.isArray(parts) || parts.length < 2) continue;
    const qualifier = String(parts[parts.length - 2]).toLowerCase();
    const column = String(parts[parts.length - 1]);
    const target = aliasMap.get(qualifier);
    if (!target) continue;
    if (!(policy.columns_by_table[target] ?? []).includes(column)) {
      violations.push({
        code: "unknown_column",
        message: `${target}.${column} does not exist.`,
      });
    }
  }

  const unknown = [...referenced].filter((t) => !allowed.has(t)).sort();
  if (unknown.length > 0) {
    violations.push({
      code: "unknown_table",
      message: `References ${unknown.join(", ")}, which the layer does not define.`,
    });
  }

  if (referenced.size === 0 && cteNames.size === 0) {
    violations.push({
      code: "no_known_table",
      message: "The query reads none of the published tables.",
    });
  }

  const known = new Set([...referenced].filter((t) => allowed.has(t)));
  for (const pair of policy.forbidden_pairs) {
    if (pair.every((t) => known.has(t))) {
      violations.push({
        code: "forbidden_join",
        message:
          `Joins ${pair.join(" and ")}, which describe different businesses ` +
          "and share no entity.",
      });
    }
  }

  if (joinCount > policy.max_joins) {
    violations.push({
      code: "too_many_joins",
      message: `${joinCount} joins; the limit is ${policy.max_joins}.`,
    });
  }

  if (depthOf(statements[0]) > policy.max_depth) {
    violations.push({
      code: "too_deep",
      message: `Subqueries nest more than ${policy.max_depth} levels.`,
    });
  }

  if (violations.length > 0) {
    return {
      allowed: false,
      violations,
      sql: null,
      tables: [...referenced].sort(),
      limitApplied: null,
    };
  }

  const { sql, limit } = applyLimit(original, policy.max_rows);
  return {
    allowed: true,
    violations: [],
    sql,
    tables: [...referenced].sort(),
    limitApplied: limit,
  };
}

/**
 * Add a LIMIT, or clamp one that is too large.
 *
 * Enforced rather than requested: a limit the model is asked to include is a
 * limit it will sometimes forget, and one forgotten limit on a 112,000-row table
 * is a hung tab.
 */
export function applyLimit(
  sql: string,
  maxRows: number,
): { sql: string; limit: number } {
  const trimmed = sql.trim().replace(/;\s*$/, "");
  const match = /\blimit\s+(\d+)\s*$/i.exec(trimmed);
  if (match) {
    const requested = Number(match[1]);
    const limit = Math.min(requested, maxRows);
    return {
      sql: trimmed.replace(/\blimit\s+\d+\s*$/i, `LIMIT ${limit}`),
      limit,
    };
  }
  return { sql: `${trimmed}\nLIMIT ${maxRows}`, limit: maxRows };
}

export function tooLongOrEmpty(sql: string, policy: Policy): Verdict | null {
  if (!sql || !sql.trim()) {
    return {
      allowed: false,
      violations: [{ code: "empty", message: "No SQL was produced." }],
      sql: null,
      tables: [],
      limitApplied: null,
    };
  }
  if (sql.length > policy.max_chars) {
    return {
      allowed: false,
      violations: [
        {
          code: "too_long",
          message: `Query is ${sql.length} characters; the limit is ${policy.max_chars}.`,
        },
      ],
      sql: null,
      tables: [],
      limitApplied: null,
    };
  }
  return null;
}

/** The IO shell: serialise with DuckDB, then apply the pure checks. */
export async function validateSql(
  sql: string,
  serialize: (sql: string) => Promise<string>,
  policy: Policy,
): Promise<Verdict> {
  const early = tooLongOrEmpty(sql, policy);
  if (early) return early;

  let serialized: string;
  try {
    serialized = await serialize(sql);
  } catch (error) {
    return {
      allowed: false,
      violations: [
        {
          code: "unparseable",
          message: `Could not parse as SQL: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      sql: null,
      tables: [],
      limitApplied: null,
    };
  }
  return validateParsed(serialized, sql, policy);
}
