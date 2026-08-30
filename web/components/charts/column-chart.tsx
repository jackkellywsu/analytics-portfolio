"use client";

import { ChartFrame, Tooltip, YGrid, barPath, niceTicks, useTooltip } from "./primitives";
import { FORMATTERS, type FormatName } from "@/lib/formatters";

export type ColumnDatum = {
  key: string;
  label: string;
  value: number;
  /** Marks the column as belonging to the emphasised group. */
  emphasis?: boolean;
  detail?: Array<{ label: string; value: string }>;
};

/**
 * Vertical columns, one series.
 *
 * `emphasis` splits the columns into two visually distinct groups rather than
 * shading every column by its own value — a value-ramp on categories double-
 * encodes height as colour and burns the only free channel on information the
 * chart already shows.
 */
export function ColumnChart({
  data,
  format,
  formatAxis,
  height = 240,
  labelEvery = 1,
  emphasisLabel,
  baseLabel,
}: {
  data: ColumnDatum[];
  format: FormatName;
  formatAxis?: FormatName;
  height?: number;
  labelEvery?: number;
  emphasisLabel?: string;
  baseLabel?: string;
}) {
  const { tooltip, setTooltip, hide } = useTooltip();
  const formatValue = FORMATTERS[format];
  const formatTick = FORMATTERS[formatAxis ?? format];

  const padTop = 12;
  const padBottom = 32;
  const padLeft = 52;
  const padRight = 8;
  const gap = 2;

  const max = Math.max(...data.map((d) => d.value), 0);
  const hasEmphasis = data.some((d) => d.emphasis !== undefined);

  return (
    <ChartFrame height={height}>
      {(width) => {
        const plotTop = padTop;
        const plotBottom = height - padBottom;
        const plotHeight = plotBottom - plotTop;
        const plotWidth = width - padLeft - padRight;
        const slot = plotWidth / data.length;
        const barWidth = Math.min(24, Math.max(2, slot - gap));

        const ticks = niceTicks(0, max, 4);
        const yScale = (value: number) => plotBottom - (value / (max || 1)) * plotHeight;

        return (
          <>
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`Column chart with ${data.length} categories`}
              onMouseLeave={hide}
            >
              <YGrid
                ticks={ticks}
                scale={yScale}
                left={padLeft}
                right={width - padRight}
                format={formatTick}
              />
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={plotBottom}
                y2={plotBottom}
                stroke="var(--color-axis)"
                strokeWidth={1}
              />

              {data.map((datum, i) => {
                const x = padLeft + i * slot + (slot - barWidth) / 2;
                const y = yScale(datum.value);
                const barHeight = plotBottom - y;
                const color =
                  !hasEmphasis || datum.emphasis
                    ? "var(--color-series-1)"
                    : "var(--color-series-2)";
                return (
                  <g
                    key={datum.key}
                    onMouseEnter={() =>
                      setTooltip({
                        x: x + barWidth / 2,
                        y,
                        title: datum.label,
                        rows: [
                          { label: "Value", value: formatValue(datum.value) },
                          ...(datum.detail ?? []),
                        ],
                      })
                    }
                  >
                    <rect
                      x={padLeft + i * slot}
                      y={plotTop}
                      width={slot}
                      height={plotHeight}
                      fill="transparent"
                    />
                    <path d={barPath(x, y, barWidth, barHeight, "vertical")} fill={color} />
                    {i % labelEvery === 0 ? (
                      <text
                        x={x + barWidth / 2}
                        y={plotBottom + 16}
                        textAnchor="middle"
                        fontSize={11}
                        fill="var(--color-ink-subtle)"
                      >
                        {datum.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
            <Tooltip state={tooltip} />
            {hasEmphasis && emphasisLabel && baseLabel ? (
              <p className="sr-only">
                Columns are split into {emphasisLabel} and {baseLabel}.
              </p>
            ) : null}
          </>
        );
      }}
    </ChartFrame>
  );
}
