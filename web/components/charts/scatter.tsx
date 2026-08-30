"use client";

import { ChartFrame, Tooltip, XGrid, YGrid, niceTicks, useTooltip } from "./primitives";
import { FORMATTERS, type FormatName } from "@/lib/formatters";

export type Point = {
  key: string;
  label: string;
  x: number;
  y: number;
  /** Marks a point on the efficient frontier. */
  frontier?: boolean;
  detail?: Array<{ label: string; value: string }>;
};

/**
 * Cost against accuracy, with the frontier marked.
 *
 * Points are direct-labelled rather than legended: there are few enough that a
 * legend would be a second lookup for no gain, and the label sits beside its own
 * mark so identity never depends on colour.
 */
export function Scatter({
  points,
  xFormat,
  yFormat,
  xLabel,
  yLabel,
  height = 300,
}: {
  points: Point[];
  xFormat: FormatName;
  yFormat: FormatName;
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  const { tooltip, setTooltip, hide } = useTooltip();
  const formatX = FORMATTERS[xFormat];
  const formatY = FORMATTERS[yFormat];

  const padLeft = 56;
  const padRight = 16;
  const padTop = 14;
  const padBottom = 46;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = 0;
  const xMax = Math.max(...xs) * 1.15;
  const yMin = Math.max(0, Math.min(...ys) - (Math.max(...ys) - Math.min(...ys)) * 0.4);
  const yMax = Math.min(1, Math.max(...ys) + (Math.max(...ys) - Math.min(...ys)) * 0.4);

  return (
    <ChartFrame height={height}>
      {(width) => {
        const plotLeft = padLeft;
        const plotRight = width - padRight;
        const plotTop = padTop;
        const plotBottom = height - padBottom;

        const sx = (v: number) =>
          plotLeft + ((v - xMin) / (xMax - xMin || 1)) * (plotRight - plotLeft);
        const sy = (v: number) =>
          plotBottom - ((v - yMin) / (yMax - yMin || 1)) * (plotBottom - plotTop);

        return (
          <>
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`${yLabel} against ${xLabel} for ${points.length} configurations`}
              onMouseLeave={hide}
            >
              <YGrid
                ticks={niceTicks(yMin, yMax, 4)}
                scale={sy}
                left={plotLeft}
                right={plotRight}
                format={formatY}
              />
              <XGrid
                ticks={niceTicks(xMin, xMax, 4)}
                scale={sx}
                top={plotTop}
                bottom={plotBottom}
                format={formatX}
              />
              <text
                x={(plotLeft + plotRight) / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-ink-subtle)"
              >
                {xLabel}
              </text>

              {points.map((point) => {
                const cx = sx(point.x);
                const cy = sy(point.y);
                return (
                  <g
                    key={point.key}
                    onMouseEnter={() =>
                      setTooltip({
                        x: cx,
                        y: cy,
                        title: point.label,
                        rows: [
                          { label: yLabel, value: formatY(point.y) },
                          { label: xLabel, value: formatX(point.x) },
                          ...(point.detail ?? []),
                        ],
                      })
                    }
                  >
                    <circle cx={cx} cy={cy} r={14} fill="transparent" />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill={
                        point.frontier
                          ? "var(--color-series-1)"
                          : "var(--color-series-2)"
                      }
                      stroke="var(--color-surface)"
                      strokeWidth={2}
                    />
                    <text
                      x={cx}
                      y={cy - 13}
                      textAnchor="middle"
                      fontSize={11}
                      fill="var(--color-ink-muted)"
                    >
                      {point.label}
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
