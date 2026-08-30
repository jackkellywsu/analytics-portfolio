import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { RedTeamPanel } from "@/components/red-team-panel";
import { routeByHref } from "@/lib/routes";
import { layer, systemPrompt } from "@/lib/ask/prompt";
import policyJson from "@/public/data/policy.json";
import corpus from "@/public/data/guardrail_cases.json";

const route = routeByHref("/guardrails")!;

export const metadata: Metadata = {
  title: route.title,
  description: route.blurb,
};

const policy = policyJson as { columns_by_table: Record<string, string[]> };
const caseCount = (corpus as { cases: unknown[] }).cases.length;

const LAYERS = [
  {
    n: "01",
    name: "Input",
    what: "Length cap, and a question that is only a question.",
    detail:
      "Questions are capped at 400 characters. Longer ones are almost always several questions, and a long input is also the cheapest way to run up a bill.",
  },
  {
    n: "02",
    name: "The layer itself",
    what: "The model can only reach what has been defined.",
    detail:
      "The prompt contains the entities, metrics, and permitted joins — nothing else. There is no schema introspection tool and no database connection, so a table that is not in the layer is not reachable even in principle.",
  },
  {
    n: "03",
    name: "Structured output",
    what: "Answer or refusal, never prose.",
    detail:
      "The model must call one of two tools with a strict schema. A refusal is a distinct structured call rather than a sentence that has to be pattern-matched, which is how refusals get missed.",
  },
  {
    n: "04",
    name: "Parse",
    what: "DuckDB's own parser, not a second one.",
    detail:
      "The SQL is parsed by the same engine that will run it. DuckDB refuses to serialise anything that is not a SELECT, so DDL, DML, and PRAGMA are rejected before any custom check runs.",
  },
  {
    n: "05",
    name: "Allowlist",
    what: "Published tables and real columns only.",
    detail:
      "Table and column names are checked against a list generated from the shipped Parquet, so the allowlist cannot describe something that does not exist. Table-valued functions are rejected outright — that is how a remote file gets read.",
  },
  {
    n: "06",
    name: "Shape",
    what: "No meaningless joins, no runaway products.",
    detail:
      "Joins across the two domains are rejected by name: one dataset is a synthetic hardware vendor, the other a real marketplace. A join with no ON condition is rejected because two 99,000-row tables multiplied together is a hung browser tab.",
  },
  {
    n: "07",
    name: "Limit",
    what: "Applied, not requested.",
    detail:
      "A row limit is written into the statement by the validator. A limit the model is asked to include is a limit it will sometimes forget.",
  },
  {
    n: "08",
    name: "Budget",
    what: "Rate limits and a daily spend cap.",
    detail:
      "Five questions a minute and forty a day per visitor, with a daily dollar cap across everyone. Past it the page serves pre-run answers rather than failing.",
  },
];

export default function GuardrailsPage() {
  const prompt = systemPrompt(policy.columns_by_table);
  const approxTokens = Math.round(prompt.length / 4);

  return (
    <>
      <PageHeader
        eyebrow={route.group ?? undefined}
        title={route.title}
        blurb={route.blurb}
        status={
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">{LAYERS.length} layers</Badge>
            <Badge>{caseCount} conformance cases</Badge>
            <Badge tone="positive">2 implementations, 1 corpus</Badge>
          </div>
        }
      />

      <Container wide className="space-y-16 py-14">
        <section className="max-w-3xl">
          <p className="font-mono text-xs text-accent">00</p>
          <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
            What this actually protects
          </h2>
          <p className="mt-4 leading-relaxed text-ink-muted">
            Worth being straight about, because the usual framing is wrong here.
            The data behind this site is public, and every query runs in your own
            browser against files anyone can download. None of these checks are
            guarding a secret. There is no database to break into.
          </p>
          <p className="mt-4 leading-relaxed text-ink-muted">
            They guard the <span className="text-ink">answer</span>. A model that
            quietly drops a mandatory filter, reads a join between two unrelated
            businesses, or invents a column produces a number that looks correct
            and is not — and the person asking, by construction, cannot tell.
            That is the failure that matters when the question comes from someone
            who does not read SQL.
          </p>
          <p className="mt-4 leading-relaxed text-ink-muted">
            The same chain is what would sit between a natural-language interface
            and a private warehouse, and it is built so that it could. The
            difference there is only that a mistake costs more.
          </p>
        </section>

        <section>
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">01</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              The chain
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Eight layers between a sentence and a result set. Each one assumes
              the ones before it failed.
            </p>
          </div>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {LAYERS.map((item) => (
              <li key={item.n} className="bg-surface p-5">
                <div className="flex items-baseline gap-2.5">
                  <span className="font-mono text-xs text-accent">{item.n}</span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-subtle">
                    {item.name}
                  </span>
                </div>
                <p className="mt-3 font-medium text-ink">{item.what}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {item.detail}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">02</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              Try to break it
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              These are the conformance cases, running against the real validator
              in your browser. The same file drives the Python test suite and the
              Node one, so a case here is a case asserted in CI — and a rule
              someone weakens has to break all three at once.
            </p>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Editing the SQL is the interesting part. Four of these cases exist
              because writing them found a real hole:{" "}
              <span className="font-mono text-ink">read_parquet</span> on a remote
              URL slipped past the table allowlist by having no table name at all,
              and a comma join slipped past the cartesian check because DuckDB
              reports its <span className="font-mono text-ink">using_columns</span>{" "}
              as an empty array rather than null.
            </p>
          </div>
          <div className="mt-8">
            <RedTeamPanel />
          </div>
        </section>

        <section>
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">03</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              The prompt, published
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Generated from{" "}
              <span className="font-mono text-ink">semantic/layer.yaml</span>{" "}
              rather than written by hand. A hand-written prompt and a maintained
              layer drift apart within a week, and the drift is invisible: the
              model keeps answering, just with a definition nobody agreed to any
              more. Roughly {approxTokens.toLocaleString("en-US")} tokens,
              identical on every request, which is why it is cached.
            </p>
          </div>
          <Panel className="mt-8">
            <PanelHeader
              title="System prompt"
              meta={
                <span>
                  {Object.keys(layer.metrics).length} metrics ·{" "}
                  {Object.keys(layer.entities).length} entities ·{" "}
                  {layer.forbidden_joins.length} forbidden joins ·{" "}
                  {layer.refusals.length} refusal rules
                </span>
              }
            />
            <details className="group">
              <summary className="cursor-pointer px-5 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-subtle marker:content-[''] hover:text-ink">
                <span className="group-open:hidden">Show the whole thing</span>
                <span className="hidden group-open:inline">Hide it</span>
              </summary>
              <pre className="scroll-panel max-h-[36rem] overflow-auto border-t border-border px-5 py-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-muted">
                {prompt}
              </pre>
            </details>
          </Panel>
        </section>

        <section>
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">04</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              Where this is weak
            </h2>
          </div>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                head: "Rate limiting is in memory",
                body: "Serverless instances do not share state, so a caller spreading requests across cold starts gets more than the stated limits. A durable store is the production answer. What makes it safe enough here is that the account spend limit is the real backstop and the page degrades to pre-run answers rather than failing.",
              },
              {
                head: "Validation proves form, not truth",
                body: "Every check here is structural. None of them can tell whether the query answers the question that was asked. That is measured on the evaluation lab against gold queries, not asserted here.",
              },
              {
                head: "The layer can be wrong",
                body: "Every definition reflects one analyst's judgment. A metric defined incorrectly will be applied correctly and consistently, and the guardrails will not notice. Publishing the definitions is the only defence, which is why they are on the page.",
              },
              {
                head: "Refusals are not verified",
                body: "The model decides when to refuse. It can decline something the layer could support, and nothing here catches that — a false refusal looks identical to a correct one from the outside.",
              },
              {
                head: "Prompt injection is only partly handled",
                body: "A question cannot reach the database directly, and anything the model emits must survive the validator. But a cleverly worded question could still steer the model toward a technically valid query that answers something misleading.",
              },
              {
                head: "Two implementations, one corpus",
                body: `Python and TypeScript agree on all ${caseCount} cases today. They agree because a test forces them to, not because they share code — a rule added to one and not the other would pass its own suite and fail the shared one.`,
              },
            ].map((item) => (
              <li key={item.head} className="rounded-lg border border-border bg-surface p-5">
                <p className="font-medium text-ink">{item.head}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-8 max-w-3xl text-sm leading-relaxed text-ink-muted">
            The natural next question — how often is the SQL actually right — is
            not answerable from this page.{" "}
            <Link href="/evals" className="text-accent hover:underline">
              The evaluation lab
            </Link>{" "}
            measures it.
          </p>
        </section>
      </Container>
    </>
  );
}
