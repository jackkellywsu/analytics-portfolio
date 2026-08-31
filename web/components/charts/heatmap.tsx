"use client";

import { ChartFrame, Tooltip, useTooltip } from "./primitives";
import { int } from "@/lib/format";

/**
 * Sequential heatmap.
 *
 * One hue, running light to dark as magnitude rises. On this cream ground the
 * palest step sits almost on the surface, which is what "near zero" should look
 * like — an empty cell recedes rather than shouting. The ramp is the indigo
 * from the chart palette rather than the terracotta, because terracotta at full
 * strength reads as an alert and a count of three is not an alert.
 *
 * Never a rainbow: multi-hue ramps invent category boundaries where the data
 * has a continuum.
 */
const RAMP = [
  "#eeead2",
  "#d8d5e0",
  "#bcbad0",
  "#9b9cc0",
  "#7c7eae",
  "#5f6299",
  "#4a4e8f",
  "#343873",
];

export type HeatCell = {
  row: string;
  column: string;
  value: number;
  detail?: Array<{ label: string; value: string }>;
};

export function Heatmap({
  cells,
  rows,
  columns,
  rowLabels,
  columnLabels,
  valueLabel = "Count",
  cellHeight = 34,
  labelWidth = 150,
}: {
  cells: HeatCell[];
  rows: string[];
  columns: string[];
  rowLabels?: Record<string, string>;
  columnLabels?: Record<string, string>;
  valueLabel?: string;
  cellHeight?: number;
  labelWidth?: number;
}) {
  const { tooltip, setTooltip, hide } = useTooltip();

  const lookup = new Map(cells.map((c) => [`${c.row}|${c.column}`, c]));
  const max = Math.max(...cells.map((c) => c.value), 1);
  const padTop = 26;
  const padRight = 8;
  const height = rows.length * cellHeight + padTop + 8;
  const gap = 2;

  const colorOf = (value: number) => {
    if (value <= 0) return "var(--color-surface-2)";
    const step = Math.min(
      RAMP.length - 1,
      Math.max(1, Math.round((value / max) * (RAMP.length - 1))),
    );
    return RAMP[step];
  };

  return (
    <ChartFrame height={height}>
      {(width) => {
        const plotWidth = width - labelWidth - padRight;
        const cellWidth = plotWidth / columns.length;

        return (
          <>
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`Heatmap of ${valueLabel.toLowerCase()} across ${rows.length} rows and ${columns.length} columns`}
              onMouseLeave={hide}
            >
              {columns.map((column, i) => (
                <text
                  key={column}
                  x={labelWidth + i * cellWidth + cellWidth / 2}
                  y={16}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--color-ink-subtle)"
                >
                  {columnLabels?.[column] ?? column}
                </text>
              ))}

              {rows.map((row, r) => (
                <g key={row}>
                  <text
                    x={labelWidth - 12}
                    y={padTop + r * cellHeight + cellHeight / 2 + 4}
                    textAnchor="end"
                    fontSize={12}
                    fill="var(--color-ink-muted)"
                  >
                    {rowLabels?.[row] ?? row}
                  </text>
                  {columns.map((column, c) => {
                    const cell = lookup.get(`${row}|${column}`);
                    const value = cell?.value ?? 0;
                    const x = labelWidth + c * cellWidth;
                    const y = padTop + r * cellHeight;
                    return (
                      <g
                        key={column}
                        onMouseEnter={() =>
                          setTooltip({
                            x: x + cellWidth / 2,
                            y,
                            title: `${rowLabels?.[row] ?? row} · ${columnLabels?.[column] ?? column}`,
                            rows: [
                              { label: valueLabel, value: int(value) },
                              ...(cell?.detail ?? []),
                            ],
                          })
                        }
                      >
                        <rect
                          x={x}
                          y={y}
                          width={Math.max(1, cellWidth - gap)}
                          height={cellHeight - gap}
                          rx={3}
                          fill={colorOf(value)}
                        />
                        {value > 0 ? (
                          <text
                            x={x + (cellWidth - gap) / 2}
                            y={y + cellHeight / 2 + 4}
                            textAnchor="middle"
                            fontSize={11}
                            className="tnum"
                            // Ink flips on the pale end of the ramp so the label
                            // always clears contrast against its own cell.
                            fill={
                              value / max > 0.55
                                ? "var(--color-surface)"
                                : "var(--color-ink)"
                            }
                          >
                            {value}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                </g>
              ))}
            </svg>
            <Tooltip state={tooltip} />
          </>
        );
      }}
    </ChartFrame>
  );
}

/** Legend for the ramp, since a colour scale needs one to be readable. */
export function HeatmapScale({ max, label }: { max: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-subtle">
        0
      </span>
      <span className="flex h-2.5 overflow-hidden rounded-full">
        {RAMP.map((color) => (
          <span key={color} className="w-6" style={{ background: color }} />
        ))}
      </span>
      <span className="tnum font-mono text-[10px] uppercase tracking-[0.08em] text-ink-subtle">
        {max} {label}
      </span>
    </div>
  );
}
