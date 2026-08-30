import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { NAV_ROUTES, RESUME_HREF } from "@/lib/routes";

const CAPABILITIES = [
  {
    group: "Dashboards" as const,
    n: "01",
    heading: "I build the dataset before I build the chart",
    body: "Two dashboards over real acquisition data: a business-development pipeline and a lead-to-revenue attribution model with a prospect score you can re-weight yourself. Every metric has a written definition and a source.",
  },
  {
    group: "AI systems" as const,
    n: "02",
    heading: "I encode the business so the model can act on it",
    body: "A governed semantic layer — entities, metrics with explicit formulas, allowed joins, and refusal rules — with a natural-language interface on top. The generated SQL is always shown, and a validation chain stands between the question and the data.",
  },
  {
    group: "Evidence" as const,
    n: "03",
    heading: "I measure whether the model is actually right",
    body: "A benchmark of language models on structured analytical work: text-to-SQL accuracy and extraction consistency, scored with confidence intervals, paired significance tests, an error taxonomy, and calibration curves.",
  },
];

const GROUND_RULES = [
  {
    rule: "Every number is real and traceable",
    detail:
      "No synthetic figures presented as findings. Each page carries a provenance block naming the source, the files, the pull date, and the record count. Where a dataset is itself synthetic, the page says so.",
  },
  {
    rule: "Limitations are on the page, not buried",
    detail:
      "The prospect model's weaknesses, the benchmark's sample-size limits, and the questions this data cannot answer are stated where the results are. An objection an interviewer would raise should already be answered.",
  },
  {
    rule: "The model does not do the thinking",
    detail:
      "The semantic layer, the prompts, and the guardrails are the work. The language model is a fast executor operating inside constraints someone had to author.",
  },
  {
    rule: "You can check the work",
    detail:
      "Generated SQL, metric definitions, test cases, and statistical methods are all visible. The pipeline reproduces every figure from one command.",
  },
];

export default function Home() {
  return (
    <>
      <section className="border-b border-border">
        <Container wide className="py-20 sm:py-28">
          <div className="rise max-w-4xl">
            <Badge tone="accent">Portfolio</Badge>
            <h1 className="mt-7 font-display text-5xl leading-[1.02] tracking-tight sm:text-7xl">
              Most analytics portfolios show you charts.
              <span className="block text-ink-subtle">
                This one shows the work underneath them.
              </span>
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-ink-muted">
              I&rsquo;m Jack Kelly. Eleven years at Nielsen spent turning expensive
              business problems into working systems — a permissioned BI console
              serving 400+ users, Salesforce automation performing work equal to 22
              full-time agents, and $2.7M in identified annual value from scoring
              prospects against data the business already held.
            </p>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-muted">
              A résumé asserts that. This site demonstrates it, on public data, with
              the methods visible.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/evals"
                className="rounded border border-accent bg-accent px-5 py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-bg transition-opacity hover:opacity-90"
              >
                Start with the evaluation lab
              </Link>
              <a
                href={RESUME_HREF}
                download
                className="rounded border border-border-strong px-5 py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-ink-muted transition-colors hover:border-ink-muted hover:text-ink"
              >
                Download résumé
              </a>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-b border-border">
        <Container wide className="py-16 sm:py-20">
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-3">
            {CAPABILITIES.map((cap) => {
              const routes = NAV_ROUTES.filter((r) => r.group === cap.group);
              return (
                <div key={cap.group} className="flex flex-col bg-surface p-7">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs text-accent">{cap.n}</span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-subtle">
                      {cap.group}
                    </span>
                  </div>
                  <h2 className="mt-5 font-display text-2xl leading-snug">
                    {cap.heading}
                  </h2>
                  <p className="mt-4 flex-1 text-sm leading-relaxed text-ink-muted">
                    {cap.body}
                  </p>
                  <ul className="mt-7 space-y-2 border-t border-border pt-5">
                    {routes.map((r) => (
                      <li key={r.href}>
                        <Link
                          href={r.href}
                          className="group flex items-center justify-between gap-3 text-sm text-ink-muted transition-colors hover:text-accent"
                        >
                          <span>{r.title}</span>
                          <span className="font-mono text-xs text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent">
                            →
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      <section>
        <Container wide className="py-16 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[20rem_1fr]">
            <div>
              <h2 className="font-display text-3xl leading-tight">
                Ground rules
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                These constrain everything on the site. Breaking them would make
                the portfolio worse than not having one.
              </p>
            </div>
            <ol className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
              {GROUND_RULES.map((r, i) => (
                <li key={r.rule} className="bg-surface p-6">
                  <p className="font-mono text-xs text-accent">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <p className="mt-3 font-medium">{r.rule}</p>
                  <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
                    {r.detail}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </Container>
      </section>
    </>
  );
}
