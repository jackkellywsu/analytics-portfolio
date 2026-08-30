import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { StatRow, StatTile } from "@/components/ui/stat-tile";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Figure, Legend } from "@/components/charts/figure";
import { IntervalPlot } from "@/components/charts/interval-plot";
import { Heatmap, HeatmapScale } from "@/components/charts/heatmap";
import { Scatter } from "@/components/charts/scatter";
import { CaseBrowser } from "@/components/case-browser";
import { routeByHref } from "@/lib/routes";
import { int, pct, usd } from "@/lib/format";
import { cn } from "@/lib/cn";
import data from "@/public/data/evals.json";

const route = routeByHref("/evals")!;

export const metadata: Metadata = {
  title: route.title,
  description: route.blurb,
};

type Comparison = {
  difference: number;
  ci_low: number;
  ci_high: number;
  p_value: number;
  significant: boolean;
  a_only: number;
  b_only: number;
  n: number;
};

const OUTCOME_LABELS: Record<string, string> = {
  wrong_values: "Wrong values",
  wrong_shape: "Wrong shape",
  extra_columns: "Extra columns",
  wrong_row_count: "Wrong row count",
  execution_error: "Would not run",
  false_refusal: "False refusal",
  no_tool_call: "No tool call",
  api_error: "API error",
};

const TRAP_LABELS: Record<string, string> = {
  missing_required_filter: "Missing required filter",
  grain: "Wrong grain",
  null_semantics: "Null semantics",
  value_normalisation: "Value normalisation",
  join_type: "Join type",
  zero_inflation: "Zero inflation",
};

export default function EvalsPage() {
  const layerRows = data.accuracy.filter((a) => a.condition === "layer");
  const best = [...layerRows].sort(
    (a, b) => b.rate_lenient.point - a.rate_lenient.point,
  )[0];
  const layerVsBare = data.ablation.filter((a) => a.a === "layer" && a.b === "bare");
  const fewShot = data.ablation.filter(
    (a) => a.a === "layer_fewshot" && a.b === "layer",
  );

  const gains = layerVsBare.map((a) => (a.strict as Comparison).difference);
  const minGain = Math.min(...gains);
  const maxGain = Math.max(...gains);

  const outcomes = [...new Set(data.error_heatmap.map((c) => c.outcome))].sort(
    (a, b) =>
      data.error_heatmap
        .filter((c) => c.outcome === b)
        .reduce((s, c) => s + c.count, 0) -
      data.error_heatmap
        .filter((c) => c.outcome === a)
        .reduce((s, c) => s + c.count, 0),
  );
  const heatCells = outcomes.flatMap((outcome) =>
    data.conditions.map((condition) => ({
      row: outcome,
      column: condition.key,
      value: data.error_heatmap
        .filter((c) => c.outcome === outcome && c.condition === condition.key)
        .reduce((s, c) => s + c.count, 0),
    })),
  );
  const heatMax = Math.max(...heatCells.map((c) => c.value), 1);

  return (
    <>
      <PageHeader
        eyebrow={route.group ?? undefined}
        title={route.title}
        blurb={route.blurb}
        status={
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">{int(data.cases)} cases</Badge>
            <Badge>{int(data.calls)} calls</Badge>
            <Badge>{usd(data.total_cost_usd)} spent</Badge>
            <Badge tone="positive">Reproducible from one command</Badge>
          </div>
        }
      />

      <Container wide className="space-y-16 py-14">
        <section>
          <StatRow>
            <StatTile
              label="What the layer is worth"
              value={`+${(minGain * 100).toFixed(0)}–${(maxGain * 100).toFixed(0)} pts`}
              detail="Accuracy gain from the semantic layer over a bare schema, on the same cases, for every model tested"
              hero
            />
            <StatTile
              label="Best configuration"
              value={pct(best.rate_lenient.point)}
              detail={`${best.model_label} on the production prompt, ${pct(best.rate_lenient.low)} – ${pct(best.rate_lenient.high)}`}
            />
            <StatTile
              label="What examples added"
              value="~0 pts"
              detail="Few-shot examples on top of the layer changed nothing on two models and hurt the third"
            />
            <StatTile
              label="Cost of the cheapest"
              value={`$${layerRows[layerRows.length - 1].cost_per_query.toFixed(4)}`}
              detail={`${layerRows[layerRows.length - 1].model_label} per question, at the top of the accuracy range`}
            />
          </StatRow>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">01</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              What the semantic layer is worth
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              This is the number the rest of the site is an argument for. Every
              model saw the same {int(data.cases)} questions three times: once
              with nothing but table and column names, once with the published
              semantic layer, and once with the layer plus worked examples.
              Because the cases are identical across conditions, the comparison
              is paired — McNemar&rsquo;s exact test on the questions where the
              two conditions disagreed, and a paired bootstrap for the interval.
            </p>
            <p className="mt-4 leading-relaxed text-ink-muted">
              The layer is worth{" "}
              <span className="text-ink">
                between {(minGain * 100).toFixed(1)} and {(maxGain * 100).toFixed(1)} accuracy points
              </span>
              , and the effect is significant for every model. Encoding what the
              business words mean is worth more than the difference between the
              cheapest model and the most expensive one.
            </p>
          </div>

          <Figure
            title="Accuracy by model and prompt condition"
            subtitle="Dot is the point estimate, whisker the 95% Wilson interval. Scored leniently — the strict figures and the difference between them are in section 02."
            note={`Every interval here is roughly ${((layerRows[0].rate_lenient.high - layerRows[0].rate_lenient.low) * 100).toFixed(0)} points wide, which is what ${int(data.cases)} cases buys. That is wide enough to separate the prompt conditions and not wide enough to separate the models — a distinction the point estimates alone would hide.`}
            table={{
              columns: ["Model", "Condition", "Strict", "Lenient", "95% low", "95% high", "$/query"],
              rows: data.accuracy.map((a) => [
                a.model_label,
                a.condition_label,
                pct(a.rate.point),
                pct(a.rate_lenient.point),
                pct(a.rate_lenient.low),
                pct(a.rate_lenient.high),
                `$${a.cost_per_query.toFixed(4)}`,
              ]),
            }}
          >
            <IntervalPlot
              rows={data.accuracy.map((a) => ({
                key: `${a.model}-${a.condition}`,
                label: `${a.model_label.replace("Claude ", "")} · ${a.condition_label}`,
                point: a.rate_lenient.point,
                low: a.rate_lenient.low,
                high: a.rate_lenient.high,
                n: a.rate_lenient.n,
                detail: [
                  { label: "Strict", value: pct(a.rate.point) },
                  { label: "False refusals", value: int(a.false_refusals) },
                  { label: "Cost/query", value: `$${a.cost_per_query.toFixed(4)}` },
                ],
              }))}
              labelWidth={210}
            />
          </Figure>

          <div className="grid gap-4 lg:grid-cols-2">
            <DifferenceTable
              title="Semantic layer vs bare schema"
              subtitle="Paired on the same cases. Positive means the layer won."
              rows={layerVsBare.map((a) => ({
                label: a.model_label,
                strict: a.strict as Comparison,
                lenient: a.lenient as Comparison,
              }))}
            />
            <DifferenceTable
              title="Adding worked examples to the layer"
              subtitle="The reflex when a model underperforms. It did nothing here."
              rows={fewShot.map((a) => ({
                label: a.model_label,
                strict: a.strict as Comparison,
                lenient: a.lenient as Comparison,
              }))}
              note="Five worked examples, none drawn from the benchmark cases — reusing a test question as a demonstration would leak the answer. Two models were unchanged and the third got worse. Not every prompt technique earns its tokens, and the only way to know is to measure."
            />
          </div>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">02</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              The first version of this benchmark was wrong
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Scored strictly, this benchmark said Claude Opus 5 was{" "}
              <span className="text-ink">16.7 points worse</span> than Sonnet 5
              (p=0.0075) and 20.8 points worse than Haiku 4.5 (p=0.0007). A more
              capable model losing badly to two cheaper ones is not a result to
              publish. It is a reason to check the harness.
            </p>
            <p className="mt-4 leading-relaxed text-ink-muted">
              The harness was at fault. Opus&rsquo;s most common failure was
              returning the right answer with{" "}
              <span className="text-ink">extra supporting columns beside it</span> —
              a win rate together with the deal count it was computed from, a
              share together with its numerator and denominator. Thirteen of its
              thirty failures under the production prompt were that. Sonnet did
              it twice; Haiku never. Nothing in the prompt said &ldquo;return
              only the columns asked for&rdquo;, so penalising it was measuring
              obedience to a rule that was never stated.
            </p>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Scoring now runs both ways. Strict requires the exact column set.
              Lenient accepts any projection of the returned columns that
              reproduces the gold result with matching row counts — extra columns
              forgiven, extra rows never. Under lenient scoring the model gap
              disappears entirely.
            </p>
          </div>

          <Panel>
            <PanelHeader
              title="Model comparison on the production prompt"
              meta={<span>Paired, same cases, McNemar exact</span>}
            />
            <div className="scroll-panel overflow-x-auto">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="bg-surface-2">
                  <tr>
                    {["Comparison", "Strict", "p", "Lenient", "p", "Verdict"].map((c, i) => (
                      <th
                        // Two columns are both labelled "p" — the key has to be
                        // positional, not the label.
                        key={`${i}-${c}`}
                        scope="col"
                        className={cn(
                          "whitespace-nowrap border-b border-border px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.06em] text-ink-subtle",
                          i > 0 && i < 5 && "text-right",
                        )}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.model_comparison.map((row) => {
                    const strict = row.strict as Comparison;
                    const lenient = row.lenient as Comparison;
                    return (
                      <tr key={`${row.a}-${row.b}`} className="border-b border-border/50 last:border-0">
                        <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
                          {row.a_label.replace("Claude ", "")} vs{" "}
                          {row.b_label.replace("Claude ", "")}
                        </td>
                        <td className={cn("tnum px-4 py-2.5 text-right font-mono", strict.significant ? "text-negative" : "text-ink")}>
                          {strict.difference >= 0 ? "+" : ""}
                          {pct(strict.difference)}
                        </td>
                        <td className="tnum px-4 py-2.5 text-right font-mono text-ink-subtle">
                          {strict.p_value.toFixed(4)}
                        </td>
                        <td className={cn("tnum px-4 py-2.5 text-right font-mono", lenient.significant ? "text-negative" : "text-ink")}>
                          {lenient.difference >= 0 ? "+" : ""}
                          {pct(lenient.difference)}
                        </td>
                        <td className="tnum px-4 py-2.5 text-right font-mono text-ink-subtle">
                          {lenient.p_value.toFixed(4)}
                        </td>
                        <td className="px-4 py-2.5 text-ink-muted">
                          {strict.significant && !lenient.significant
                            ? "Difference was an artefact of scoring"
                            : lenient.significant
                              ? "Real difference"
                              : "Indistinguishable either way"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-border px-5 py-4 text-sm leading-relaxed text-ink-muted">
              Every comparison on this page is published under both scorings.
              Reporting only the flattering one would be the same failure the
              rest of this site argues against — and the version of this page
              that showed only the strict numbers would have been a confident,
              well-presented, wrong conclusion about which model to use.
            </p>
          </Panel>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">03</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              What it costs to be right
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              With the scoring corrected, the three models sit within three
              points of each other on a sample whose intervals are eleven points
              wide. That is the definition of indistinguishable, and it makes the
              decision a cost decision.
            </p>
          </div>
          <Figure
            title="Cost per question against accuracy"
            subtitle="Each point is one model on the production prompt. Amber marks the configuration this site actually runs."
            legend={
              <Legend
                items={[
                  { label: "In production", color: "var(--color-series-1)" },
                  { label: "Measured, not used", color: "var(--color-series-2)" },
                ]}
              />
            }
            note="Choosing the most expensive model here would cost six times as much per question for an accuracy difference this benchmark cannot detect. That is the whole argument for measuring instead of assuming: the intuition that the biggest model must be best is exactly what a 72-case benchmark is for."
            table={{
              columns: ["Model", "Accuracy (lenient)", "Cost/query", "Median latency", "False refusals"],
              rows: layerRows.map((a) => [
                a.model_label,
                pct(a.rate_lenient.point),
                `$${a.cost_per_query.toFixed(4)}`,
                `${(a.median_latency_ms / 1000).toFixed(1)}s`,
                int(a.false_refusals),
              ]),
            }}
          >
            <Scatter
              points={layerRows.map((a) => ({
                key: a.model,
                label: a.model_label.replace("Claude ", ""),
                x: a.cost_per_query,
                y: a.rate_lenient.point,
                frontier: a.model === "haiku",
                detail: [
                  { label: "Strict", value: pct(a.rate.point) },
                  { label: "Latency", value: `${(a.median_latency_ms / 1000).toFixed(1)}s` },
                  { label: "False refusals", value: int(a.false_refusals) },
                ],
              }))}
              xFormat="usd4"
              yFormat="pct"
              xLabel="Cost per question"
              yLabel="Accuracy"
            />
          </Figure>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">04</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              How it fails
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              An accuracy number says how often. The taxonomy says how, which is
              the part you can act on. The failure that matters most is{" "}
              <span className="text-ink">wrong values</span>: SQL that runs,
              returns the right shape, and is wrong. Nothing errors, nothing
              looks broken, and the person asking cannot tell.
            </p>
          </div>
          <Figure
            title="Failures by type and prompt condition"
            subtitle="Counts across all three models. Every cell is a question that was answered wrongly."
            legend={<HeatmapScale max={heatMax} label="failures" />}
            note="The layer does not just reduce the failure count — it changes the mix. Silent wrong-value errors fall furthest, which is the category that most needs to fall, because it is the one a reader cannot catch."
            table={{
              columns: ["Failure", ...data.conditions.map((c) => c.label)],
              rows: outcomes.map((outcome) => [
                OUTCOME_LABELS[outcome] ?? outcome,
                ...data.conditions.map((c) =>
                  int(
                    data.error_heatmap
                      .filter((h) => h.outcome === outcome && h.condition === c.key)
                      .reduce((s, h) => s + h.count, 0),
                  ),
                ),
              ]),
            }}
          >
            <Heatmap
              cells={heatCells}
              rows={outcomes}
              columns={data.conditions.map((c) => c.key)}
              rowLabels={OUTCOME_LABELS}
              columnLabels={Object.fromEntries(
                data.conditions.map((c) => [c.key, c.label]),
              )}
              valueLabel="Failures"
              labelWidth={160}
            />
          </Figure>

          <Figure
            title="Accuracy on the traps"
            subtitle={`${data.by_trap.length / data.conditions.length} kinds of trap, where the schema alone leads to a plausible wrong answer. These are the cases the layer exists to fix.`}
            note="A trap is not a hard question. Every one of these is easy to answer wrongly and easy to answer rightly — the difference is knowing something about the data that its column names do not say."
            table={{
              columns: ["Trap", "Condition", "Accuracy", "95% low", "95% high", "n"],
              rows: data.by_trap.map((t) => [
                TRAP_LABELS[t.trap_kind] ?? t.trap_kind,
                t.condition_label,
                pct(t.rate_lenient.point),
                pct(t.rate_lenient.low),
                pct(t.rate_lenient.high),
                int(t.rate_lenient.n),
              ]),
            }}
          >
            <Heatmap
              cells={data.by_trap.map((t) => ({
                row: t.trap_kind,
                column: t.condition,
                value: Math.round(t.rate_lenient.point * 100),
                detail: [
                  { label: "Cases", value: int(t.rate_lenient.n) },
                  {
                    label: "95% interval",
                    value: `${pct(t.rate_lenient.low)} – ${pct(t.rate_lenient.high)}`,
                  },
                ],
              }))}
              rows={[...new Set(data.by_trap.map((t) => t.trap_kind))]}
              columns={data.conditions.map((c) => c.key)}
              rowLabels={TRAP_LABELS}
              columnLabels={Object.fromEntries(
                data.conditions.map((c) => [c.key, c.label]),
              )}
              valueLabel="Accuracy %"
              labelWidth={190}
            />
          </Figure>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">05</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              Does it know when it is wrong?
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Every answer carries a self-reported confidence. If that number is
              calibrated, a person can use it to decide when to check the work.
              If it is not, it is worse than nothing — it is a false signal
              attached to an answer that already looks authoritative.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {data.calibration.map((c) => (
              <Panel key={c.model} className="p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-subtle">
                  {c.model_label}
                </p>
                <dl className="mt-4 space-y-2.5 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Expected calibration error</dt>
                    <dd className="tnum font-mono text-ink">{pct(c.ece)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Brier score</dt>
                    <dd className="tnum font-mono text-ink">{c.brier.toFixed(3)}</dd>
                  </div>
                </dl>
                <ul className="mt-4 space-y-1.5 border-t border-border pt-3">
                  {c.bins
                    .filter((b) => b.n > 0)
                    .map((b) => (
                      <li key={b.low} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="font-mono text-ink-subtle">
                          {pct(b.low, 0)}–{pct(b.high, 0)}
                        </span>
                        <span className="tnum font-mono text-ink-muted">
                          said {b.mean_confidence !== null ? pct(b.mean_confidence, 0) : "—"}, was{" "}
                          <span
                            className={
                              b.accuracy !== null && b.mean_confidence !== null
                                ? b.accuracy < b.mean_confidence - 0.1
                                  ? "text-negative"
                                  : "text-positive"
                                : ""
                            }
                          >
                            {b.accuracy !== null ? pct(b.accuracy, 0) : "—"}
                          </span>{" "}
                          ({b.n})
                        </span>
                      </li>
                    ))}
                </ul>
              </Panel>
            ))}
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">
            Expected calibration error is the average gap between what the model
            claimed and what it delivered, weighted by how many answers fell in
            each band. The Brier score penalises confident errors more than
            hesitant ones. Both are computed on lenient scoring; the code is in{" "}
            <span className="font-mono text-xs text-ink">pipeline/stats.py</span>{" "}
            with known-answer tests.
          </p>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">06</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              Every case, and what happened to it
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              An aggregate that cannot be drilled into is an assertion. Filter to
              any model, condition, or outcome and read the question, the gold
              query, and the SQL the model actually produced.
            </p>
          </div>
          <CaseBrowser />
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">07</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              What this benchmark cannot tell you
            </h2>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                head: `${int(data.cases)} cases is a small benchmark`,
                body: "The intervals are about eleven points wide. That is enough to separate the prompt conditions, which differ by twenty to thirty-six points, and not enough to separate the models, which differ by three. Any claim here that rests on a small difference is a claim this sample cannot support.",
              },
              {
                head: "I wrote the questions and the answers",
                body: "Every case and every gold query is mine. That is a conflict of interest: I chose what to test, and I chose it knowing what the semantic layer covers. An independent case set would be a stronger test, and this one should be read as a demonstration of method rather than an audit.",
              },
              {
                head: "The traps are deliberate",
                body: "Twenty-two of the cases are built around a specific way the schema misleads. That is the point — they are the cases the layer exists to fix — but it also means the layer's measured advantage depends on how many traps a real workload contains.",
              },
              {
                head: "One run, not a distribution",
                body: "Each cell is a single call. These models are not deterministic, so some of the difference between conditions is run-to-run noise rather than a stable property. Repeating the grid would tighten that, and would cost the same again.",
              },
              {
                head: "Every case here is answerable",
                body: "So a refusal is scored as wrong, and the false-refusal counts are real. What this does not measure is whether the model correctly refuses a question it should refuse — that needs a second case set of genuinely unanswerable questions.",
              },
              {
                head: "Execution accuracy is not usefulness",
                body: "A query can match the gold result and still answer a subtly different question from the one asked. Result-set equality is the best automatic proxy available, and it is a proxy.",
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
          <Panel className="mt-4 p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-subtle">
              Reproducing this
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">
              The raw model responses are committed at{" "}
              <span className="font-mono text-xs text-ink">
                pipeline/evals/runs/{data.run_file}
              </span>
              . Scoring is a separate step from running, so every number on this
              page can be recomputed, corrected, and argued with without paying
              for the calls again — which is exactly what happened when the
              scoring bug in section 02 was found.
            </p>
            <p className="mt-3 font-mono text-xs text-ink-subtle">
              python -m pipeline.evals.harness · python -m pipeline.evals.analyze
            </p>
          </Panel>
          <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">
            The system being measured is on{" "}
            <Link href="/ask" className="text-accent hover:underline">
              Ask the data
            </Link>
            , and the validation chain it runs behind is on{" "}
            <Link href="/guardrails" className="text-accent hover:underline">
              Guardrails
            </Link>
            .
          </p>
        </section>
      </Container>
    </>
  );
}

function DifferenceTable({
  title,
  subtitle,
  rows,
  note,
}: {
  title: string;
  subtitle: string;
  rows: Array<{ label: string; strict: Comparison; lenient: Comparison }>;
  note?: string;
}) {
  return (
    <Panel>
      <PanelHeader title={title} meta={<span>95% CI · McNemar p</span>} />
      <p className="px-5 pt-4 text-sm leading-relaxed text-ink-muted">{subtitle}</p>
      <ul className="mt-2 divide-y divide-border">
        {rows.map((row) => (
          <li key={row.label} className="px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-sm text-ink">{row.label.replace("Claude ", "")}</span>
              <span
                className={cn(
                  "tnum font-mono text-sm",
                  row.strict.significant ? "text-accent" : "text-ink-muted",
                )}
              >
                {row.strict.difference >= 0 ? "+" : ""}
                {pct(row.strict.difference)}
              </span>
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-ink-subtle">
              strict [{row.strict.ci_low >= 0 ? "+" : ""}
              {pct(row.strict.ci_low)}, {row.strict.ci_high >= 0 ? "+" : ""}
              {pct(row.strict.ci_high)}] p={row.strict.p_value.toFixed(4)}
              {row.strict.significant ? " ✓" : ""}
              {"  ·  "}
              lenient {row.lenient.difference >= 0 ? "+" : ""}
              {pct(row.lenient.difference)} p={row.lenient.p_value.toFixed(4)}
              {row.lenient.significant ? " ✓" : ""}
            </p>
            <p className="mt-1 font-mono text-[11px] text-ink-subtle">
              disagreed on {row.strict.a_only + row.strict.b_only} of {row.strict.n} cases
            </p>
          </li>
        ))}
      </ul>
      {note ? (
        <p className="border-t border-border px-5 py-4 text-sm leading-relaxed text-ink-subtle">
          {note}
        </p>
      ) : null}
    </Panel>
  );
}
