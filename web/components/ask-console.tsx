"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel, PanelHeader } from "./ui/panel";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/cn";
import { int } from "@/lib/format";
import { QueryError, runQuery, serializeSql, type QueryResult } from "@/lib/duckdb/client";
import { validateSql, type Policy, type Verdict } from "@/lib/guardrails/validate";
import policyJson from "@/public/data/policy.json";
import gallery from "@/public/data/ask-gallery.json";

const policy = policyJson as unknown as Policy;

type Meta = {
  model: string;
  effort: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
};

type ApiResult =
  | {
      kind: "answer";
      sql: string;
      metrics_used: string[];
      explanation: string;
      confidence: number;
      meta: Meta;
    }
  | {
      kind: "refusal";
      refusal_id: string;
      explanation: string;
      nearest_answerable: string;
      meta: Meta;
    }
  | { kind: "throttled"; reason: string }
  | { kind: "unavailable"; reason: string; message?: string }
  | { kind: "error"; message: string };

type GalleryEntry = Extract<ApiResult, { kind: "answer" } | { kind: "refusal" }> & {
  question: string;
};

const EXAMPLES: Array<{ question: string; note: string }> = (
  gallery as { examples: GalleryEntry[] }
).examples.map((entry) => ({
  question: entry.question,
  note: entry.kind === "refusal" ? "Refused" : "Answered",
}));

type Stage = "idle" | "translating" | "validating" | "executing";

export function AskConsole() {
  const [question, setQuestion] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [rows, setRows] = useState<QueryResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void import("@/lib/duckdb/client").then((m) => m.getConnection().catch(() => {}));
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  const ask = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setResult(null);
    setVerdict(null);
    setRows(null);
    setRunError(null);
    setFromCache(false);
    setStage("translating");

    let api: ApiResult;
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      api = (await response.json()) as ApiResult;
    } catch {
      api = { kind: "unavailable", reason: "network" };
    }

    // The live translator being unavailable must not mean a broken page. If the
    // question matches one of the pre-run examples, serve that and say so.
    if (api.kind === "unavailable" || api.kind === "throttled") {
      const cached = (gallery as { examples: GalleryEntry[] }).examples.find(
        (entry) => entry.question.toLowerCase() === trimmed.toLowerCase(),
      );
      if (cached) {
        setFromCache(true);
        api = cached;
      }
    }

    setResult(api);

    if (api.kind !== "answer") {
      setStage("idle");
      return;
    }

    setStage("validating");
    const checked = await validateSql(api.sql, serializeSql, policy);
    setVerdict(checked);

    if (!checked.allowed || !checked.sql) {
      setStage("idle");
      return;
    }

    setStage("executing");
    try {
      setRows(await runQuery(checked.sql));
    } catch (error) {
      setRunError(
        error instanceof QueryError ? error.message : String(error),
      );
    } finally {
      setStage("idle");
    }
  }, []);

  const busy = stage !== "idle";

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Ask a question"
          meta={<span>Plain English. Ctrl/⌘ + Enter to send.</span>}
        />
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void ask(question);
            }
          }}
          rows={3}
          maxLength={400}
          placeholder="Which acquisition channel produced the most revenue per lead?"
          aria-label="Your question"
          className="w-full resize-y bg-transparent px-5 py-4 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-subtle"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => void ask(question)}
            disabled={busy || !question.trim()}
            className="rounded border border-accent bg-accent px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {stage === "translating"
              ? "Translating…"
              : stage === "validating"
                ? "Validating…"
                : stage === "executing"
                  ? "Running…"
                  : "Ask"}
          </button>
          <StageTrail stage={stage} />
        </div>
      </Panel>

      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-subtle">
          Try one
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example.question}
              type="button"
              disabled={busy}
              onClick={() => {
                setQuestion(example.question);
                void ask(example.question);
              }}
              className={cn(
                "rounded border px-3 py-1.5 text-left text-xs transition-colors disabled:opacity-50",
                example.note === "Refused"
                  ? "border-caution/30 text-caution hover:border-caution/60"
                  : "border-border text-ink-muted hover:border-border-strong hover:text-ink",
              )}
            >
              {example.question}
            </button>
          ))}
        </div>
        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-ink-subtle">
          The amber questions are ones the layer refuses. They are here on
          purpose: a system that answers everything is a system that is
          sometimes lying.
        </p>
      </div>

      {fromCache ? (
        <div className="rounded-lg border border-info/40 bg-info/5 px-5 py-3.5 text-sm text-ink-muted">
          <span className="text-info">Pre-run answer.</span> The live translator
          is unavailable or rate-limited right now, so this is the recorded
          result of running the same question earlier — real output, not a
          mock-up. Everything below it still executed in your browser just now.
        </div>
      ) : null}

      {result?.kind === "refusal" ? <RefusalCard result={result} /> : null}
      {result?.kind === "answer" ? (
        <AnswerCard result={result} verdict={verdict} rows={rows} runError={runError} />
      ) : null}
      {result?.kind === "throttled" ? (
        <Notice tone="caution" title="Rate limited">
          {result.reason === "daily_budget"
            ? "The demo has spent its budget for today. The pre-run examples above still work."
            : "Too many questions in a short window. Wait a moment, or try one of the pre-run examples."}
        </Notice>
      ) : null}
      {result?.kind === "unavailable" ? (
        <Notice tone="caution" title="Live translation unavailable">
          {result.reason === "no_key"
            ? "No API key is configured on this deployment, so the live translator is off. The pre-run examples above show real recorded output."
            : "The translation service could not be reached. The pre-run examples above still work."}
        </Notice>
      ) : null}
      {result?.kind === "error" ? (
        <Notice tone="negative" title="Rejected">
          {result.message}
        </Notice>
      ) : null}
    </div>
  );
}

function StageTrail({ stage }: { stage: Stage }) {
  const steps: Array<{ key: Stage; label: string }> = [
    { key: "translating", label: "Translate" },
    { key: "validating", label: "Validate" },
    { key: "executing", label: "Execute" },
  ];
  return (
    <ol className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em]">
      {steps.map((step, i) => (
        <li key={step.key} className="flex items-center gap-1.5">
          <span className={stage === step.key ? "text-accent" : "text-ink-subtle"}>
            {step.label}
          </span>
          {i < steps.length - 1 ? <span className="text-border-strong">→</span> : null}
        </li>
      ))}
    </ol>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: "caution" | "negative" | "info";
  title: string;
  children: React.ReactNode;
}) {
  const border =
    tone === "negative"
      ? "border-negative/40 bg-negative/5"
      : tone === "caution"
        ? "border-caution/40 bg-caution/5"
        : "border-info/40 bg-info/5";
  return (
    <div className={cn("rounded-lg border px-5 py-4", border)}>
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink">
        {title}
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
        {children}
      </p>
    </div>
  );
}

function RefusalCard({
  result,
}: {
  result: Extract<ApiResult, { kind: "refusal" }>;
}) {
  return (
    <Panel className="border-caution/40">
      <PanelHeader
        title="Refused"
        className="border-caution/40"
        meta={<span className="font-mono text-caution">{result.refusal_id}</span>}
      />
      <div className="space-y-4 px-5 py-5">
        <p className="max-w-2xl leading-relaxed text-ink">{result.explanation}</p>
        {result.nearest_answerable ? (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-subtle">
              What it can answer instead
            </p>
            <p className="mt-1.5 text-sm text-ink-muted">
              {result.nearest_answerable}
            </p>
          </div>
        ) : null}
        <p className="max-w-2xl border-t border-border pt-4 text-xs leading-relaxed text-ink-subtle">
          No SQL was generated and nothing was executed. The refusal is a
          structured decision the model returns, not prose that had to be
          pattern-matched afterwards.
        </p>
      </div>
      <MetaBar meta={result.meta} />
    </Panel>
  );
}

function AnswerCard({
  result,
  verdict,
  rows,
  runError,
}: {
  result: Extract<ApiResult, { kind: "answer" }>;
  verdict: Verdict | null;
  rows: QueryResult | null;
  runError: string | null;
}) {
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="What this measures"
          meta={
            <span className="tnum">
              confidence {(result.confidence * 100).toFixed(0)}%
            </span>
          }
        />
        <div className="space-y-4 px-5 py-5">
          <p className="max-w-2xl leading-relaxed text-ink">{result.explanation}</p>
          {result.metrics_used.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-subtle">
                Layer metrics applied
              </span>
              {result.metrics_used.map((metric) => (
                <Badge key={metric} tone="accent">
                  {metric}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <MetaBar meta={result.meta} />
      </Panel>

      <Panel className={verdict && !verdict.allowed ? "border-negative/40" : undefined}>
        <PanelHeader
          title="Generated SQL"
          className={verdict && !verdict.allowed ? "border-negative/40" : undefined}
          meta={
            verdict ? (
              verdict.allowed ? (
                <span className="text-positive">
                  Passed validation · limit {verdict.limitApplied}
                </span>
              ) : (
                <span className="text-negative">Blocked by the validator</span>
              )
            ) : (
              <span>Validating…</span>
            )
          }
        />
        <pre className="scroll-panel overflow-x-auto px-5 py-4 font-mono text-[13px] leading-relaxed text-ink">
          {verdict?.sql ?? result.sql}
        </pre>
        {verdict && !verdict.allowed ? (
          <ul className="space-y-2 border-t border-negative/40 px-5 py-4">
            {verdict.violations.map((violation) => (
              <li key={violation.code} className="flex flex-wrap items-baseline gap-x-3">
                <Badge tone="negative">{violation.code}</Badge>
                <span className="text-sm text-ink-muted">{violation.message}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {verdict?.allowed && verdict.tables.length > 0 ? (
          <p className="border-t border-border px-5 py-3 font-mono text-[11px] text-ink-subtle">
            Reads {verdict.tables.join(", ")}
          </p>
        ) : null}
      </Panel>

      {runError ? (
        <Notice tone="negative" title="The query failed to execute">
          {runError}
        </Notice>
      ) : null}

      {rows ? <Results rows={rows} /> : null}
    </div>
  );
}

function MetaBar({ meta }: { meta: Meta }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-5 py-3 font-mono text-[11px] text-ink-subtle">
      <span>{meta.model}</span>
      <span>effort {meta.effort}</span>
      <span className="tnum">{(meta.latencyMs / 1000).toFixed(1)}s</span>
      <span className="tnum">
        {int(meta.inputTokens + meta.cacheReadTokens + meta.cacheWriteTokens)} in /{" "}
        {int(meta.outputTokens)} out
      </span>
      {meta.cacheReadTokens > 0 ? (
        <span className="text-positive">
          {int(meta.cacheReadTokens)} cached
        </span>
      ) : null}
      <span className="tnum ml-auto">${meta.costUsd.toFixed(4)}</span>
    </div>
  );
}

function Results({ rows }: { rows: QueryResult }) {
  if (rows.rowCount === 0) {
    return (
      <Panel className="px-5 py-4 text-sm text-ink-muted">
        The query ran and returned no rows.
      </Panel>
    );
  }
  const shown = rows.rows.slice(0, 100);
  return (
    <Panel>
      <PanelHeader
        title="Result"
        meta={
          <span className="tnum">
            <span className="text-accent">{rows.elapsedMs.toFixed(1)} ms</span> ·{" "}
            {int(rows.rowCount)} rows · in your browser
          </span>
        }
      />
      <div className="scroll-panel max-h-[26rem] overflow-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              {rows.columns.map((column) => (
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
            {shown.map((row, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={cn(
                      "whitespace-nowrap px-4 py-2",
                      typeof cell === "number"
                        ? "tnum text-right font-mono text-ink"
                        : "text-ink-muted",
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
      {rows.rowCount > shown.length ? (
        <p className="border-t border-border px-5 py-2.5 font-mono text-[11px] text-ink-subtle">
          Showing the first {shown.length} of {int(rows.rowCount)} rows.
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
