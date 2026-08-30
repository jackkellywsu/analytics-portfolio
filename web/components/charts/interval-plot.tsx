"use client";

import { ChartFrame, Tooltip, XGrid, niceTicks, useTooltip } from "./primitives";
import { pct } from "@/lib/format";

export type IntervalRow = {
  key: string;
  label: string;
  point: number;
  low: number;
  high: number;
  n: number;
  detail?: Array<{ label: string; value: string }>;
};

/**
 * Dot-and-whisker plot for comparing proportions.
 *
 * Deliberately not a bar chart. Bars encode magnitude from zero, so truncating
 * their axis distorts them — but these marks are *intervals*, and an interval
 * plot has no filled area implying distance from an origin. That frees the axis
 * to zoom in on the range where the estimates actually live, which is the only
 * way overlapping uncertainty becomes visible at all. Plotted 0–100%, every
 * category here would be an identical stub and the reader would learn nothing.
 */
export function IntervalPlot({
  rows,
  reference,
  height,
  labelWidth = 132,
}: {
  rows: IntervalRow[];
  reference?: { value: number; label: string };
  height?: number;
  labelWidth?: number;
}) {
  const { tooltip, setTooltip, hide } = useTooltip();

  const rowHeight = 30;
  const padTop = 8;
  const padBottom = 34;
  const padRight = 62;
  const plotHeight = rows.length * rowHeight;
  const totalHeight = height ?? plotHeight + padTop + padBottom;

  const lows = rows.map((r) => r.low);
  const highs = rows.map((r) => r.high);
  const rawMin = Math.min(...lows, reference?.value ?? Infinity);
  const rawMax = Math.max(...highs, reference?.value ?? -Infinity);
  const pad = (rawMax - rawMin) * 0.18 || 0.02;
  const domainMin = Math.max(0, rawMin - pad);
  const domainMax = Math.min(1, rawMax + pad);

  return (
    <ChartFrame height={totalHeight}>
      {(width) => {
        const plotLeft = labelWidth;
        const plotRight = width - padRight;
        const plotWidth = Math.max(10, plotRight - plotLeft);
        const scale = (value: number) =>
          plotLeft + ((value - domainMin) / (domainMax - domainMin)) * plotWidth;
        const ticks = niceTicks(domainMin, domainMax, 4);

        return (
          <>
            <svg
              width={width}
              height={totalHeight}
              role="img"
              aria-label={`Point estimates with 95% confidence intervals for ${rows.length} categories`}
              onMouseLeave={hide}
            >
              <XGrid
                ticks={ticks}
                scale={scale}
                top={padTop}
                bottom={padTop + plotHeight}
                format={(t) => pct(t, 0)}
              />

              {reference ? (
                <g>
                  <line
                    x1={scale(reference.value)}
                    x2={scale(reference.value)}
                    y1={padTop}
                    y2={padTop + plotHeight}
                    stroke="var(--color-ink-subtle)"
                    strokeWidth={1}
                  />
                  <text
                    x={scale(reference.value)}
                    y={padTop + plotHeight + 30}
                    textAnchor="middle"
                    fontSize={11}
                    fill="var(--color-ink-muted)"
                  >
                    {reference.label}
                  </text>
                </g>
              ) : null}

              {rows.map((row, i) => {
                const y = padTop + i * rowHeight + rowHeight / 2;
                return (
                  <g
                    key={row.key}
                    onMouseEnter={(event) => {
                      const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                      if (!box) return;
                      setTooltip({
                        x: scale(row.point),
                        y,
                        title: row.label,
                        rows: [
                          { label: "Estimate", value: pct(row.point) },
                          {
                            label: "95% interval",
                            value: `${pct(row.low)} – ${pct(row.high)}`,
                          },
                          { label: "Sample", value: `${row.n.toLocaleString("en-US")}` },
                          ...(row.detail ?? []),
                        ],
                      });
                    }}
                  >
                    {/* Generous hit area: the marks are small, the target is not. */}
                    <rect
                      x={0}
                      y={padTop + i * rowHeight}
                      width={width}
                      height={rowHeight}
                      fill="transparent"
                    />
                    <text
                      x={labelWidth - 12}
                      y={y + 4}
                      textAnchor="end"
                      fontSize={12}
                      fill="var(--color-ink-muted)"
                    >
                      {row.label}
                    </text>

                    <line
                      x1={scale(row.low)}
                      x2={scale(row.high)}
                      y1={y}
                      y2={y}
                      stroke="var(--color-series-1)"
                      strokeWidth={2}
                      strokeLinecap="round"
                      opacity={0.55}
                    />
                    {/* Whisker caps make the interval endpoints readable. */}
                    {[row.low, row.high].map((value, cap) => (
                      <line
                        key={`${row.key}-cap-${cap}`}
                        x1={scale(value)}
                        x2={scale(value)}
                        y1={y - 5}
                        y2={y + 5}
                        stroke="var(--color-series-1)"
                        strokeWidth={2}
                        opacity={0.55}
                      />
                    ))}
                    <circle
                      cx={scale(row.point)}
                      cy={y}
                      r={4.5}
                      fill="var(--color-series-1)"
                      stroke="var(--color-surface)"
                      strokeWidth={2}
                    />
                    <text
                      x={width - padRight + 12}
                      y={y + 4}
                      fontSize={12}
                      className="tnum"
                      fill="var(--color-ink)"
                    >
                      {pct(row.point)}
                    </text>
                  </g>
                );
              })}
            </svg>
            <Tooltip state={tooltip} />
          </>
        );
      }}
    </ChartFrame>
  );
}
