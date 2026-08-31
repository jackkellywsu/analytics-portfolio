import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { routeByHref, RESUME_HREF, SITE } from "@/lib/routes";

const route = routeByHref("/about")!;

export const metadata: Metadata = {
  title: route.title,
  description: route.blurb,
};

const ROLES = [
  {
    period: "2022 – present",
    title: "Business Intelligence Lead / Senior Data Analyst II",
    org: "Nielsen · Research & Analytics",
    points: [
      "Owns the curated, canonical datasets used across the business, built by translating a raw, unstructured datalake into trusted tables that analysis, platform builds, and operational rules all depend on.",
      "Encoded that expertise into semantic layers, prompt frameworks, and MCP connections, turning an agentic workflow into a working analyst. Cycle time fell from one to two months to under five days, and the protocols onboarded the full team.",
      "Built the Business Intelligence Console, a permissioned single source of truth serving 400+ users across five departments, retiring 100+ conflicting reports and setting the BI standard for Audio and international panels.",
      "Modelled which contact-centre work could be done digitally, then built the Salesforce automation to do it. Digital labour now performs work equal to 22 FTE and 59% of weekend output, lifting on-time issue resolution 8% while recurrence fell 21%.",
    ],
    award: "Circle of Excellence Award, 2022",
  },
  {
    period: "2026",
    title: "Executive AI Task Force",
    org: "Nielsen · one of four subject-matter experts",
    points: [
      "Identified approximately $2.7M in annual recurring value in panellist acquisition, by scoring prospective addresses against data the business already held and sourcing the hardest-to-recruit demographic from adjacent panels where participants had already consented.",
      "Went from problem statement to presented analysis in one week, against a baseline of multiple two-week sprints, because the AI context and semantic groundwork already existed.",
    ],
  },
  {
    period: "2019 – 2022",
    title: "Regional Quality Lead",
    org: "Nielsen",
    points: [
      "Core analytics contributor to the executive recovery team that regained Nielsen's Media Rating Council accreditation after data quality failures cost the company its accredited status.",
      "Detected a fraudulent reporting pattern manual assessment had missed, then designed the recurrence analysis that automated national detection of it — still in production.",
      "Replaced sampled manual auditing (30–40 assessments per lead monthly against roughly 1,000 field reps) with analytics-driven risk targeting covering the full population at lower cost, self-teaching Alteryx to build the compliance measures, Looker dashboards, and BigQuery pipelines behind it.",
    ],
    award: "Arthur C. Nielsen Award, 2021 — the company's highest global honour",
  },
  {
    period: "2015 – 2019",
    title: "Field Representative",
    org: "Nielsen",
    points: [
      "Managed two field areas across three states, twice the standard assignment, against installation, quality, and attrition targets. Deployed to Houston, San Antonio, and Boston to stabilise underperforming markets.",
    ],
  },
];

const MAPPING = [
  {
    here: "The prospect score on Attribution",
    there: "The $2.7M panellist-acquisition work",
    body: "Same shape: score prospects against data the business already holds, decompose the score so a stakeholder can argue with the weights, and be honest about which components are too sparse to model on.",
    href: "/attribution",
  },
  {
    here: "The semantic layer and the natural-language interface",
    there: "The semantic layers and MCP connections that cut cycle time to under five days",
    body: "Encoding what the business words mean is the work. The model is a fast executor inside constraints somebody had to author, and the benchmark measures what that authoring is worth.",
    href: "/ask",
  },
  {
    here: "The cleaning log and data dictionary on Methods",
    there: "Owning canonical datasets and passing external audits",
    body: "Every normalisation recorded with the rows it touched, including the ones deliberately left alone. Governance work that nobody can inspect is indistinguishable from a fudge.",
    href: "/methods",
  },
  {
    here: "The anomaly detector and its sensitivity curve",
    there: "The fraud pattern manual assessment missed, and the recurrence analysis that automated finding it",
    body: "Detecting the thing is half of it. Knowing what size of event you would miss is the half that decides whether anyone should rely on it.",
    href: "/anomalies",
  },
  {
    here: "The confidence intervals on every rate",
    there: "The MRC accreditation recovery",
    body: "Regaining an accreditation is an exercise in being able to defend every number. A ranking without intervals is a number that cannot be defended.",
    href: "/pipeline",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="Eleven years turning expensive problems into working systems"
        blurb="A résumé asserts. This site was built to demonstrate — on public data, with the methods visible and the limitations on the page."
        status={
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">{SITE.location}</Badge>
            <Badge>Arthur C. Nielsen Award, 2021</Badge>
            <Badge>M.S. Business Intelligence</Badge>
          </div>
        }
      />

      <Container wide className="space-y-16 py-14">
        <section className="grid gap-10 lg:grid-cols-[1fr_20rem]">
          <div className="max-w-3xl space-y-5 text-lg leading-relaxed text-ink-muted">
            <p>
              I spent eleven years at Nielsen, and the through-line is narrower
              than the job titles suggest: I am usually the person who works out
              what the data actually means before anyone builds on top of it.
            </p>
            <p>
              That started in the field, installing metering equipment in
              people&rsquo;s homes and learning how measurement goes wrong in
              practice. It carried through a quality role during the recovery of
              Nielsen&rsquo;s Media Rating Council accreditation, where the job
              was to defend every number to an external auditor. It ended up in
              BI, owning the canonical datasets other teams build against —
              which is mostly the work of deciding what a word like{" "}
              <span className="text-ink">client</span> or{" "}
              <span className="text-ink">win rate</span> is going to mean, and
              then making that decision hold.
            </p>
            <p>
              That last part turned out to be exactly what AI systems need. A
              language model pointed at raw tables produces confident nonsense,
              because the things that make an answer correct — which filter is
              mandatory, which join is meaningless, what a null means in this
              column — are not in the schema. Encoding them is the same job I was
              already doing. This site measures what it is worth:{" "}
              <Link href="/evals" className="text-accent hover:underline">
                +18 to +36 accuracy points
              </Link>
              , more than the difference between the cheapest model and the most
              expensive one.
            </p>
            <p>
              I am looking for work where that combination is the point:
              somewhere the business problem is expensive, the data is messy, and
              somebody needs to be accountable for whether the answer is right.
            </p>
          </div>

          <aside className="space-y-4">
            <Panel>
              <PanelHeader title="Get in touch" />
              <ul className="divide-y divide-border text-sm">
                {[
                  ["Email", SITE.email, `mailto:${SITE.email}`],
                  ["LinkedIn", "in/jackkellywsu", SITE.linkedin],
                  ["Résumé", "PDF, one page", RESUME_HREF],
                ].map(([label, value, href]) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-surface-2"
                      {...(label === "Résumé" ? { download: true } : {})}
                    >
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
                        {label}
                      </span>
                      <span className="text-right text-xs text-accent">{value}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel>
              <PanelHeader title="Education" />
              <div className="space-y-3 px-4 py-3.5 text-sm">
                <div>
                  <p className="text-ink">M.S., Business Intelligence</p>
                  <p className="text-xs text-ink-subtle">
                    University of Arkansas Grantham, 2022 · 4.0 GPA, with honours
                  </p>
                </div>
                <div>
                  <p className="text-ink">B.A., International Relations</p>
                  <p className="text-xs text-ink-subtle">
                    Wright State University, 2015
                  </p>
                </div>
              </div>
            </Panel>
            <Panel>
              <PanelHeader title="Tools" />
              <p className="px-4 py-3.5 text-xs leading-relaxed text-ink-muted">
                SQL · Python · Alteryx · Tableau · Looker · Power BI · Postgres ·
                BigQuery · Databricks · Hive/Presto · Salesforce · GitLab ·
                Claude, Gemini, Glean, NotebookLM · MCP
              </p>
            </Panel>
          </aside>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">01</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              What is on this site, and what it maps to
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Every page here is a public-data analogue of something I have
              actually shipped. The datasets are different and the stakes are
              lower; the method is the same.
            </p>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-lg border border-border bg-border">
            {MAPPING.map((item) => (
              <li key={item.here} className="bg-surface p-5 sm:p-6">
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr] lg:items-baseline lg:gap-8">
                  <Link
                    href={item.href}
                    className="font-medium text-ink hover:text-accent"
                  >
                    {item.here}
                  </Link>
                  <p className="text-sm text-ink-subtle">{item.there}</p>
                  <p className="text-sm leading-relaxed text-ink-muted">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">02</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              Experience
            </h2>
          </div>
          <ol className="space-y-4">
            {ROLES.map((role) => (
              <li key={role.title} className="rounded-lg border border-border bg-surface p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <div>
                    <h3 className="text-[15px] font-medium text-ink">{role.title}</h3>
                    <p className="mt-0.5 text-sm text-ink-subtle">{role.org}</p>
                  </div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
                    {role.period}
                  </span>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {role.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <span className="mt-2.5 h-px w-4 shrink-0 bg-border-strong" />
                      <span className="text-sm leading-relaxed text-ink-muted">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>
                {role.award ? (
                  <p className="mt-4 border-t border-border pt-3 font-mono text-[11px] text-accent">
                    {role.award}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">03</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              How this was built
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              With Claude Code, over a few sittings, and the source is public. I
              am not going to pretend otherwise — the interesting claim is not
              that I typed every character, it is that I knew which questions to
              ask, caught the places where the output was wrong, and could tell
              the difference between a result and an artefact.
            </p>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Several of those catches are on the site because they are the most
              honest thing on it. The benchmark said the most capable model was
              the worst, and{" "}
              <Link href="/evals" className="text-accent hover:underline">
                the scoring rule was at fault
              </Link>
              . The attribution rate looked like a 45% conversion problem and was{" "}
              <Link href="/attribution" className="text-accent hover:underline">
                an observation-window artefact
              </Link>
              . A model refused a question it could answer, and the fix was in my
              own vocabulary rather than the model. Knowing to check is the
              skill; the tool just makes checking fast.
            </p>
          </div>
          <Panel className="p-5 sm:p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-subtle">
              Stack
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">
              Next.js and TypeScript on Vercel. DuckDB compiled to WebAssembly
              runs every query in your browser over Parquet served by HTTP range
              request. A Python pipeline handles acquisition, cleaning,
              statistics, and the benchmark harness, with 90 tests covering the
              statistical functions and both SQL validators. Claude Haiku 4.5
              powers the natural-language interface, chosen from a 648-call
              benchmark rather than from intuition.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="https://github.com/jackkellywsu/analytics-portfolio"
                target="_blank"
                rel="noreferrer"
                className="rounded border border-border-strong px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted transition-colors hover:border-ink-muted hover:text-ink"
              >
                Source on GitHub
              </a>
              <a
                href={RESUME_HREF}
                download
                className="rounded border border-accent bg-accent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-bg transition-opacity hover:opacity-90"
              >
                Download résumé
              </a>
            </div>
          </Panel>
        </section>
      </Container>
    </>
  );
}
