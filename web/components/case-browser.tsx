"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel, PanelHeader } from "./ui/panel";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/cn";
import { int } from "@/lib/format";

type Case = {
  case_id: string;
  model: string;
  condition: string;
  question: string;
  difficulty: string;
  trap_kind: string | null;
  outcome: string;
  correct: boolean;
  detail: string;
  confidence: number | null;
  gold_sql: string;
  sql: string | null;
  refusal_id: string | null;
};

const OUTCOME_TONE: Record<string, "positive" | "negative" | "caution" | "info"> = {
  correct: "positive",
  extra_columns: "caution",
  false_refusal: "caution",
  wrong_values: "negative",
  wrong_shape: "negative",
  wrong_row_count: "negative",
  execution_error: "negative",
  no_tool_call: "negative",
  api_error: "info",
};

/**
 * Case-level drilldown, loaded on demand.
 *
 * The detail file is several hundred kilobytes — every question, every gold
 * query, and every generated query across the whole grid. Bundling that into
 * the page would make a chart-heavy page slow to serve for the sake of a panel
 * most readers will not open, so it is fetched when this component mounts.
 */
export function CaseBrowser() {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState("haiku");
  const [condition, setCondition] = useState("layer");
  const [outcome, setOutcome] = useState("all");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/evals-cases.json")
      .then((r) => r.json())
      .then((d: { cases: Case[] }) => {
        if (!cancelled) setCases(d.cases);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the case detail.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const models = useMemo(
    () => [...new Set((cases ?? []).map((c) => c.model))],
    [cases],
  );
  const conditions = useMemo(
    () => [...new Set((cases ?? []).map((c) => c.condition))],
    [cases],
  );
  const outcomes = useMemo(
    () => ["all", ...new Set((cases ?? []).map((c) => c.outcome))],
    [cases],
  );

  const filtered = useMemo(
    () =>
      (cases ?? []).filter(
        (c) =>
          c.model === model &&
          c.condition === condition &&
          (outcome === "all" || c.outcome === outcome),
      ),
    [cases, model, condition, outcome],
  );

  if (error) {
    return (
      <Panel className="px-5 py-4 text-sm text-ink-muted">
        {error} The aggregate figures above are unaffected.
      </Panel>
    );
  }
  if (!cases) {
    return (
      <Panel className="px-5 py-4 text-sm text-ink-subtle">
        Loading case detail…
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader
        title={`${filtered.length} of ${int(cases.length)} results`}
        meta={
          <span>
            {filtered.filter((c) => c.correct).length} correct in this slice
          </span>
        }
      />
      <div className="flex flex-wrap gap-x-6 gap-y-3 border-b border-border px-5 py-4">
        <Filter label="Model" value={model} options={models} onChange={setModel} />
        <Filter
          label="Condition"
          value={condition}
          options={conditions}
          onChange={setCondition}
        />
        <Filter
          label="Outcome"
          value={outcome}
          options={outcomes}
          onChange={setOutcome}
        />
      </div>

      <ul className="scroll-panel max-h-[36rem] divide-y divide-border overflow-auto">
        {filtered.map((c) => {
          const key = `${c.case_id}-${c.model}-${c.condition}`;
          const isOpen = open === key;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : key)}
                className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1.5 px-5 py-3 text-left hover:bg-surface-2"
              >
                <span className="font-mono text-[11px] text-ink-subtle">{c.case_id}</span>
                <Badge tone={OUTCOME_TONE[c.outcome] ?? "neutral"}>
                  {c.outcome.replace(/_/g, " ")}
                </Badge>
                <span className="flex-1 text-sm text-ink-muted">{c.question}</span>
                {c.trap_kind ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-caution">
                    trap
                  </span>
                ) : null}
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-subtle">
                  {c.difficulty}
                </span>
              </button>
              {isOpen ? (
                <div className="space-y-3 border-t border-border bg-surface-2/40 px-5 py-4">
                  {c.detail ? (
                    <p className="text-sm text-ink-muted">{c.detail}</p>
                  ) : null}
                  {c.refusal_id ? (
                    <p className="text-sm text-caution">
                      Refused as {c.refusal_id} — but this question is answerable,
                      so the refusal is counted as wrong.
                    </p>
                  ) : null}
                  <div className="grid gap-3 lg:grid-cols-2">
                    <SqlBlock title="Gold query" sql={c.gold_sql} />
                    <SqlBlock
                      title="What the model wrote"
                      sql={c.sql ?? "(no SQL produced)"}
                      tone={c.correct ? "positive" : "negative"}
                    />
                  </div>
                  {c.confidence !== null ? (
                    <p className="font-mono text-[11px] text-ink-subtle">
                      self-reported confidence {Math.round(c.confidence * 100)}%
                      {!c.correct && c.confidence >= 0.8
                        ? " — confidently wrong"
                        : ""}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Filter({
  label: name,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
        {name}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "rounded border px-2 py-1 font-mono text-[11px] transition-colors",
              value === option
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-border bg-surface-2 text-ink-muted hover:text-ink",
            )}
          >
            {option.replace(/_/g, " ")}
          </button>
        ))}
      </div>
    </div>
  );
}

function SqlBlock({
  title,
  sql,
  tone,
}: {
  title: string;
  sql: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
        {title}
      </p>
      <pre
        className={cn(
          "scroll-panel mt-1.5 max-h-56 overflow-auto rounded border px-3 py-2.5 font-mono text-[11px] leading-relaxed",
          tone === "negative"
            ? "border-negative/30 text-ink-muted"
            : tone === "positive"
              ? "border-positive/30 text-ink-muted"
              : "border-border text-ink-muted",
        )}
      >
        {sql}
      </pre>
    </div>
  );
}
