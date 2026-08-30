"use client";

import { useMemo, useState } from "react";
import { Panel, PanelHeader } from "./ui/panel";
import { Badge } from "./ui/badge";
import { brl, days, int, label, pct } from "@/lib/format";
import { cn } from "@/lib/cn";

export type Segment = {
  segment: string;
  deals: number;
  attached: number;
  attachment_raw: number;
  attachment_shrunk: number;
  attachment_interval: { point: number; low: number; high: number; n: number };
  converters: number;
  revenue_per_converter_raw: number;
  revenue_per_converter_shrunk: number;
  revenue_per_deal: number;
  revenue_90d: number;
  median_days_to_close: number;
};

type WeightKey = "quality" | "value" | "volume" | "speed";

const COMPONENTS: Array<{
  key: WeightKey;
  label: string;
  description: string;
  defaultWeight: number;
}> = [
  {
    key: "quality",
    label: "Conversion quality",
    description:
      "Share of won clients in the segment that went on to generate revenue.",
    defaultWeight: 35,
  },
  {
    key: "value",
    label: "Revenue per client",
    description:
      "Typical 90-day revenue from a client that actually billed. Conditioned on converting, because whether a client bills at all is already the component above.",
    defaultWeight: 35,
  },
  {
    key: "volume",
    label: "Volume",
    description:
      "How many clients the segment actually produced, on a log scale so one large segment cannot dominate.",
    defaultWeight: 15,
  },
  {
    key: "speed",
    label: "Speed to close",
    description: "Inverse of the median days from first contact to signature.",
    defaultWeight: 15,
  },
];

/**
 * A prospect score you can disagree with.
 *
 * Two things make it defensible rather than a black box. The weights are
 * visible and adjustable, so a reader who thinks speed matters more than volume
 * can say so and watch the ranking move. And the conversion component uses a
 * shrunk estimate by default — with 31 segments and some as small as a single
 * deal, ranking on raw rates puts whichever tiny segment got lucky on top.
 * The toggle shows exactly what that costs.
 */
export function ProspectScorer({
  segments,
  prior,
}: {
  segments: Segment[];
  prior: { mean: number; strength: number };
}) {
  const [weights, setWeights] = useState<Record<WeightKey, number>>(
    Object.fromEntries(COMPONENTS.map((c) => [c.key, c.defaultWeight])) as Record<
      WeightKey,
      number
    >,
  );
  const [shrink, setShrink] = useState(true);
  const [minDeals, setMinDeals] = useState(0);

  const scored = useMemo(() => {
    const pool = segments.filter((s) => s.deals >= minDeals);
    if (pool.length === 0) return [];

    const valueOf = (s: Segment) =>
      shrink ? s.revenue_per_converter_shrunk : s.revenue_per_converter_raw;
    const maxRevenue = Math.max(...pool.map(valueOf), 1);
    const maxLogDeals = Math.max(...pool.map((s) => Math.log1p(s.deals)), 1);
    const maxDays = Math.max(...pool.map((s) => s.median_days_to_close), 1);
    const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;

    return pool
      .map((s) => {
        const parts: Record<WeightKey, number> = {
          quality: shrink ? s.attachment_shrunk : s.attachment_raw,
          value: valueOf(s) / maxRevenue,
          volume: Math.log1p(s.deals) / maxLogDeals,
          speed: 1 - s.median_days_to_close / maxDays,
        };
        const score =
          (COMPONENTS.reduce((sum, c) => sum + weights[c.key] * parts[c.key], 0) /
            total) *
          100;
        return { ...s, parts, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [segments, weights, shrink, minDeals]);

  // How far the ranking moves when shrinkage is switched off — the honest way
  // to show what it is doing.
  const rankShift = useMemo(() => {
    const rankOf = (useShrunk: boolean) => {
      const valueOf = (s: Segment) =>
        useShrunk ? s.revenue_per_converter_shrunk : s.revenue_per_converter_raw;
      const maxRevenue = Math.max(...segments.map(valueOf), 1);
      const maxLogDeals = Math.max(...segments.map((s) => Math.log1p(s.deals)), 1);
      const maxDays = Math.max(...segments.map((s) => s.median_days_to_close), 1);
      const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
      return segments
        .map((s) => ({
          segment: s.segment,
          score:
            (weights.quality * (useShrunk ? s.attachment_shrunk : s.attachment_raw) +
              weights.value * (valueOf(s) / maxRevenue) +
              weights.volume * (Math.log1p(s.deals) / maxLogDeals) +
              weights.speed * (1 - s.median_days_to_close / maxDays)) /
            total,
        }))
        .sort((a, b) => b.score - a.score)
        .map((s) => s.segment);
    };
    const shrunkOrder = rankOf(true);
    const rawOrder = rankOf(false);
    const moved = shrunkOrder.filter(
      (segment, i) => Math.abs(rawOrder.indexOf(segment) - i) >= 3,
    ).length;
    return { moved, total: shrunkOrder.length, rawTop: rawOrder[0], shrunkTop: shrunkOrder[0] };
  }, [segments, weights]);

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Weights"
          meta={
            <button
              type="button"
              onClick={() =>
                setWeights(
                  Object.fromEntries(
                    COMPONENTS.map((c) => [c.key, c.defaultWeight]),
                  ) as Record<WeightKey, number>,
                )
              }
              className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-subtle hover:text-accent"
            >
              Reset
            </button>
          }
        />
        <div className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2">
          {COMPONENTS.map((component) => (
            <div key={component.key}>
              <div className="flex items-baseline justify-between gap-3">
                <label
                  htmlFor={`weight-${component.key}`}
                  className="text-sm font-medium text-ink"
                >
                  {component.label}
                </label>
                <span className="tnum font-mono text-xs text-accent">
                  {weights[component.key]}
                </span>
              </div>
              <input
                id={`weight-${component.key}`}
                type="range"
                min={0}
                max={100}
                step={5}
                value={weights[component.key]}
                onChange={(e) =>
                  setWeights((w) => ({
                    ...w,
                    [component.key]: Number(e.target.value),
                  }))
                }
                className="mt-2 w-full accent-[var(--color-accent)]"
              />
              <p className="mt-1.5 text-xs leading-relaxed text-ink-subtle">
                {component.description}
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border px-5 py-4">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={shrink}
              onChange={(e) => setShrink(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            <span className="text-sm text-ink">
              Shrink conversion rates toward the population mean
            </span>
          </label>
          <label className="flex items-center gap-2.5">
            <span className="text-sm text-ink-muted">Minimum clients</span>
            <input
              type="number"
              min={0}
              max={50}
              value={minDeals}
              onChange={(e) => setMinDeals(Math.max(0, Number(e.target.value)))}
              className="tnum w-16 rounded border border-border bg-surface-2 px-2 py-1 font-mono text-xs text-ink"
            />
          </label>
        </div>
      </Panel>

      <div
        className={cn(
          "rounded-lg border px-5 py-4 text-sm leading-relaxed",
          shrink ? "border-border bg-surface" : "border-caution/40 bg-caution/5",
        )}
      >
        {shrink ? (
          <p className="text-ink-muted">
            Conversion rates are shrunk toward the population mean of{" "}
            <span className="font-mono text-ink">{pct(prior.mean)}</span> with a
            prior worth{" "}
            <span className="font-mono text-ink">
              {prior.strength.toFixed(1)} pseudo-clients
            </span>
            . A segment with four clients is pulled most of the way to the mean;
            one with two hundred barely moves. Revenue is shrunk the same way but
            on the log scale, because the raw means are set by a handful of very
            large clients. Turning this off moves{" "}
            <span className="font-mono text-ink">{rankShift.moved}</span> of{" "}
            {rankShift.total} segments by three or more places.
          </p>
        ) : (
          <p className="text-ink-muted">
            <span className="text-caution">Raw estimates.</span>{" "}
            {rankShift.rawTop === rankShift.shrunkTop ? (
              <>
                The order barely moves at the very top, but{" "}
                <span className="font-mono text-ink">{rankShift.moved}</span> of{" "}
                {rankShift.total} segments shift by three or more places, and the
                value column now reports means that a single large client can
                set. Check the client count on any row before believing it.
              </>
            ) : (
              <>
                The top of this list is now{" "}
                <span className="font-mono text-ink">{label(rankShift.rawTop)}</span>{" "}
                rather than{" "}
                <span className="font-mono text-ink">
                  {label(rankShift.shrunkTop)}
                </span>
                . Check its client count before believing it — a segment that
                converted two of two shows 100%, and no error bar stops the eye
                going to the top row.
              </>
            )}
          </p>
        )}
      </div>

      <Panel>
        <PanelHeader
          title={`Segments ranked — ${scored.length} shown`}
          meta={<span>Hover a row to see the score decompose</span>}
        />
        <div className="scroll-panel max-h-[32rem] overflow-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                {[
                  "#",
                  "Segment",
                  "Score",
                  "Clients",
                  "Conversion",
                  "Typical revenue",
                  "Median close",
                ].map((column, i) => (
                  <th
                    key={column}
                    scope="col"
                    className={cn(
                      "whitespace-nowrap border-b border-border px-3 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.06em] text-ink-subtle",
                      i > 1 && "text-right",
                    )}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scored.map((row, i) => (
                <tr
                  key={row.segment}
                  className="group border-b border-border/50 last:border-0 hover:bg-surface-2"
                >
                  <td className="tnum px-3 py-2 font-mono text-xs text-ink-subtle">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-ink">{label(row.segment)}</span>
                    <span className="mt-1.5 flex h-1 w-40 overflow-hidden rounded-full bg-surface-3">
                      {COMPONENTS.map((c, ci) => (
                        <span
                          key={c.key}
                          title={`${c.label}: ${Math.round(
                            (weights[c.key] * row.parts[c.key] * 100) /
                              (Object.values(weights).reduce((a, b) => a + b, 0) || 1),
                          )} of ${Math.round(row.score)}`}
                          style={{
                            width: `${
                              ((weights[c.key] * row.parts[c.key]) /
                                (Object.values(weights).reduce((a, b) => a + b, 0) || 1) /
                                (row.score / 100 || 1)) *
                              100
                            }%`,
                            background: [
                              "var(--color-series-1)",
                              "var(--color-series-2)",
                              "var(--color-series-3)",
                              "var(--color-border-strong)",
                            ][ci],
                          }}
                        />
                      ))}
                    </span>
                  </td>
                  <td className="tnum px-3 py-2 text-right font-mono text-accent">
                    {row.score.toFixed(1)}
                  </td>
                  <td className="tnum px-3 py-2 text-right font-mono text-ink-muted">
                    {int(row.deals)}
                  </td>
                  <td className="tnum px-3 py-2 text-right font-mono text-ink-muted">
                    {pct(shrink ? row.attachment_shrunk : row.attachment_raw)}
                    {shrink && Math.abs(row.attachment_shrunk - row.attachment_raw) > 0.05 ? (
                      <span className="ml-1.5 text-[10px] text-ink-subtle">
                        (raw {pct(row.attachment_raw, 0)})
                      </span>
                    ) : null}
                  </td>
                  <td className="tnum px-3 py-2 text-right font-mono text-ink-muted">
                    {brl(shrink ? row.revenue_per_converter_shrunk : row.revenue_per_converter_raw)}
                    {shrink &&
                    row.revenue_per_converter_raw >
                      row.revenue_per_converter_shrunk * 1.5 ? (
                      <span className="ml-1.5 text-[10px] text-ink-subtle">
                        (raw {brl(row.revenue_per_converter_raw, true)} from{" "}
                        {row.converters})
                      </span>
                    ) : null}
                  </td>
                  <td className="tnum px-3 py-2 text-right font-mono text-ink-muted">
                    {days(row.median_days_to_close)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-3">
          {COMPONENTS.map((c, ci) => (
            <span key={c.key} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-[2px]"
                style={{
                  background: [
                    "var(--color-series-1)",
                    "var(--color-series-2)",
                    "var(--color-series-3)",
                    "var(--color-border-strong)",
                  ][ci],
                }}
              />
              <span className="text-xs text-ink-muted">{c.label}</span>
            </span>
          ))}
          <Badge className="ml-auto">
            {scored.length === 0 ? "No segments match" : `${scored.length} segments`}
          </Badge>
        </div>
      </Panel>
    </div>
  );
}
