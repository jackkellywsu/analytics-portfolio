"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Shared chart machinery.
 *
 * Charts render at the container's true pixel width rather than scaling a fixed
 * viewBox. Scaling an SVG shrinks its text along with its geometry, which is how
 * charts end up with four-pixel axis labels on a phone.
 */

export function useMeasuredWidth<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  number,
] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth((current) => (Math.abs(current - next) > 0.5 ? next : current));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

export type TooltipState = {
  x: number;
  y: number;
  title: string;
  rows: Array<{ label: string; value: string }>;
} | null;

export function useTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const hide = useCallback(() => setTooltip(null), []);

  // A tooltip left open when the pointer leaves via a scroll or a tab change is
  // a common source of stuck overlays.
  useEffect(() => {
    if (!tooltip) return;
    window.addEventListener("scroll", hide, { passive: true });
    return () => window.removeEventListener("scroll", hide);
  }, [tooltip, hide]);

  return { tooltip, setTooltip, hide };
}

export function Tooltip({ state }: { state: TooltipState }) {
  if (!state) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute z-20 min-w-40 -translate-x-1/2 -translate-y-full rounded border border-border-strong bg-surface-3 px-3 py-2 shadow-lg"
      style={{ left: state.x, top: state.y - 10 }}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink">
        {state.title}
      </p>
      <dl className="mt-1.5 space-y-0.5">
        {state.rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4 text-xs">
            <dt className="text-ink-subtle">{row.label}</dt>
            <dd className="tnum font-mono text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Vertical hairline gridlines with tick labels, drawn behind the marks. */
export function XGrid({
  ticks,
  scale,
  top,
  bottom,
  format,
}: {
  ticks: number[];
  scale: (value: number) => number;
  top: number;
  bottom: number;
  format: (value: number) => string;
}) {
  return (
    <g aria-hidden="true">
      {ticks.map((tick, i) => (
        <g key={`${i}-${tick}`}>
          <line
            x1={scale(tick)}
            x2={scale(tick)}
            y1={top}
            y2={bottom}
            stroke="var(--color-grid)"
            strokeWidth={1}
          />
          <text
            x={scale(tick)}
            y={bottom + 16}
            textAnchor="middle"
            className="tnum"
            fontSize={11}
            fill="var(--color-ink-subtle)"
          >
            {format(tick)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Horizontal hairline gridlines with tick labels on the left. */
export function YGrid({
  ticks,
  scale,
  left,
  right,
  format,
}: {
  ticks: number[];
  scale: (value: number) => number;
  left: number;
  right: number;
  format: (value: number) => string;
}) {
  return (
    <g aria-hidden="true">
      {ticks.map((tick, i) => (
        <g key={`${i}-${tick}`}>
          <line
            x1={left}
            x2={right}
            y1={scale(tick)}
            y2={scale(tick)}
            stroke="var(--color-grid)"
            strokeWidth={1}
          />
          <text
            x={left - 8}
            y={scale(tick) + 4}
            textAnchor="end"
            className="tnum"
            fontSize={11}
            fill="var(--color-ink-subtle)"
          >
            {format(tick)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Nice round tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (max <= min) return [min];
  const span = max - min;
  const rawStep = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * magnitude);
  const step = candidates.find((c) => c >= rawStep) ?? candidates[candidates.length - 1];
  const start = Math.ceil(min / step) * step;

  const ticks: number[] = [];
  for (let value = start; value <= max + step * 1e-9; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}

/**
 * A rounded-data-end bar path: 4px radius on the value end, square at the
 * baseline. Rounding both ends detaches the mark from its axis.
 */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  orientation: "horizontal" | "vertical",
  radius = 4,
): string {
  if (orientation === "horizontal") {
    const r = Math.min(radius, Math.max(0, width), height / 2);
    if (width <= 0) return "";
    return [
      `M ${x} ${y}`,
      `H ${x + width - r}`,
      `Q ${x + width} ${y} ${x + width} ${y + r}`,
      `V ${y + height - r}`,
      `Q ${x + width} ${y + height} ${x + width - r} ${y + height}`,
      `H ${x}`,
      "Z",
    ].join(" ");
  }
  const r = Math.min(radius, width / 2, Math.max(0, height));
  if (height <= 0) return "";
  return [
    `M ${x} ${y + height}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `H ${x + width - r}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `V ${y + height}`,
    "Z",
  ].join(" ");
}

export function ChartFrame({
  children,
  height,
}: {
  children: (width: number) => ReactNode;
  height: number;
}) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="relative w-full" style={{ minHeight: height }}>
      {width > 0 ? children(width) : null}
    </div>
  );
}
