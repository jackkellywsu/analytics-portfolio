import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { StatRow, StatTile } from "@/components/ui/stat-tile";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Figure, Legend } from "@/components/charts/figure";
import { LineChart } from "@/components/charts/line-chart";
import { routeByHref } from "@/lib/routes";
import { int, pct } from "@/lib/format";
import { cn } from "@/lib/cn";
import data from "@/public/data/anomalies.json";

const route = routeByHref("/anomalies")!;

export const metadata: Metadata = {
  title: route.title,
  description: route.blurb,
};

type Note = {
  what_happened: string;
  calendar_context: string;
  hypotheses: string[];
  worth_investigating: boolean;
};

export default function AnomaliesPage() {
  const orders = data.series.find((s) => s.key === "orders")!;
  const leads = data.series.find((s) => s.key === "leads")!;
  const blackFriday = orders.anomalies[0];
  const totalFlagged = data.series.reduce((n, s) => n + s.anomalies.length, 0);
  const totalDays = data.series.reduce((n, s) => n + s.n_days, 0);

  const sensitivity = data.sensitivity.orders;
  const halfDetected = sensitivity.find((s) => s.detection_rate >= 0.5);
  const nearCertain = sensitivity.find((s) => s.detection_rate >= 0.95);

  return (
    <>
      <PageHeader
        eyebrow={route.group ?? undefined}
        title={route.title}
        blurb={route.blurb}
        status={
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">{int(totalDays)} days scanned</Badge>
            <Badge>{int(totalFlagged)} flagged</Badge>
            <Badge tone="positive">Validated by injection</Badge>
          </div>
        }
      />

      <Container wide className="space-y-16 py-14">
        <section>
          <StatRow>
            <StatTile
              label="Largest anomaly found"
              value={`${blackFriday.z.toFixed(0)}σ`}
              detail={`${blackFriday.date} — ${int(blackFriday.observed)} orders against an expected ${blackFriday.expected.toFixed(0)}. The detector had no calendar; this is Black Friday.`}
              hero
            />
            <StatTile
              label="Detector sensitivity"
              value={`${halfDetected ? halfDetected.magnitude : "—"}σ`}
              detail={`The event size at which more than half of injected anomalies are recovered. Below ${sensitivity[1].magnitude}σ, nothing is found at all.`}
            />
            <StatTile
              label="Near-certain detection"
              value={`${nearCertain ? nearCertain.magnitude : "—"}σ`}
              detail={`${nearCertain ? pct(nearCertain.detection_rate, 0) : "—"} of injected events this size are recovered`}
            />
            <StatTile
              label="Flag rate"
              value={pct(totalFlagged / totalDays, 1)}
              detail={`${int(totalFlagged)} days out of ${int(totalDays)} across both series — sparse enough that a human could read every one`}
            />
          </StatRow>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">01</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              A detector that found a real event
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              The hardest thing about anomaly detection is knowing whether it
              works. There are no labelled anomalies in this data, so there is no
              recall to quote and no way to be graded. What there is, in the
              order series, is one externally verifiable event: the detector
              flagged{" "}
              <span className="font-mono text-ink">{blackFriday.date}</span> at{" "}
              <span className="text-ink">{blackFriday.z.toFixed(1)} robust standard deviations</span>
              , with {int(blackFriday.observed)} orders against an expected{" "}
              {blackFriday.expected.toFixed(0)}. That is Black Friday, and it
              caught the three-day tail after it as well.
            </p>
            <p className="mt-4 leading-relaxed text-ink-muted">
              It also flagged{" "}
              <span className="font-mono text-ink">2018-01-01</span> as a drop.
              Nothing in the method knows what a holiday is — the series is
              decomposed into trend and day-of-week seasonality, and what is left
              over is scored. Recovering two calendar events from residuals alone
              is not proof the detector is good, but it is the strongest evidence
              available without labels.
            </p>
          </div>

          <Figure
            title="Orders per day, with flagged days marked"
            subtitle="Solid line is observed. Dashed is what the trend and weekly seasonality predicted. Marks are days whose residual exceeded 3.5 robust standard deviations."
            legend={
              <Legend
                items={[
                  { label: "Observed", color: "var(--color-series-1)" },
                  { label: "Expected", color: "var(--color-series-2)" },
                  { label: "Flagged", color: "var(--color-negative)" },
                ]}
              />
            }
            note="A mean and a standard deviation would have struggled here. Black Friday alone is large enough to inflate the standard deviation of the whole series, raising the threshold and helping the spike hide inside it. The median absolute deviation is unmoved by it, which is why the method uses one."
            table={{
              columns: ["Date", "Weekday", "Observed", "Expected", "z", "Direction"],
              rows: orders.anomalies.map((a) => [
                a.date,
                a.weekday,
                int(a.observed),
                a.expected.toFixed(1),
                a.z.toFixed(1),
                a.direction,
              ]),
            }}
          >
            <LineChart
              labels={orders.dates}
              series={[
                {
                  key: "observed",
                  label: "Observed",
                  values: orders.values,
                  color: "var(--color-series-1)",
                },
                {
                  key: "expected",
                  label: "Expected",
                  values: orders.expected,
                  color: "var(--color-series-2)",
                  dashed: true,
                },
              ]}
              markers={orders.anomalies.map((a) => ({
                index: orders.dates.indexOf(a.date),
                label: `${a.date} (${a.weekday})`,
                direction: a.direction as "spike" | "drop",
                detail: [
                  { label: "Expected", value: a.expected.toFixed(1) },
                  { label: "z", value: a.z.toFixed(1) },
                ],
              }))}
              format="int"
              height={320}
            />
          </Figure>

          <Figure
            title="Marketing-qualified leads per day"
            subtitle="The same method on a shorter, noisier series. Fewer events clear the threshold, and none correspond to anything externally verifiable."
            legend={
              <Legend
                items={[
                  { label: "Observed", color: "var(--color-series-1)" },
                  { label: "Expected", color: "var(--color-series-2)" },
                  { label: "Flagged", color: "var(--color-negative)" },
                ]}
              />
            }
            note="Worth saying plainly: on this series the detector produces flags nobody can confirm. That is the normal case. The order series is unusual in containing an event a reader can check independently, and it would be misleading to present the lead flags with the same confidence."
            table={{
              columns: ["Date", "Weekday", "Observed", "Expected", "z", "Direction"],
              rows: leads.anomalies.map((a) => [
                a.date,
                a.weekday,
                int(a.observed),
                a.expected.toFixed(1),
                a.z.toFixed(1),
                a.direction,
              ]),
            }}
          >
            <LineChart
              labels={leads.dates}
              series={[
                {
                  key: "observed",
                  label: "Observed",
                  values: leads.values,
                  color: "var(--color-series-1)",
                },
                {
                  key: "expected",
                  label: "Expected",
                  values: leads.expected,
                  color: "var(--color-series-2)",
                  dashed: true,
                },
              ]}
              markers={leads.anomalies.map((a) => ({
                index: leads.dates.indexOf(a.date),
                label: `${a.date} (${a.weekday})`,
                direction: a.direction as "spike" | "drop",
                detail: [
                  { label: "Expected", value: a.expected.toFixed(1) },
                  { label: "z", value: a.z.toFixed(1) },
                ],
              }))}
              format="int"
              height={280}
            />
          </Figure>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">02</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              What it would miss
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Without labels there is no recall, so recall is manufactured: a
              spike of known size is injected into the real series at a random
              quiet day, the detector is re-run, and the share recovered is the
              detection rate at that size. Two hundred injections per size, on
              days that were not already flagged.
            </p>
            <p className="mt-4 leading-relaxed text-ink-muted">
              The answer is uncomfortable and worth publishing.{" "}
              <span className="text-ink">
                Anything under {sensitivity[1].magnitude} standard deviations is
                invisible
              </span>{" "}
              — not unlikely to be found, but never found. A real business event
              of that size would pass through this detector without a trace, and
              anyone relying on it should know that before they rely on it.
            </p>
          </div>

          <Figure
            title="Share of injected anomalies recovered, by size"
            subtitle="Two hundred injections at each magnitude, on the orders and leads series separately."
            legend={
              <Legend
                items={[
                  { label: "Orders", color: "var(--color-series-1)" },
                  { label: "Leads", color: "var(--color-series-2)" },
                ]}
              />
            }
            note="The curve is the detector's honest specification. A threshold that catches everything would flag half the calendar; this one is tuned to produce a list a person can actually read, and the cost of that is everything below four sigma."
            table={{
              columns: ["Size (σ)", "Orders detected", "Leads detected", "Trials each"],
              rows: sensitivity.map((s, i) => [
                s.magnitude.toFixed(1),
                pct(s.detection_rate, 0),
                pct(data.sensitivity.leads[i].detection_rate, 0),
                int(s.trials),
              ]),
            }}
          >
            <LineChart
              labels={sensitivity.map((s) => `${s.magnitude}σ`)}
              series={[
                {
                  key: "orders",
                  label: "Orders",
                  values: sensitivity.map((s) => s.detection_rate),
                  color: "var(--color-series-1)",
                },
                {
                  key: "leads",
                  label: "Leads",
                  values: data.sensitivity.leads.map((s) => s.detection_rate),
                  color: "var(--color-series-2)",
                },
              ]}
              format="pct"
              formatAxis="pct0"
              height={260}
              labelEvery={1}
            />
          </Figure>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">03</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              Written up, with the guessing labelled
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              A detector says a day is unusual. It cannot say why, and neither
              can a language model — it has no access to the marketing calendar
              or the incident log. So the annotation tool forces the separation:
              one field may only restate the figures, one may name a widely known
              date, and the guesses go in a list that is displayed as guesses.
            </p>
            <p className="mt-4 leading-relaxed text-ink-muted">
              A model that blends those into one confident paragraph is what
              makes automated anomaly commentary untrustworthy in practice. Note
              that on the lead spikes it returned{" "}
              <span className="font-mono text-ink">none identified</span> rather
              than inventing an event — which is the behaviour worth having.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {data.series.flatMap((series) =>
              series.anomalies
                .filter((a) => "note" in a && a.note)
                .slice(0, 4)
                .map((a) => {
                  const note = a.note as Note;
                  return (
                    <Panel key={`${series.key}-${a.date}`}>
                      <PanelHeader
                        title={`${a.date} · ${series.key}`}
                        meta={
                          <span
                            className={
                              a.direction === "drop" ? "text-info" : "text-negative"
                            }
                          >
                            {a.z > 0 ? "+" : ""}
                            {a.z.toFixed(1)}σ {a.direction}
                          </span>
                        }
                      />
                      <div className="space-y-4 px-5 py-4">
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-positive">
                            What the data shows
                          </p>
                          <p className="mt-1.5 text-sm leading-relaxed text-ink">
                            {note.what_happened}
                          </p>
                        </div>
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
                            Calendar
                          </p>
                          <p
                            className={cn(
                              "mt-1.5 text-sm leading-relaxed",
                              note.calendar_context
                                .toLowerCase()
                                .startsWith("none")
                                ? "text-ink-subtle"
                                : "text-ink-muted",
                            )}
                          >
                            {note.calendar_context}
                          </p>
                        </div>
                        {note.hypotheses.length > 0 ? (
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-caution">
                              Untested guesses
                            </p>
                            <ul className="mt-1.5 space-y-1.5">
                              {note.hypotheses.map((h, i) => (
                                <li
                                  key={i}
                                  className="flex gap-2.5 text-sm leading-relaxed text-ink-muted"
                                >
                                  <span className="mt-2 h-px w-3 shrink-0 bg-caution/50" />
                                  <span>{h}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    </Panel>
                  );
                }),
            )}
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-ink-subtle">
            Written by {data.narratives?.model ?? "a small model"} for $
            {data.narratives?.cost_usd?.toFixed(4) ?? "0"} across{" "}
            {data.narratives?.annotated ?? 0} anomalies. The hypotheses are the
            model&rsquo;s, are untested, and several are almost certainly wrong —
            they are shown because a labelled guess is useful and an unlabelled
            one is dangerous.
          </p>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">04</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              The method, and where it breaks
            </h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <ul className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  head: "Robust scale, not standard deviation",
                  body: "The standard deviation is computed from the outliers it is meant to find. One Black Friday inflates it, which raises the threshold, which helps the spike hide. The median absolute deviation has a 50% breakdown point — half the series would have to be anomalous before it is fooled.",
                },
                {
                  head: "Seasonality removed before scoring",
                  body: "A busy Monday is not an anomaly. Day-of-week effects are subtracted as medians, so one unusual Tuesday cannot define what Tuesdays look like.",
                },
                {
                  head: "Point anomalies only",
                  body: "This finds days that stand out from their neighbours. It cannot find a gradual drift, a level shift that persists, or a change in variance — all of which matter more in practice than a single loud day.",
                },
                {
                  head: "The multi-day tail is double-counted",
                  body: "Black Friday and the three days after it are flagged as four separate anomalies. They are one event. Collapsing runs into episodes would be the next thing to build.",
                },
                {
                  head: "No ground truth",
                  body: "The injection test measures whether the detector can find something it was given. It cannot measure false positives against reality, because nobody labelled which of these days were genuinely unusual for a business reason.",
                },
                {
                  head: "Threshold is a judgment",
                  body: `3.5 sigma was chosen to produce a list short enough to read — ${int(totalFlagged)} days out of ${int(totalDays)}. A lower threshold finds more and flags more noise. There is no correct answer, only a stated one.`,
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
            <Panel className="h-fit">
              <PanelHeader title="Parameters" />
              <dl className="divide-y divide-border text-sm">
                {[
                  ["Trend", `${data.method.trend_window_days}-day centred rolling median`],
                  ["Seasonality", "Day-of-week median of the detrended series"],
                  ["Scale", "Median absolute deviation × 1.4826"],
                  ["Threshold", `${data.method.threshold_sigma}σ`],
                  ["Validation", `${int(sensitivity[0].trials)} injections per size`],
                ].map(([k, v]) => (
                  <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[6rem_1fr] sm:gap-4">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-subtle">
                      {k}
                    </dt>
                    <dd className="text-xs leading-relaxed text-ink-muted">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="border-t border-border px-4 py-3 text-xs leading-relaxed text-ink-subtle">
                Implemented in{" "}
                <span className="font-mono text-ink">pipeline/build_anomalies.py</span>{" "}
                over the same tables you can query on{" "}
                <Link href="/methods" className="text-accent hover:underline">
                  Methods
                </Link>
                .
              </p>
            </Panel>
          </div>
        </section>
      </Container>
    </>
  );
}
