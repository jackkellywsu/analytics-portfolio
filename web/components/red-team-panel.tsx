"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel, PanelHeader } from "./ui/panel";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/cn";
import { serializeSql } from "@/lib/duckdb/client";
import { validateSql, type Policy, type Verdict } from "@/lib/guardrails/validate";
import policyJson from "@/public/data/policy.json";
import corpus from "@/public/data/guardrail_cases.json";

const policy = policyJson as unknown as Policy;

type Case = {
  id: string;
  why?: string;
  sql: string;
  expect: "allow" | "deny";
  codes?: string[];
};

const CASES = (corpus as { cases: Case[] }).cases;

/**
 * The validator, running live.
 *
 * These are not illustrations of the test suite — they are the test suite. The
 * same JSON file drives the Python tests, the Node tests, and this panel, so a
 * case that passes here is a case that is asserted in CI, and a rule that gets
 * weakened has to break all three at once.
 */
export function RedTeamPanel() {
  const [sql, setSql] = useState(CASES[0].sql);
  const [active, setActive] = useState<Case | null>(CASES[0]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [running, setRunning] = useState(false);
  const [sweep, setSweep] = useState<{ passed: number; total: number } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void import("@/lib/duckdb/client").then((m) => m.getConnection().catch(() => {}));
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  const check = useCallback(async (statement: string) => {
    setRunning(true);
    try {
      setVerdict(await validateSql(statement, serializeSql, policy));
    } finally {
      setRunning(false);
    }
  }, []);

  /** Run every case and report how many matched their expected verdict. */
  const runAll = useCallback(async () => {
    setRunning(true);
    setSweep(null);
    let passed = 0;
    for (const testCase of CASES) {
      const result = await validateSql(testCase.sql, serializeSql, policy);
      const expected = testCase.expect === "allow";
      if (result.allowed === expected) passed += 1;
    }
    setSweep({ passed, total: CASES.length });
    setRunning(false);
  }, []);

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title={`${CASES.length} cases`}
          meta={
            <button
              type="button"
              onClick={() => void runAll()}
              disabled={running}
              className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent hover:underline disabled:opacity-50"
            >
              {running ? "Running…" : "Run all"}
            </button>
          }
        />
        <div className="flex flex-wrap gap-2 p-5">
          {CASES.map((testCase) => (
            <button
              key={testCase.id}
              type="button"
              disabled={running}
              onClick={() => {
                setActive(testCase);
                setSql(testCase.sql);
                setSweep(null);
                void check(testCase.sql);
              }}
              className={cn(
                "rounded border px-2.5 py-1 font-mono text-[11px] transition-colors disabled:opacity-50",
                active?.id === testCase.id
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : testCase.expect === "deny"
                    ? "border-border bg-surface-2 text-ink-muted hover:border-negative/50"
                    : "border-border bg-surface-2 text-ink-muted hover:border-positive/50",
              )}
            >
              {testCase.id}
            </button>
          ))}
        </div>
        {sweep ? (
          <p
            className={cn(
              "border-t px-5 py-3 text-sm",
              sweep.passed === sweep.total
                ? "border-positive/40 bg-positive/5 text-ink"
                : "border-negative/40 bg-negative/5 text-ink",
            )}
          >
            <span
              className={
                sweep.passed === sweep.total ? "text-positive" : "text-negative"
              }
            >
              {sweep.passed} of {sweep.total} cases behaved as specified
            </span>
            , checked just now in your browser against the same corpus the Python
            and Node test suites run.
          </p>
        ) : null}
      </Panel>

      {active?.why ? (
        <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">
          <span className="font-mono text-xs text-accent">{active.id}</span> —{" "}
          {active.why}
        </p>
      ) : null}

      <Panel>
        <PanelHeader
          title="SQL under test"
          meta={<span>Edit it and try to get something through</span>}
        />
        <textarea
          value={sql}
          onChange={(e) => {
            setSql(e.target.value);
            setActive(null);
            setSweep(null);
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void check(sql);
            }
          }}
          spellCheck={false}
          rows={5}
          aria-label="SQL to validate"
          className="scroll-panel w-full resize-y bg-transparent px-5 py-4 font-mono text-[13px] leading-relaxed text-ink outline-none"
        />
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => void check(sql)}
            disabled={running || !sql.trim()}
            className="rounded border border-accent bg-accent px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {running ? "Checking…" : "Validate"}
          </button>
          <span className="font-mono text-[11px] text-ink-subtle">
            Nothing here executes. Validation only.
          </span>
        </div>
      </Panel>

      {verdict ? <VerdictCard verdict={verdict} expected={active?.expect} /> : null}
    </div>
  );
}

function VerdictCard({
  verdict,
  expected,
}: {
  verdict: Verdict;
  expected?: "allow" | "deny";
}) {
  const asExpected =
    expected === undefined || verdict.allowed === (expected === "allow");

  return (
    <Panel className={verdict.allowed ? "border-positive/40" : "border-negative/40"}>
      <PanelHeader
        title={verdict.allowed ? "Allowed" : "Blocked"}
        className={verdict.allowed ? "border-positive/40" : "border-negative/40"}
        meta={
          expected !== undefined ? (
            <span className={asExpected ? "text-positive" : "text-negative"}>
              {asExpected ? "as specified" : "NOT as specified"}
            </span>
          ) : null
        }
      />
      {verdict.allowed ? (
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-ink-muted">
            Every check passed. This is the statement that would execute, with
            the row limit applied by the validator rather than requested from the
            model:
          </p>
          <pre className="scroll-panel overflow-x-auto rounded border border-border bg-surface-2 px-4 py-3 font-mono text-xs leading-relaxed text-ink">
            {verdict.sql}
          </pre>
          <p className="font-mono text-[11px] text-ink-subtle">
            Reads {verdict.tables.join(", ") || "no tables"} · limit{" "}
            {verdict.limitApplied}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {verdict.violations.map((violation, i) => (
            <li key={`${violation.code}-${i}`} className="px-5 py-3.5">
              <Badge tone="negative">{violation.code}</Badge>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {violation.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
