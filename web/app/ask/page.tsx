import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { AskConsole } from "@/components/ask-console";
import { routeByHref } from "@/lib/routes";
import { layer } from "@/lib/ask/prompt";

const route = routeByHref("/ask")!;

export const metadata: Metadata = {
  title: route.title,
  description: route.blurb,
};

const CHAIN = [
  {
    step: "01",
    title: "Translate",
    body: "The question goes to a serverless function holding the API key. The model receives the semantic layer — entity definitions, metric SQL, mandatory filters, permitted joins, refusal rules — and returns either SQL or a refusal, both as structured tool calls rather than prose.",
    detail: "The model never gets a database connection.",
  },
  {
    step: "02",
    title: "Validate",
    body: "The SQL is parsed by DuckDB's own parser and checked against a generated allowlist: published tables only, real columns, permitted joins, no cartesian products, one statement, read-only. A row limit is applied rather than requested.",
    detail: "Same engine that executes it, so there is no dialect gap.",
  },
  {
    step: "03",
    title: "Execute",
    body: "Approved SQL runs in your browser against Parquet served over HTTP. Nothing you ask is stored, and the result never passes back through a server.",
    detail: "The query you see is the query that ran.",
  },
];

export default function AskPage() {
  return (
    <>
      <PageHeader
        eyebrow={route.group ?? undefined}
        title={route.title}
        blurb={route.blurb}
        status={
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">
              {Object.keys(layer.metrics).length} governed metrics
            </Badge>
            <Badge>{Object.keys(layer.entities).length} entities</Badge>
            <Badge tone="caution">{layer.refusals.length} refusal rules</Badge>
          </div>
        }
      />

      <Container wide className="space-y-16 py-14">
        <section className="grid gap-10 lg:grid-cols-[1fr_22rem]">
          <div>
            <AskConsole />
          </div>
          <aside className="space-y-6">
            <div>
              <h2 className="font-display text-2xl leading-tight">
                The layer is the product
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                Anyone can wire a text box to a language model. What makes the
                answer trustworthy is the thing underneath: documented entities,
                metrics with explicit SQL, filters that are mandatory rather than
                advisory, and a written account of what the data cannot support.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                A model pointed at raw tables here would confidently report that{" "}
                <span className="text-ink">45%</span> of signed clients generate
                revenue. The right answer is{" "}
                <span className="text-ink">51.4%</span>, and the difference is a
                filter the schema cannot tell it about. The layer can, so it
                does, and the mandatory filter is enforced rather than suggested.
              </p>
              <Link
                href="/methods"
                className="mt-5 inline-block font-mono text-[11px] uppercase tracking-[0.08em] text-accent hover:underline"
              >
                Read the layer and the data dictionary →
              </Link>
            </div>

            <Panel>
              <PanelHeader title="What a question costs" />
              <dl className="divide-y divide-border text-sm">
                {[
                  ["Model", "Claude Haiku 4.5"],
                  ["Median latency", "2.2 seconds"],
                  ["Cost per question", "$0.0019"],
                  ["Rate limit", "5/min, 40/day per visitor"],
                  ["Daily budget", "$0.50, then pre-run answers"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between gap-4 px-4 py-2.5"
                  >
                    <dt className="text-ink-subtle">{label}</dt>
                    <dd className="text-right font-mono text-xs text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="border-t border-border px-4 py-3 text-xs leading-relaxed text-ink-subtle">
                Measured over 72 benchmark cases, not estimated. Haiku was
                chosen because it matched both larger models to within three
                points at a fifth of the cost — the{" "}
                <Link href="/evals" className="text-accent hover:underline">
                  evaluation lab
                </Link>{" "}
                shows the working. The cost of every question you ask is shown
                with its answer.
              </p>
            </Panel>
          </aside>
        </section>

        <section>
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">01</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              What happens between the question and the answer
            </h2>
          </div>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-3">
            {CHAIN.map((item) => (
              <li key={item.step} className="bg-surface p-6">
                <p className="font-mono text-xs text-accent">{item.step}</p>
                <h3 className="mt-3 font-display text-xl">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  {item.body}
                </p>
                <p className="mt-4 border-t border-border pt-3 font-mono text-[11px] text-ink-subtle">
                  {item.detail}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-ink-muted">
            The validation step is worth its own page.{" "}
            <Link href="/guardrails" className="text-accent hover:underline">
              Guardrails
            </Link>{" "}
            publishes the whole chain and lets you try to break it.
          </p>
        </section>

        <section>
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">02</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              What this does not prove
            </h2>
          </div>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                head: "A demo is not an evaluation",
                body: "Watching a few questions succeed says almost nothing about how often this is right. That is measured properly on the evaluation lab, against gold queries, with confidence intervals — a handful of impressive examples is exactly the evidence a careful reader should distrust.",
              },
              {
                head: "The validator checks form, not truth",
                body: "It can prove the SQL only touches published tables through permitted joins. It cannot prove the query answers the question that was asked. That gap is why the generated SQL and the metric definitions are always on screen.",
              },
              {
                head: "Confidence is self-reported",
                body: "The number beside each answer is the model's own estimate, not a measurement. Whether it is calibrated — whether 80% confidence really means right 80% of the time — is a question the evaluation lab answers.",
              },
              {
                head: "Refusals can be wrong too",
                body: "A refusal is as much a decision as an answer. The layer can decline something it could in fact support, which is a failure that hides itself because nothing looks broken.",
              },
              {
                head: "Nothing here is secret",
                body: "The data is public and the queries run in your browser, so these guardrails are not protecting a database. They protect the answer. The same chain is what would sit in front of a private warehouse.",
              },
              {
                head: "One layer, one author",
                body: "Every definition here reflects one analyst's judgment about what the words mean. In a real deployment those definitions are negotiated with the business, and the negotiation is most of the work.",
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
        </section>
      </Container>
    </>
  );
}
