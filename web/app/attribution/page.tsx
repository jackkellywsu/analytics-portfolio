import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { StatRow, StatTile } from "@/components/ui/stat-tile";
import { Figure, Legend } from "@/components/charts/figure";
import { ColumnChart } from "@/components/charts/column-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { IntervalPlot } from "@/components/charts/interval-plot";
import { ProspectScorer } from "@/components/prospect-scorer";
import { ProvenanceBlock } from "@/components/ui/provenance-block";
import { routeByHref } from "@/lib/routes";
import { manifest } from "@/lib/manifest";
import { brl, days, int, label, monthLabel, pct } from "@/lib/format";
import data from "@/public/data/attribution.json";

const route = routeByHref("/attribution")!;

export const metadata: Metadata = {
  title: route.title,
  description: route.blurb,
};

function ordinal(n: number): string {
  const names = ["", "largest", "second", "third", "fourth", "fifth", "sixth"];
  return names[n] ?? `${n}th`;
}

export default function AttributionPage() {
  const h = data.headline;
  const rc = data.revenue_concentration;
  const funnelSource = manifest.sources.find((s) => s.key === "olist_funnel")!;
  const commerceSource = manifest.sources.find((s) => s.key === "olist_commerce")!;

  const gap = h.corrected_attachment.point - h.naive_attachment.point;

  // Computed rather than asserted: a hand-written "second largest" in the copy
  // goes stale the moment the data is refreshed.
  const unknown = data.channels.find((c) => c.origin === "unknown");
  const unknownRankBySize =
    [...data.channels].sort((a, b) => b.leads - a.leads).findIndex(
      (c) => c.origin === "unknown",
    ) + 1;

  return (
    <>
      <PageHeader
        eyebrow={route.group ?? undefined}
        title={route.title}
        blurb={route.blurb}
        status={
          <div className="flex flex-wrap gap-2">
            <Badge tone="positive">Real source</Badge>
            <Badge>
              {int(h.leads)} leads · {int(h.deals)} signed clients
            </Badge>
          </div>
        }
      />

      <Container wide className="space-y-16 py-14">
        <section>
          <StatRow>
            <StatTile
              label="Client conversion"
              value={pct(h.conversion.point)}
              detail={`${int(h.deals)} of ${int(h.leads)} qualified leads signed, ${pct(h.conversion.low)} – ${pct(h.conversion.high)}`}
              hero
            />
            <StatTile
              label="Revenue attachment"
              value={pct(h.corrected_attachment.point)}
              detail={`Corrected for the observation window. The uncorrected figure is ${pct(h.naive_attachment.point)}.`}
            />
            <StatTile
              label="Median time to close"
              value={days(h.median_days_to_close)}
              detail="First marketing contact to signature"
            />
            <StatTile
              label="Revenue concentration"
              value={pct(rc.top_decile_share, 0)}
              detail={`Share of all attributed revenue produced by the top 10% of the ${int(rc.converting_clients)} clients that generated any`}
            />
          </StatRow>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">01</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              The number that was wrong by six points
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              The obvious question is what share of signed clients ever generated
              revenue. Compute it across all {int(h.deals)} deals and you get{" "}
              {pct(h.naive_attachment.point)}. That figure is wrong, and the way
              it is wrong is the most useful thing on this page.
            </p>
            <p className="mt-4 leading-relaxed text-ink-muted">
              The commerce data stops on{" "}
              <span className="font-mono text-ink">2018-09-03</span>, but deals
              keep closing until{" "}
              <span className="font-mono text-ink">{h.won_window[1]}</span>. A
              client signed in October has no window in which revenue could
              appear — not because it failed, but because nobody was watching yet.
              Those {int(h.censored_deals)} deals enter the denominator and drag
              the rate down. Restricted to the {int(h.complete_deals)} deals with
              a full {h.window_days}-day window, the rate is{" "}
              <span className="text-ink">{pct(h.corrected_attachment.point)}</span>{" "}
              — {pct(gap, 1)} higher, and the difference is entirely an artefact
              of when the data ends.
            </p>
          </div>

          <Figure
            title="Revenue attachment by the month the deal closed"
            subtitle={`Each column is the share of that month's clients that ever generated revenue. Columns are split by whether the client had a full ${h.window_days}-day observation window.`}
            legend={
              <Legend
                items={[
                  { label: `Full ${h.window_days}-day window`, color: "var(--color-series-1)" },
                  { label: "Window truncated", color: "var(--color-series-2)" },
                ]}
              />
            }
            note={
              <>
                The collapse on the right is not a decline in client quality. It
                is the observation window closing. A dashboard reporting a single
                attachment rate over this period would show a falling trend and
                invite someone to go looking for a cause that does not exist.
                Everything downstream on this page uses only the complete-window
                cohorts.
              </>
            }
            table={{
              columns: ["Cohort", "Clients", "With revenue", "Rate", "Median days observed"],
              rows: data.cohorts.map((c) => [
                monthLabel(c.cohort),
                int(c.deals),
                int(c.attached),
                pct(c.rate.point),
                int(c.median_days_observed),
              ]),
            }}
          >
            <ColumnChart
              data={data.cohorts.map((c) => ({
                key: c.cohort,
                label: monthLabel(c.cohort),
                value: c.rate.point,
                emphasis: c.window_complete,
                detail: [
                  { label: "Clients", value: int(c.deals) },
                  { label: "With revenue", value: int(c.attached) },
                  {
                    label: "Median observed",
                    value: `${int(c.median_days_observed)} days`,
                  },
                  {
                    label: "Window",
                    value: c.window_complete ? "Complete" : "Truncated",
                  },
                ],
              }))}
              format="pct"
              formatAxis="pct0"
              height={260}
              emphasisLabel="complete windows"
              baseLabel="truncated windows"
            />
          </Figure>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">02</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              What a lead from each channel is worth
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Channel reporting usually stops at lead volume, which rewards
              whichever channel is cheapest to fill. The question worth asking is
              what a lead is worth once it converts and starts billing. That
              splits into two measurable halves — how often a lead signs, and
              what a signed client produces — and they are measured on different
              populations, because conversion is complete for every lead while
              revenue is only observable for the complete-window cohorts.
            </p>
            <p className="mt-4 leading-relaxed text-ink-muted">
              The result is uncomfortable in a useful way. The highest-value
              channel is{" "}
              <span className="font-mono text-ink">{label(data.channels[0].origin)}</span>{" "}
              at {brl(data.channels[0].revenue_per_lead)} per lead — the bucket
              whose acquisition source was recorded as unidentifiable.{" "}
              {int(unknown?.leads ?? 0)} leads, the{" "}
              {ordinal(unknownRankBySize)}-largest channel in the dataset, and
              the organisation cannot say where any of them came from. The
              finding is not that untracked marketing works; it is that the
              tracking is the problem worth fixing first.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Figure
              title="Revenue per lead by channel"
              subtitle="Conversion rate multiplied by mean 90-day revenue per signed client. Direct-labelled at the tip."
              table={{
                columns: ["Channel", "Leads", "Clients", "Conversion", "Revenue / client", "Revenue / lead"],
                rows: data.channels.map((c) => [
                  label(c.origin),
                  int(c.leads),
                  int(c.deals),
                  pct(c.conversion.point),
                  brl(c.revenue_per_deal),
                  brl(c.revenue_per_lead),
                ]),
              }}
            >
              <BarChart
                data={data.channels.map((c) => ({
                  key: c.origin,
                  label: label(c.origin),
                  value: c.revenue_per_lead,
                  detail: [
                    { label: "Leads", value: int(c.leads) },
                    { label: "Clients", value: int(c.deals) },
                    { label: "Conversion", value: pct(c.conversion.point) },
                    { label: "Revenue / client", value: brl(c.revenue_per_deal) },
                  ],
                }))}
                format="brl"
                labelWidth={128}
                valueWidth={92}
              />
            </Figure>

            <Figure
              title="Conversion rate by channel, with 95% intervals"
              subtitle="Unlike revenue, conversion is measured on every lead, so these intervals reflect real sample size rather than the observation window."
              note="Referral and email look strong on the point estimate and carry the widest intervals — 284 and 493 leads respectively. That is the pattern to distrust when a channel is proposed for more budget."
              table={{
                columns: ["Channel", "Leads", "Clients", "Conversion", "95% low", "95% high"],
                rows: data.channels.map((c) => [
                  label(c.origin),
                  int(c.leads),
                  int(c.deals),
                  pct(c.conversion.point),
                  pct(c.conversion.low),
                  pct(c.conversion.high),
                ]),
              }}
            >
              <IntervalPlot
                rows={[...data.channels]
                  .sort((a, b) => b.conversion.point - a.conversion.point)
                  .map((c) => ({
                    key: c.origin,
                    label: label(c.origin),
                    point: c.conversion.point,
                    low: c.conversion.low,
                    high: c.conversion.high,
                    n: c.conversion.n,
                    detail: [{ label: "Clients", value: int(c.deals) }],
                  }))}
                reference={{
                  value: h.conversion.point,
                  label: `Overall ${pct(h.conversion.point)}`,
                }}
                labelWidth={124}
              />
            </Figure>
          </div>

          <Figure
            title="Time from first contact to signature"
            subtitle={`Median ${days(h.median_days_to_close)}, but the distribution runs long: the 90th percentile is ${days(data.days_to_close.summary.p90)}.`}
            note="A pipeline forecast built on the median would miss the tail entirely. Roughly a tenth of clients take more than half a year from first marketing contact to signature, which is a planning fact rather than a performance problem."
            table={{
              columns: ["Days", "Clients"],
              rows: data.days_to_close.histogram.map((b) => [
                b.overflow ? `${b.start}+` : `${b.start}–${b.end}`,
                int(b.count),
              ]),
            }}
          >
            <ColumnChart
              data={data.days_to_close.histogram.map((b, i) => ({
                key: String(i),
                label: b.overflow ? `${b.start}+` : String(b.start),
                value: b.count,
                detail: [
                  {
                    label: "Range",
                    value: b.overflow
                      ? `${b.start} days and over`
                      : `${b.start}–${b.end} days`,
                  },
                ],
              }))}
              format="deals"
              formatAxis="int"
              height={220}
            />
          </Figure>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">03</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              A prospect score you can argue with
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              This is the part that maps to real business development work:
              given limited attention, which segments deserve it. The score is a
              weighted blend of four measured components, every weight is
              adjustable, and every score decomposes into the bar beneath its
              name. A reviewer who thinks revenue per client should outrank
              volume can move the slider and see what changes.
            </p>
            <p className="mt-4 leading-relaxed text-ink-muted">
              The harder problem is that {int(data.segments.length)} segments
              share {int(h.complete_deals)} clients, and the smallest have a
              handful each. Ranking those on raw rates puts whichever tiny
              segment got lucky at the top — the same mistake the pipeline
              dashboard warns about, one level down. Both estimated components
              are therefore shrunk toward the population, by an amount set by
              each segment&rsquo;s own sample size.
            </p>
            <p className="mt-4 leading-relaxed text-ink-muted">
              The revenue component needed two corrections before shrinkage
              would work at all. It is conditioned on clients that actually
              billed, because whether a client bills is already the conversion
              component and mixing the two double-counts it. And it is shrunk on
              the log scale, because the raw figures are set by a few very large
              clients — the watches segment shows a mean of{" "}
              <span className="font-mono text-ink">
                {brl(data.segments.find((s) => s.segment === "watches")?.revenue_per_converter_raw ?? 0, true)}
              </span>{" "}
              built from two converting clients. Shrunk, it reports{" "}
              <span className="font-mono text-ink">
                {brl(data.segments.find((s) => s.segment === "watches")?.revenue_per_converter_shrunk ?? 0)}
              </span>
              . Both numbers are in the table; the raw one is shown in
              parentheses wherever shrinkage moved it materially.
            </p>
          </div>

          <ProspectScorer segments={data.segments} prior={data.prior} />
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">04</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              What this data cannot tell you
            </h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_28rem]">
            <ul className="space-y-4">
              {[
                {
                  head: "There is no cost side, so this is not ROI",
                  body: "Revenue per lead is revenue, not return. Nothing in this data records what any channel cost to run, so a channel that looks strong per lead could still be the worst place to spend the next thousand. Every ranking here is half of the calculation a marketing budget actually needs.",
                },
                {
                  head: "The best channel is a missing value",
                  body: `The 'unknown' bucket is ${int(data.channels.find((c) => c.origin === "unknown")?.leads ?? 0)} leads whose source was never recorded, and it tops the value ranking. It is almost certainly a mixture of real channels rather than one, so its apparent performance is a blend and cannot be acted on directly.`,
                },
                {
                  head: "Attribution is last-touch by construction",
                  body: "A lead carries exactly one origin. Any client who encountered the business more than once before converting has that history collapsed into a single label, which systematically over-credits whichever touch happened to be recorded.",
                },
                {
                  head: "Ninety days is a choice, not a fact",
                  body: `The ${h.window_days}-day window is long enough for a new client to start billing and short enough that most cohorts have a complete one. A different window would produce different numbers; it is stated so a reader can disagree with it rather than discover it later.`,
                },
                {
                  head: "Revenue is heavily concentrated",
                  body: `The top decile of revenue-generating clients accounts for ${pct(rc.top_decile_share, 0)} of the total. Means are therefore misleading throughout, and any segment-level average is dominated by a small number of clients — which is exactly why the score leans on shrinkage rather than raw averages.`,
                },
                {
                  head: "A marketplace, not a professional services firm",
                  body: "This is a Brazilian e-commerce marketplace acquiring sellers between 2017 and 2018. The structure of the question — which acquisition sources produce clients that generate revenue, and where should limited business-development attention go — transfers. The specific numbers do not.",
                },
              ].map((item) => (
                <li key={item.head} className="border-l-2 border-border pl-5">
                  <p className="font-medium text-ink">{item.head}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
            <div className="space-y-4">
              {[funnelSource, commerceSource].map((source) => (
                <ProvenanceBlock
                  key={source.key}
                  p={{
                    source: source.source,
                    url: source.url,
                    files: source.files.map((f) => `${f.name} — ${int(f.rows)} rows`),
                    pulledAt: source.pulled_at,
                    records: source.files.reduce((sum, f) => sum + f.rows, 0),
                    gaps: source.gaps,
                    nature: source.nature,
                  }}
                />
              ))}
            </div>
          </div>
        </section>
      </Container>
    </>
  );
}
