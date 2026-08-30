"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QueryError, isReady, runQuery, type QueryResult } from "@/lib/duckdb/client";
import { Panel, PanelHeader } from "./ui/panel";
import { cn } from "@/lib/cn";

export type PresetQuery = {
  label: string;
  /** What the query demonstrates, in business terms. */
  note: string;
  sql: string;
};

const MAX_RENDERED_ROWS = 200;

export function QueryConsole({
  presets,
  initialSql,
}: {
  presets: PresetQuery[];
  initialSql?: string;
}) {
  const [sql, setSql] = useState(initialSql ?? presets[0]?.sql ?? "");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "running">("idle");
  const [engineStartMs, setEngineStartMs] = useState<number | null>(null);
  const [active, setActive] = useState<PresetQuery | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const execute = useCallback(async (statement: string) => {
    const cold = !isReady();
    setStatus(cold ? "starting" : "running");
    setError(null);
    const started = performance.now();
    try {
      const next = await runQuery(statement);
      if (cold) setEngineStartMs(performance.now() - started - next.elapsedMs);
      setResult(next);
    } catch (err) {
      setResult(null);
      setError(
        err instanceof QueryError
          ? err.message
          : `Could not start the query engine: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setStatus("idle");
    }
  }, []);

  // Warm the engine once the component is on screen, so the first click is not
  // paying for a 36MB WebAssembly download.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void import("@/lib/duckdb/client").then((m) => m.getConnection().catch(() => {}));
    }, 400);
    return () => window.clearTimeout(timer);
  }, []);

  const busy = status !== "idle";

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              aria-pressed={active?.label === preset.label}
              onClick={() => {
                setActive(preset);
                setSql(preset.sql);
                void execute(preset.sql);
              }}
              disabled={busy}
              className={cn(
                "rounded border px-3 py-1.5 font-mono text-[11px] transition-colors disabled:opacity-50",
                active?.label === preset.label
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-border bg-surface-2 text-ink-muted hover:border-border-strong hover:text-ink",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {active ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-subtle">
            {active.note}
          </p>
        ) : null}
      </div>

      <Panel>
        <PanelHeader
          title="SQL"
          meta={<span>Ctrl/⌘ + Enter to run</span>}
        />
        <textarea
          ref={textarea}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void execute(sql);
            }
          }}
          spellCheck={false}
          rows={7}
          aria-label="SQL query"
          className="scroll-panel w-full resize-y bg-transparent px-5 py-4 font-mono text-[13px] leading-relaxed text-ink outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => void execute(sql)}
            disabled={busy || !sql.trim()}
            className="rounded border border-accent bg-accent px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {status === "starting" ? "Starting engine…" : status === "running" ? "Running…" : "Run query"}
          </button>
          <ResultMeta result={result} engineStartMs={engineStartMs} />
        </div>
      </Panel>

      {error ? (
        <Panel className="border-negative/40">
          <PanelHeader title="Query failed" className="border-negative/40" />
          <pre className="scroll-panel overflow-x-auto px-5 py-4 font-mono text-xs leading-relaxed text-negative">
            {error}
          </pre>
        </Panel>
      ) : null}

      {result ? <ResultTable result={result} /> : null}
    </div>
  );
}

function ResultMeta({
  result,
  engineStartMs,
}: {
  result: QueryResult | null;
  engineStartMs: number | null;
}) {
  if (!result) {
    return (
      <p className="font-mono text-[11px] text-ink-subtle">
        Runs in your browser. Nothing is sent to a server.
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink-subtle">
      <span className="text-accent">{result.elapsedMs.toFixed(1)} ms</span>
      <span className="tnum">{result.rowCount.toLocaleString("en-US")} rows</span>
      <span>in your browser</span>
      {engineStartMs !== null ? (
        <span className="text-ink-subtle/70">
          (engine start {(engineStartMs / 1000).toFixed(1)}s, once per visit)
        </span>
      ) : null}
    </p>
  );
}

function ResultTable({ result }: { result: QueryResult }) {
  const rows = result.rows.slice(0, MAX_RENDERED_ROWS);
  const truncated = result.rowCount - rows.length;

  if (result.rowCount === 0) {
    return (
      <Panel className="px-5 py-4 text-sm text-ink-muted">
        The query ran and returned no rows.
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="scroll-panel max-h-[28rem] overflow-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              {result.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="whitespace-nowrap border-b border-border px-4 py-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-ink-subtle"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={cn(
                      "whitespace-nowrap px-4 py-2 align-top",
                      typeof cell === "number" ? "tnum text-right font-mono text-ink" : "text-ink-muted",
                    )}
                  >
                    {formatCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated > 0 ? (
        <p className="border-t border-border px-5 py-2.5 font-mono text-[11px] text-ink-subtle">
          Showing the first {MAX_RENDERED_ROWS} of {result.rowCount.toLocaleString("en-US")} rows.
        </p>
      ) : null}
    </Panel>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString("en-US")
      : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return value.slice(0, 10);
  }
  return String(value);
}
