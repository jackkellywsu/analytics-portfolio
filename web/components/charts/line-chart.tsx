"use client";

import { ChartFrame, Tooltip, XGrid, YGrid, niceTicks, useTooltip } from "./primitives";
import { FORMATTERS, type FormatName } from "@/lib/formatters";

export type LineSeries = {
  key: string;
  label: string;
  values: Array<number | null>;
  color: string;
  /** Dotted lines read as "modelled", not "measured". */
  dashed?: boolean;
};

export type Marker = {
  index: number;
  label: string;
  direction?: "spike" | "drop";
  detail?: Array<{ label: string; value: string }>;
};

/**
 * Time series with marked points.
 *
 * Two series at most, which is the validated limit for this palette, and the
 * second is dashed because it is a model of what was expected rather than
 * something that happened. Markers sit on the observed line, never on the
 * expectation — an anomaly is a property of the measurement.
 */
export function LineChart({
  labels,
  series,
  markers = [],
  format,
  formatAxis,
  height = 300,
  labelEvery,
}: {
  labels: string[];
  series: LineSeries[];
  markers?: Marker[];
  format: FormatName;
  formatAxis?: FormatName;
  height?: number;
  labelEvery?: number;
}) {
  const { tooltip, setTooltip, hide } = useTooltip();
  const formatValue = FORMATTERS[format];
  const formatTick = FORMATTERS[formatAxis ?? format];

  const padLeft = 56;
  const padRight = 12;
  const padTop = 14;
  const padBottom = 34;

  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const max = Math.max(...all, 0);
  const tickEvery = labelEvery ?? Math.max(1, Math.ceil(labels.length / 8));

  return (
    <ChartFrame height={height}>
      {(width) => {
        const plotLeft = padLeft;
        const plotRight = width - padRight;
        const plotTop = padTop;
        const plotBottom = height - padBottom;

        const sx = (i: number) =>
          plotLeft +
          (labels.length <= 1
            ? 0
            : (i / (labels.length - 1)) * (plotRight - plotLeft));
        const sy = (v: number) =>
          plotBottom - (v / (max || 1)) * (plotBottom - plotTop);

        const path = (values: Array<number | null>) => {
          let d = "";
          let pen = false;
          values.forEach((v, i) => {
            if (v === null) {
              pen = false;
              return;
            }
            d += `${pen ? "L" : "M"} ${sx(i).toFixed(2)} ${sy(v).toFixed(2)} `;
            pen = true;
          });
          return d.trim();
        };

        return (
          <>
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`Time series over ${labels.length} days with ${markers.length} flagged points`}
              onMouseLeave={hide}
            >
              <YGrid
                ticks={niceTicks(0, max, 4)}
                scale={sy}
                left={plotLeft}
                right={plotRight}
                format={formatTick}
              />
              <XGrid
                ticks={labels
                  .map((_, i) => i)
                  .filter((i) => i % tickEvery === 0)}
                scale={sx}
                top={plotTop}
                bottom={plotBottom}
                format={(i) => labels[i]?.slice(0, 7) ?? ""}
              />

              {series.map((s) => (
                <path
                  key={s.key}
                  d={path(s.values)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={s.dashed ? "4 4" : undefined}
                  opacity={s.dashed ? 0.75 : 1}
                />
              ))}

              {markers.map((marker) => {
                const value = series[0]?.values[marker.index];
                if (value === null || value === undefined) return null;
                const cx = sx(marker.index);
                const cy = sy(value);
                return (
                  <g
                    key={`${marker.index}-${marker.label}`}
                    onMouseEnter={() =>
                      setTooltip({
                        x: cx,
                        y: cy,
                        title: marker.label,
                        rows: [
                          { label: "Observed", value: formatValue(value) },
                          ...(marker.detail ?? []),
                        ],
                      })
                    }
                  >
                    <circle cx={cx} cy={cy} r={12} fill="transparent" />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill={
                        marker.direction === "drop"
                          ? "var(--color-info)"
                          : "var(--color-negative)"
                      }
                      stroke="var(--color-surface)"
                      strokeWidth={2}
                    />
                  </g>
                );
              })}

              {/* Hit strip: hovering anywhere in a day's column reads that day. */}
              {labels.map((iso, i) => (
                <rect
                  key={iso}
                  x={sx(i) - (plotRight - plotLeft) / labels.length / 2}
                  y={plotTop}
                  width={Math.max(2, (plotRight - plotLeft) / labels.length)}
                  height={plotBottom - plotTop}
                  fill="transparent"
                  onMouseEnter={() => {
                    const observed = series[0]?.values[i];
                    if (observed === null || observed === undefined) return;
                    setTooltip({
                      x: sx(i),
                      y: sy(observed),
                      title: iso,
                      rows: series
                        .map((s) => {
                          const v = s.values[i];
                          return v === null || v === undefined
                            ? null
                            : { label: s.label, value: formatValue(v) };
                        })
                        .filter((r): r is { label: string; value: string } => r !== null),
                    });
                  }}
                />
              ))}
            </svg>
            <Tooltip state={tooltip} />
          </>
        );
      }}
    </ChartFrame>
  );
}
