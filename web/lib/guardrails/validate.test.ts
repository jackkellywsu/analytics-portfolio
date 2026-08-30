/**
 * Conformance tests for the TypeScript validator.
 *
 * These run the exact corpus the Python implementation runs
 * (semantic/guardrail_cases.json). Two implementations of the same rules drift
 * unless something forces them to agree; this file and its Python twin are that
 * something.
 *
 * DuckDB runs here in Node, so the parser under test is the same one that runs
 * in the browser.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { applyLimit, codesOf, validateSql, type Policy } from "./validate";

const ROOT = path.resolve(__dirname, "..", "..", "..");

type Case = {
  id: string;
  why?: string;
  sql: string;
  expect: "allow" | "deny";
  codes?: string[];
  limit_applied?: number;
};

const cases: Case[] = JSON.parse(
  readFileSync(path.join(ROOT, "semantic", "guardrail_cases.json"), "utf-8"),
).cases;

const policy: Policy = JSON.parse(
  readFileSync(
    path.join(ROOT, "web", "public", "data", "policy.json"),
    "utf-8",
  ),
);

let connection: DuckDBConnection;

async function serialize(sql: string): Promise<string> {
  const escaped = sql.replace(/'/g, "''");
  const result = await connection.runAndReadAll(
    `SELECT json_serialize_sql('${escaped}') AS tree`,
  );
  return String(result.getRowsJS()[0][0]);
}

beforeAll(async () => {
  const instance = await DuckDBInstance.create(":memory:");
  connection = await instance.connect();
});

afterAll(() => {
  connection?.closeSync?.();
});

describe("shared conformance corpus", () => {
  for (const testCase of cases) {
    it(`${testCase.id}${testCase.why ? ` — ${testCase.why}` : ""}`, async () => {
      const verdict = await validateSql(testCase.sql, serialize, policy);

      if (testCase.expect === "allow") {
        expect(
          verdict.allowed,
          `should have been allowed but was rejected: ${verdict.violations
            .map((v) => v.message)
            .join("; ")}`,
        ).toBe(true);
        expect(verdict.sql).not.toBeNull();
        if (testCase.limit_applied !== undefined) {
          expect(verdict.limitApplied).toBe(testCase.limit_applied);
        }
      } else {
        expect(verdict.allowed, "should have been rejected").toBe(false);
        for (const code of testCase.codes ?? []) {
          expect(
            codesOf(verdict),
            `rejected, but not for ${code}`,
          ).toContain(code);
        }
      }
    });
  }
});

describe("limit enforcement", () => {
  it("adds a limit when there is none", () => {
    const { sql, limit } = applyLimit("SELECT 1 FROM orders", 1000);
    expect(sql).toMatch(/LIMIT 1000$/);
    expect(limit).toBe(1000);
  });

  it("clamps a limit that is too large", () => {
    const { sql, limit } = applyLimit("SELECT 1 FROM orders LIMIT 50000", 1000);
    expect(sql).toMatch(/LIMIT 1000$/);
    expect(sql).not.toMatch(/50000/);
    expect(limit).toBe(1000);
  });

  it("leaves a smaller limit alone", () => {
    const { limit } = applyLimit("SELECT 1 FROM orders LIMIT 5", 1000);
    expect(limit).toBe(5);
  });

  it("strips a trailing semicolon so the appended limit is valid SQL", () => {
    const { sql } = applyLimit("SELECT 1 FROM orders;", 1000);
    expect(sql).not.toMatch(/;/);
    expect(sql).toMatch(/LIMIT 1000$/);
  });
});

describe("table extraction", () => {
  it("reports every table touched", async () => {
    const verdict = await validateSql(
      "SELECT c.customer_state FROM orders o JOIN customers c ON c.customer_id = o.customer_id LIMIT 10",
      serialize,
      policy,
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.tables).toEqual(["customers", "orders"]);
  });

  it("does not mistake a CTE name for an unknown table", async () => {
    const verdict = await validateSql(
      "WITH live AS (SELECT * FROM orders) SELECT COUNT(*) FROM live",
      serialize,
      policy,
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.tables).toEqual(["orders"]);
  });
});
