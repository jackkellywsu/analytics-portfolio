import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Container } from "@/components/ui/container";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { ProvenanceBlock } from "@/components/ui/provenance-block";
import { QueryConsole, type PresetQuery } from "@/components/query-console";
import {
  DOMAIN_LABELS,
  formatBytes,
  manifest,
  tablesByDomain,
  type QualityRule,
  type Table,
} from "@/lib/manifest";
import { routeByHref } from "@/lib/routes";

const route = routeByHref("/methods")!;

export const metadata: Metadata = {
  title: route.title,
  description: route.blurb,
};

const PRESETS: PresetQuery[] = [
  {
    label: "Censoring correction",
    note: "Why the headline conversion figure on this data is wrong until you account for the observation window.",
    sql: `-- The commerce data stops before the last deals close, so deals won late
-- have little or no window in which revenue could appear. Reporting one rate
-- across all of them reads as a performance finding when it is an artefact.
SELECT
  CASE WHEN window_complete
       THEN 'Full 90-day window'
       ELSE 'Window truncated' END       AS cohort,
  COUNT(*)                               AS deals,
  ROUND(100.0 * AVG(CASE WHEN ever_sold THEN 1 ELSE 0 END), 1) AS pct_with_revenue
FROM deal_outcomes
GROUP BY 1
ORDER BY deals DESC;`,
  },
  {
    label: "Revenue by channel",
    note: "Acquisition channel joined to the revenue those clients actually generated in their first 90 days.",
    sql: `-- Channels ranked by revenue realised, not by leads delivered.
-- Restricted to deals with a complete observation window.
SELECT origin                     AS channel,
       COUNT(*)                   AS deals,
       ROUND(SUM(revenue_90d))    AS revenue_90d_brl,
       ROUND(AVG(revenue_90d))    AS avg_per_deal
FROM deal_outcomes
WHERE window_complete
GROUP BY 1
ORDER BY revenue_90d_brl DESC;`,
  },
  {
    label: "Win rate by sector",
    note: "A three-table join across opportunities and accounts.",
    sql: `SELECT a.sector,
       COUNT(*)                                                  AS closed_deals,
       ROUND(100.0 * AVG(CASE WHEN o.is_won THEN 1 ELSE 0 END), 1) AS win_rate_pct,
       ROUND(AVG(CASE WHEN o.is_won THEN o.close_value END))      AS avg_won_value
FROM crm_opportunities o
JOIN crm_accounts a ON a.account = o.account
WHERE o.is_closed
GROUP BY 1
ORDER BY win_rate_pct DESC;`,
  },
  {
    label: "Sales cycle",
    note: "Median and 90th-percentile cycle length by product series.",
    sql: `-- Medians and tails, not averages: cycle time is skewed, and the deals
-- that hurt are in the tail.
SELECT p.series,
       COUNT(*)                                  AS won_deals,
       MEDIAN(o.cycle_days)                      AS median_cycle_days,
       ROUND(QUANTILE_CONT(o.cycle_days, 0.9))   AS p90_cycle_days
FROM crm_opportunities o
JOIN crm_products p ON p.product = o.product
WHERE o.is_won AND o.cycle_days IS NOT NULL
GROUP BY 1
ORDER BY median_cycle_days;`,
  },
  {
    label: "Delivery SLA (200k rows)",
    note: "Joins 99k orders to 99k customers and aggregates, to show what the in-browser engine can do.",
    sql: `-- Two 99,000-row tables joined and aggregated in the browser.
SELECT c.customer_state AS state,
       COUNT(*)         AS delivered_orders,
       ROUND(AVG(DATE_DIFF('day', o.order_purchase_timestamp,
                                  o.order_delivered_customer_date)), 1) AS avg_days_to_deliver,
       ROUND(100.0 * AVG(CASE WHEN o.order_delivered_customer_date
                                <= o.order_estimated_delivery_date
                              THEN 1 ELSE 0 END), 1)                    AS pct_on_time
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
WHERE o.order_delivered_customer_date IS NOT NULL
GROUP BY 1
HAVING COUNT(*) >= 500
ORDER BY pct_on_time DESC;`,
  },
];

export default function MethodsPage() {
  const totalRows = manifest.tables.reduce((sum, t) => sum + t.rows, 0);
  const allRules = manifest.tables.flatMap((t) =>
    (t.quality?.rules ?? []).map((rule) => ({ table: t.name, rule })),
  );

  return (
    <>
      <PageHeader
        eyebrow={route.group ?? undefined}
        title={route.title}
        blurb={route.blurb}
        status={
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">{manifest.tables.length} tables</Badge>
            <Badge>{totalRows.toLocaleString("en-US")} rows</Badge>
            <Badge>{formatBytes(manifest.total_bytes)}</Badge>
            <Badge>{allRules.length} cleaning rules</Badge>
          </div>
        }
      />

      <Container wide className="space-y-20 py-16">
        <section>
          <SectionHeading
            n="01"
            title="Query it yourself"
            lede="These tables are loaded into DuckDB compiled to WebAssembly, running inside your browser. The engine reads only the byte ranges a query touches, so joining two 99,000-row tables does not download either of them in full. Nothing you type is sent anywhere — there is no server to send it to."
          />
          <div className="mt-8">
            <QueryConsole presets={PRESETS} />
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-ink-subtle">
            This is the same engine the natural-language interface uses. The
            language model never receives a database connection; it emits SQL,
            a validator approves or rejects it, and execution happens here.
          </p>
        </section>

        <section>
          <SectionHeading
            n="02"
            title="Data dictionary"
            lede="Generated from the Parquet files themselves, so it cannot drift from what actually shipped. Grain is stated for every table, because most double-counting starts with a wrong assumption about it."
          />
          <div className="mt-8 space-y-10">
            {tablesByDomain().map(([domain, tables]) => (
              <div key={domain}>
                <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
                  {DOMAIN_LABELS[domain]}
                </h3>
                <div className="mt-4 grid gap-3">
                  {tables.map((table) => (
                    <TableCard key={table.name} table={table} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading
            n="03"
            title="What was cleaned, and what was left alone"
            lede="Cleaning is judgment, so each decision is recorded with the count of rows it touched. Rules marked flagged were deliberately not fixed — the condition is real and the metric has to account for it rather than the data being quietly edited."
          />
          <div className="mt-8">
            <QualityTable rules={allRules} />
          </div>
        </section>

        <section>
          <SectionHeading
            n="04"
            title="Where the data came from"
            lede="Source, files, pull date, record count, and known gaps for each dataset. Every checksum in the manifest was taken from the file as published."
          />
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {manifest.sources.map((source) => (
              <ProvenanceBlock
                key={source.key}
                p={{
                  source: source.source,
                  url: source.url,
                  files: source.files.map(
                    (f) => `${f.name} — ${f.rows.toLocaleString("en-US")} rows`,
                  ),
                  pulledAt: source.pulled_at,
                  records: source.files.reduce((sum, f) => sum + f.rows, 0),
                  gaps: source.gaps,
                  nature: source.nature,
                }}
              />
            ))}
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            {manifest.sources.map((source) => (
              <p
                key={source.key}
                className="text-sm leading-relaxed text-ink-muted"
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
                  {source.slug}
                </span>
                <br />
                {source.notes}
              </p>
            ))}
          </div>
        </section>
      </Container>
    </>
  );
}

function SectionHeading({
  n,
  title,
  lede,
}: {
  n: string;
  title: string;
  lede: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="font-mono text-xs text-accent">{n}</p>
      <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">{title}</h2>
      <p className="mt-4 leading-relaxed text-ink-muted">{lede}</p>
    </div>
  );
}

function TableCard({ table }: { table: Table }) {
  return (
    <details className="group rounded-lg border border-border bg-surface">
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-4 marker:content-['']">
        <span className="font-mono text-sm text-ink group-open:text-accent">
          {table.name}
        </span>
        <span className="tnum font-mono text-[11px] text-ink-subtle">
          {table.rows.toLocaleString("en-US")} rows · {table.columns.length} cols ·{" "}
          {formatBytes(table.bytes)}
        </span>
        <span className="w-full text-sm text-ink-muted sm:w-auto sm:flex-1">
          {table.grain}
        </span>
      </summary>
      <div className="border-t border-border px-5 py-4">
        <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">
          {table.description}
        </p>
        <ul className="mt-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {table.columns.map((column) => (
            <li key={column.name} className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-xs text-ink">{column.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-wide text-ink-subtle">
                {column.type}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

const SEVERITY_TONE = {
  fixed: "positive",
  flagged: "caution",
  dropped: "info",
} as const;

function QualityTable({
  rules,
}: {
  rules: Array<{ table: string; rule: QualityRule }>;
}) {
  return (
    <Panel>
      <PanelHeader
        title="Cleaning log"
        meta={
          <span>
            {rules.filter((r) => r.rule.severity === "fixed").length} fixed ·{" "}
            {rules.filter((r) => r.rule.severity === "flagged").length} flagged ·{" "}
            {rules.filter((r) => r.rule.severity === "dropped").length} dropped
          </span>
        }
      />
      <ul className="divide-y divide-border">
        {rules.map(({ table, rule }) => (
          <li key={`${table}.${rule.rule}`} className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Badge tone={SEVERITY_TONE[rule.severity]}>{rule.severity}</Badge>
              <span className="font-mono text-xs text-ink">{table}</span>
              <span className="font-mono text-xs text-ink-subtle">{rule.rule}</span>
              <span className="tnum ml-auto font-mono text-xs text-ink-muted">
                {rule.rows_affected.toLocaleString("en-US")} rows
              </span>
            </div>
            <p className="mt-2.5 max-w-3xl text-sm leading-relaxed text-ink-muted">
              {rule.description}
            </p>
            {rule.before ? (
              <p className="mt-2 font-mono text-xs text-ink-subtle">
                <span className="text-negative">{rule.before}</span>
                {" → "}
                <span className="text-positive">{rule.after}</span>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
