import { Panel, PanelHeader } from "./panel";

export type Provenance = {
  /** Human name of the source, e.g. "Kaggle — Olist Marketing Funnel". */
  source: string;
  /** Canonical URL for the source. */
  url: string;
  /** Files or endpoints actually consumed. */
  files: string[];
  /** ISO date the data was pulled. */
  pulledAt: string;
  /** Row count after cleaning. */
  records: number;
  /** Period the data covers, if it is a time series. */
  coverage?: string;
  /** Known gaps, biases, and things this data cannot answer. Never omit. */
  gaps: string[];
  /** Whether the underlying data is real or synthetic. Stated plainly. */
  nature: "real" | "synthetic";
};

/**
 * Every figure on this site traces to one of these. Governance portfolios are
 * judged on whether the provenance is visible, so it is a component, not a
 * footnote.
 */
export function ProvenanceBlock({ p }: { p: Provenance }) {
  return (
    <Panel>
      <PanelHeader
        title="Data provenance"
        meta={
          <span className={p.nature === "synthetic" ? "text-caution" : "text-positive"}>
            {p.nature === "synthetic" ? "Synthetic source" : "Real-world source"}
          </span>
        }
      />
      <dl className="divide-y divide-border text-sm">
        <Row label="Source">
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer"
            className="text-ink underline decoration-border underline-offset-4 hover:decoration-accent"
          >
            {p.source}
          </a>
        </Row>
        <Row label="Files">
          <ul className="space-y-1 font-mono text-xs text-ink-muted">
            {p.files.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Row>
        <Row label="Pulled">
          <span className="tnum font-mono text-xs">{p.pulledAt}</span>
        </Row>
        <Row label="Records">
          <span className="tnum font-mono text-xs">{p.records.toLocaleString("en-US")}</span>
        </Row>
        {p.coverage ? (
          <Row label="Coverage">
            <span className="font-mono text-xs">{p.coverage}</span>
          </Row>
        ) : null}
        <Row label="Known gaps">
          <ul className="list-disc space-y-1.5 pl-4 text-ink-muted marker:text-ink-subtle">
            {p.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </Row>
      </dl>
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 px-5 py-3.5 sm:grid-cols-[8rem_1fr] sm:gap-6">
      <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
