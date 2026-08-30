"use client";

import * as duckdb from "@duckdb/duckdb-wasm";
import { manifest } from "@/lib/manifest";

/**
 * DuckDB running in the visitor's browser.
 *
 * The design decision this file encodes: queries execute client-side against
 * Parquet served over HTTP, not on a server. DuckDB pulls only the byte ranges a
 * query touches, so a question that reads two columns of `orders` does not
 * download six megabytes. Nothing a visitor asks is transmitted anywhere, there
 * is no database to run or secure, and the language-model layer added later can
 * only ever emit SQL — it never gets a connection of its own.
 */

const WASM_URL = "/duckdb/duckdb-eh.wasm";
const WORKER_URL = "/duckdb/duckdb-browser-eh.worker.js";

export type QueryResult = {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  /** Wall-clock milliseconds for the query alone, excluding engine startup. */
  elapsedMs: number;
};

export class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryError";
  }
}

let connectionPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;

async function connect(): Promise<duckdb.AsyncDuckDBConnection> {
  const worker = new Worker(WORKER_URL);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(WASM_URL);

  const connection = await db.connect();

  // Register every published table as a view over its Parquet file. Views are
  // lazy: nothing is read until a query actually touches the table.
  const origin = window.location.origin;
  for (const table of manifest.tables) {
    const fileName = `${table.name}.parquet`;
    await db.registerFileURL(
      fileName,
      new URL(table.file, origin).href,
      duckdb.DuckDBDataProtocol.HTTP,
      false,
    );
    await connection.query(
      `CREATE OR REPLACE VIEW ${table.name} AS SELECT * FROM read_parquet('${fileName}')`,
    );
  }

  return connection;
}

/** Start the engine, reusing it across calls. Safe to call repeatedly. */
export function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  connectionPromise ??= connect().catch((error: unknown) => {
    // Do not cache a failed start-up, or every later attempt inherits it.
    connectionPromise = null;
    throw error;
  });
  return connectionPromise;
}

/** Whether the engine has already started, so callers can avoid a cold hit. */
export function isReady(): boolean {
  return connectionPromise !== null;
}

/**
 * Hand a statement to DuckDB's parser and get its syntax tree back.
 *
 * This is what the guardrail validator runs on. Using the engine's own parser
 * rather than a second SQL library means the thing that checks the query and
 * the thing that runs it agree by construction — there is no dialect gap
 * between them for a query to slip through.
 */
export async function serializeSql(sql: string): Promise<string> {
  const connection = await getConnection();
  const escaped = sql.replace(/'/g, "''");
  const table = await connection.query(
    `SELECT json_serialize_sql('${escaped}') AS tree`,
  );
  const row = table.toArray()[0]?.toJSON() as Record<string, unknown> | undefined;
  return String(row?.tree ?? "");
}

export async function runQuery(sql: string): Promise<QueryResult> {
  const connection = await getConnection();

  const started = performance.now();
  let table;
  try {
    table = await connection.query(sql);
  } catch (error) {
    throw new QueryError(error instanceof Error ? error.message : String(error));
  }
  const elapsedMs = performance.now() - started;

  const columns = table.schema.fields.map((f) => f.name);
  const rows = table.toArray().map((row) => {
    const record = row.toJSON() as Record<string, unknown>;
    return columns.map((c) => normalise(record[c]));
  });

  return { columns, rows, rowCount: rows.length, elapsedMs };
}

/**
 * Arrow hands back BigInt for 64-bit integers and Date-like values for
 * timestamps. Both break `JSON.stringify` and React rendering, so they are
 * flattened here rather than at every call site.
 */
function normalise(value: unknown): unknown {
  if (typeof value === "bigint") {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}
