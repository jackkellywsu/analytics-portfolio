"use client";

import { ChartFrame, Tooltip, barPath, useTooltip } from "./primitives";
import { FORMATTERS, type FormatName } from "@/lib/formatters";

export type BarDatum = {
  key: string;
  label: string;
  value: number;
  detail?: Array<{ label: string; value: string }>;
};

/**
 * Horizontal bars, one series, ranked.
 *
 * Horizontal because the categories are named things whose labels need room —
 * rotating axis labels to fit a column chart is a layout failure dressed up as
 * a design choice. Values are direct-labelled at the tip, so the axis is not
 * needed and does not appear.
 */
export function BarChart({
  data,
  format,
  labelWidth = 132,
  valueWidth = 88,
  rowHeight = 30,
}: {
  data: BarDatum[];
  format: FormatName;
  labelWidth?: number;
  valueWidth?: number;
  rowHeight?: number;
}) {
  const { tooltip, setTooltip, hide } = useTooltip();
  const formatValue = FORMATTERS[format];

  const padTop = 4;
  const height = data.length * rowHeight + padTop * 2;
  const max = Math.max(...data.map((d) => d.value), 0);

  return (
    <ChartFrame height={height}>
      {(width) => {
        const plotLeft = labelWidth;
        const plotWidth = Math.max(10, width - labelWidth - valueWidth);
        const barHeight = Math.min(24, rowHeight - 8);

        return (
          <>
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`Ranked bar chart with ${data.length} categories`}
              onMouseLeave={hide}
            >
              {data.map((datum, i) => {
                const y = padTop + i * rowHeight + (rowHeight - barHeight) / 2;
                const barWidth = (datum.value / (max || 1)) * plotWidth;
                return (
                  <g
                    key={datum.key}
                    onMouseEnter={() =>
                      setTooltip({
                        x: plotLeft + barWidth,
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
                      x={0}
                      y={padTop + i * rowHeight}
                      width={width}
                      height={rowHeight}
                      fill="transparent"
                    />
                    <text
                      x={labelWidth - 12}
                      y={y + barHeight / 2 + 4}
                      textAnchor="end"
                      fontSize={12}
                      fill="var(--color-ink-muted)"
                    >
                      {datum.label}
                    </text>
                    <path
                      d={barPath(plotLeft, y, barWidth, barHeight, "horizontal")}
                      fill="var(--color-series-1)"
                    />
                    <text
                      x={plotLeft + barWidth + 10}
                      y={y + barHeight / 2 + 4}
                      fontSize={12}
                      className="tnum"
                      fill="var(--color-ink)"
                    >
                      {formatValue(datum.value)}
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
