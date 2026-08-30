"use client";

import { ChartFrame, Tooltip, useTooltip } from "./primitives";
import { int } from "@/lib/format";

/**
 * Sequential heatmap.
 *
 * One hue, ordered light to dark — except the ordering is inverted for a dark
 * surface. On a light ground the palest step means "near zero" because it
 * recedes toward the page; on this ground the palest step is the loudest thing
 * on screen, so the ramp runs from near-surface (nothing) to bright (a lot).
 * Using a light-to-dark ramp unchanged here would make empty cells shout.
 *
 * Never a rainbow: multi-hue ramps invent category boundaries where the data
 * has a continuum.
 */
const RAMP = [
  "#11161f",
  "#12314f",
  "#154272",
  "#1c5cab",
  "#2a78d6",
  "#5598e7",
  "#86b6ef",
  "#b7d3f6",
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
                              value / max > 0.62
                                ? "var(--color-bg)"
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
