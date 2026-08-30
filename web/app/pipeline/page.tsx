import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { StatRow, StatTile } from "@/components/ui/stat-tile";
import { Figure } from "@/components/charts/figure";
import { IntervalPlot } from "@/components/charts/interval-plot";
import { ColumnChart } from "@/components/charts/column-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { ProvenanceBlock } from "@/components/ui/provenance-block";
import { routeByHref } from "@/lib/routes";
import { manifest } from "@/lib/manifest";
import { days, int, label, monthLabel, pct, usd } from "@/lib/format";
import data from "@/public/data/pipeline.json";

const route = routeByHref("/pipeline")!;

export const metadata: Metadata = {
  title: route.title,
  description: route.blurb,
};

export default function PipelinePage() {
  const h = data.headline;
  const source = manifest.sources.find((s) => s.key === "crm_pipeline")!;

  return (
    <>
      <PageHeader
        eyebrow={route.group ?? undefined}
        title={route.title}
        blurb={route.blurb}
        status={
          <div className="flex flex-wrap gap-2">
            <Badge tone="caution">Synthetic source — stated on every figure</Badge>
            <Badge>2017 · {int(h.closed_deals + h.open_deals)} opportunities</Badge>
          </div>
        }
      />

      <Container wide className="space-y-16 py-14">
        <section>
          <StatRow>
            <StatTile
              label="Booked value"
              value={usd(h.won_value, true)}
              detail={`${int(h.won_deals)} won deals, median ${usd(h.median_won_value)}`}
              hero
            />
            <StatTile
              label="Win rate"
              value={pct(h.win_rate.point)}
              detail={`95% interval ${pct(h.win_rate.low)} – ${pct(h.win_rate.high)} across ${int(h.closed_deals)} closed deals`}
            />
            <StatTile
              label="Median cycle"
              value={days(h.median_cycle_days)}
              detail="Engagement to close, won deals only"
            />
            <StatTile
              label="Open pipeline"
              value={usd(h.open_pipeline_list_value, true)}
              detail={`${int(h.open_deals)} open deals valued at list price — open deals carry no value in the source`}
            />
          </StatRow>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">01</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              The ranking that isn&rsquo;t there
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Sort sectors by win rate and you get a league table: marketing on
              top at {pct(data.by_sector[0].rate.point)}, the weakest sector
              nearly {pct(data.by_sector[0].rate.point - data.by_sector[data.by_sector.length - 1].rate.point, 0)}{" "}
              behind. A dashboard that stops there sends the team after the top of
              the list. Put a confidence interval on each estimate and the
              ranking dissolves — every sector overlaps the overall rate, and
              almost every sector overlaps every other.
            </p>
          </div>

          <Figure
            title="Win rate by client sector, with 95% confidence intervals"
            subtitle="Each dot is a point estimate; each whisker is the Wilson score interval. The vertical line is the pooled rate across all closed deals."
            note={
              <>
                This is the finding, not a caveat on one. With this much data,
                sector is not a usable signal for prioritisation, and any
                difference visible in the point estimates is inside the range
                you would expect from sampling alone. Acting on the ranking
                would mean redirecting a sales team on noise. The honest read is
                that the answer to &ldquo;which sector converts best&rdquo; is
                &ldquo;the data cannot tell you&rdquo; — and that is a finding a
                stakeholder can act on, because it redirects the question toward
                variables that do separate.
              </>
            }
            table={{
              columns: ["Sector", "Closed", "Win rate", "95% low", "95% high", "Booked"],
              rows: data.by_sector.map((s) => [
                label(s.sector),
                int(s.rate.n),
                pct(s.rate.point),
                pct(s.rate.low),
                pct(s.rate.high),
                usd(s.won_value, true),
              ]),
            }}
          >
            <IntervalPlot
              rows={data.by_sector.map((s) => ({
                key: s.sector,
                label: label(s.sector),
                point: s.rate.point,
                low: s.rate.low,
                high: s.rate.high,
                n: s.rate.n,
                detail: [{ label: "Booked", value: usd(s.won_value, true) }],
              }))}
              reference={{
                value: data.pooled_win_rate.point,
                label: `Pooled ${pct(data.pooled_win_rate.point)}`,
              }}
            />
          </Figure>

          <div className="grid gap-4 lg:grid-cols-2">
            <Figure
              title="Win rate by product series"
              subtitle="The same test applied to products. GTK carries a wide interval because only a handful of its deals ever closed."
              table={{
                columns: ["Series", "Closed", "Win rate", "95% low", "95% high"],
                rows: data.by_series.map((s) => [
                  s.series,
                  int(s.rate.n),
                  pct(s.rate.point),
                  pct(s.rate.low),
                  pct(s.rate.high),
                ]),
              }}
            >
              <IntervalPlot
                rows={data.by_series.map((s) => ({
                  key: s.series,
                  label: s.series,
                  point: s.rate.point,
                  low: s.rate.low,
                  high: s.rate.high,
                  n: s.rate.n,
                }))}
                reference={{
                  value: data.pooled_win_rate.point,
                  label: `Pooled ${pct(data.pooled_win_rate.point)}`,
                }}
                labelWidth={72}
              />
            </Figure>

            <Figure
              title="Win rate by manager"
              subtitle="Six managers, ranked by booked value. The intervals are what stop a quarterly review from turning into a ranking exercise."
              table={{
                columns: ["Manager", "Office", "Closed", "Win rate", "Booked"],
                rows: data.by_manager.map((m) => [
                  m.manager,
                  m.office,
                  int(m.rate.n),
                  pct(m.rate.point),
                  usd(m.won_value, true),
                ]),
              }}
            >
              <IntervalPlot
                rows={data.by_manager.map((m) => ({
                  key: m.manager,
                  label: m.manager,
                  point: m.rate.point,
                  low: m.rate.low,
                  high: m.rate.high,
                  n: m.rate.n,
                  detail: [
                    { label: "Office", value: m.office },
                    { label: "Booked", value: usd(m.won_value, true) },
                  ],
                }))}
                reference={{
                  value: data.pooled_win_rate.point,
                  label: `Pooled ${pct(data.pooled_win_rate.point)}`,
                }}
                labelWidth={112}
              />
            </Figure>
          </div>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">02</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              The losses that cost something
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Cycle time is usually reported for wins only. Lost deals carry a
              close date too, and measuring them changes the question from
              &ldquo;how often do we lose&rdquo; to &ldquo;what does losing
              cost.&rdquo; Counting losses treats a deal lost in a week the same
              as one lost after four months. Counting <em>deal-days</em> does
              not.
            </p>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Both distributions are bimodal: {pct(data.cycle.Lost.share_under_20d, 0)}{" "}
              of losses are settled inside twenty days, and those are cheap. The
              cost sits in the tail. The{" "}
              {pct(data.time_cost.slow_loss_share_of_losses, 0)} of losses that
              run past {data.time_cost.slow_threshold_days} days consume{" "}
              {pct(data.time_cost.slow_loss_share_of_lost_days, 0)} of all time
              spent on deals that never closed — {int(data.time_cost.slow_loss_count)}{" "}
              opportunities and {int(data.time_cost.slow_loss_days)} deal-days
              that produced nothing. Overall,{" "}
              {pct(data.time_cost.lost_share_of_all_days, 0)} of every day the
              team spent in the pipeline went to a deal it lost.
            </p>
            <p className="mt-4 leading-relaxed text-ink-muted">
              That reframes the intervention. Improving the win rate is hard;
              qualifying out of the slow-loss tail earlier is a process change,
              and this is the chart that would justify making it.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {(["Won", "Lost"] as const).map((outcome) => {
              const c = data.cycle[outcome];
              return (
                <Figure
                  key={outcome}
                  title={`Cycle length — ${outcome.toLowerCase()} deals`}
                  subtitle={`Median ${days(c.summary.median)}, 90th percentile ${days(c.summary.p90)}, across ${int(c.summary.n)} deals. ${pct(c.share_under_20d, 0)} settle inside 20 days; ${pct(c.share_over_60d, 0)} run past 60.`}
                  table={{
                    columns: ["Days", "Deals"],
                    rows: c.histogram.map((b) => [
                      b.overflow ? `${b.start}+` : `${b.start}–${b.end}`,
                      int(b.count),
                    ]),
                  }}
                >
                  <ColumnChart
                    data={c.histogram.map((b, i) => ({
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
                    labelEvery={3}
                    height={220}
                  />
                </Figure>
              );
            })}
          </div>

          <Figure
            title="Closed deals and booked value by month"
            subtitle="Columns are booked value. The source covers a single year, so there is no prior period to compare against and no seasonality to read."
            note="A trend line drawn through twelve months of one year would imply a pattern this data cannot support. The columns are shown as levels, not as a trend."
            table={{
              columns: ["Month", "Closed", "Won", "Win rate", "Booked"],
              rows: data.monthly.map((m) => [
                monthLabel(m.month),
                int(m.closed),
                int(m.won),
                pct(m.rate.point),
                usd(m.won_value),
              ]),
            }}
          >
            <ColumnChart
              data={data.monthly.map((m) => ({
                key: m.month,
                label: monthLabel(m.month),
                value: m.won_value,
                detail: [
                  { label: "Closed", value: int(m.closed) },
                  { label: "Won", value: int(m.won) },
                  { label: "Win rate", value: pct(m.rate.point) },
                ],
              }))}
              format="usd"
              formatAxis="usdCompact"
              height={240}
            />
          </Figure>
        </section>

        <section className="space-y-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-accent">03</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              Where the value sits
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Seven products across three series. The top product closes at more
              than twenty times the price of the entry tier, which means a win-count
              target and a revenue target point a sales team in different
              directions.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Figure
              title="Booked value by manager"
              subtitle="Ranked. Direct-labelled at the tip, so no value axis is needed."
              table={{
                columns: ["Manager", "Office", "Agents", "Booked"],
                rows: data.by_manager.map((m) => [
                  m.manager,
                  m.office,
                  int(m.agents),
                  usd(m.won_value),
                ]),
              }}
            >
              <BarChart
                data={data.by_manager.map((m) => ({
                  key: m.manager,
                  label: m.manager,
                  value: m.won_value,
                  detail: [
                    { label: "Office", value: m.office },
                    { label: "Agents", value: int(m.agents) },
                    { label: "Win rate", value: pct(m.rate.point) },
                  ],
                }))}
                format="usdCompact"
                labelWidth={112}
              />
            </Figure>

            <Figure
              title="Median close value against list price"
              subtitle="Every product closes below list. The gap is the discount a rep gave away to win."
              table={{
                columns: ["Product", "Series", "List", "Median close", "Discount", "Won"],
                rows: data.by_product.map((p) => [
                  p.product,
                  p.series,
                  usd(p.list_price),
                  p.summary.median ? usd(p.summary.median) : "—",
                  p.discount_vs_list !== null ? pct(p.discount_vs_list) : "—",
                  int(p.won),
                ]),
              }}
              note="Discount is the gap between list price and the median won deal. It is a property of this synthetic generator rather than a market finding, and it is shown because the comparison is the right one to make, not because the number means anything about real pricing."
            >
              <BarChart
                data={data.by_product.map((p) => ({
                  key: p.product,
                  label: p.product,
                  value: p.discount_vs_list ?? 0,
                  detail: [
                    { label: "List", value: usd(p.list_price) },
                    {
                      label: "Median close",
                      value: p.summary.median ? usd(p.summary.median) : "—",
                    },
                    { label: "Won deals", value: int(p.won) },
                  ],
                }))}
                format="pct"
                labelWidth={118}
                valueWidth={64}
              />
            </Figure>
          </div>
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
                  head: "The source is synthetic",
                  body: "Maven Analytics published this as a teaching dataset for a fictitious hardware vendor. Nothing here describes a real market. It is used for pipeline shape — stages, cycle length, quota structure — and every figure on this page is a demonstration of method rather than a finding about the world. The uniformity of the sector win rates is itself a tell: real markets are not that even.",
                },
                {
                  head: "One year, so no trend",
                  body: `Opportunities were engaged from ${data.coverage.first_engage} and closed through ${data.coverage.last_close}. There is no prior year, so nothing on this page can distinguish a seasonal pattern from a one-off.`,
                },
                {
                  head: "Open pipeline is imputed",
                  body: "Open deals carry no value at all in the source. The open-pipeline figure prices them at product list price, which is the only defensible estimate available and is almost certainly high — every closed deal in the data landed below list.",
                },
                {
                  head: "A sixth of opportunities have no account",
                  body: "1,425 opportunities name no client account, all of them in open stages. Every account-level and sector-level figure on this page excludes them explicitly rather than silently.",
                },
                {
                  head: "No cost side",
                  body: "Deal values are list-derived revenue with no margin, discount policy, or cost of sale attached. Ranking anything here by value ranks it by revenue, which is not the same as ranking it by what it is worth.",
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
            <ProvenanceBlock
              p={{
                source: source.source,
                url: source.url,
                files: source.files.map(
                  (f) => `${f.name} — ${int(f.rows)} rows`,
                ),
                pulledAt: source.pulled_at,
                records: source.files.reduce((sum, f) => sum + f.rows, 0),
                coverage: `${data.coverage.first_engage} to ${data.coverage.last_close}`,
                gaps: source.gaps,
                nature: source.nature,
              }}
            />
          </div>
        </section>
      </Container>
    </>
  );
}
