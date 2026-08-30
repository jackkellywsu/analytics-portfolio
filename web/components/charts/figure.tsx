import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TableView = {
  columns: string[];
  rows: Array<Array<string | number>>;
};

/**
 * Every chart on the site is wrapped in one of these.
 *
 * The table view is not optional decoration: a chart that can only be read by
 * eye excludes screen-reader users and anyone who needs the exact number, and a
 * tooltip is not a substitute because it gates the value behind a hover. The
 * disclosure keeps the table out of the way without making it unavailable.
 */
export function Figure({
  title,
  subtitle,
  children,
  table,
  note,
  className,
  legend,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  table?: TableView;
  note?: ReactNode;
  className?: string;
  legend?: ReactNode;
}) {
  return (
    <figure
      className={cn("rounded-lg border border-border bg-surface p-5 sm:p-6", className)}
    >
      <figcaption className="mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h3 className="text-[15px] font-medium text-ink">{title}</h3>
          {legend}
        </div>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            {subtitle}
          </p>
        ) : null}
      </figcaption>

      {children}

      {note ? (
        <p className="mt-5 max-w-2xl border-t border-border pt-4 text-sm leading-relaxed text-ink-subtle">
          {note}
        </p>
      ) : null}

      {table ? (
        <details className="group mt-4">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.08em] text-ink-subtle marker:content-[''] hover:text-ink">
            <span className="group-open:hidden">Show the numbers</span>
            <span className="hidden group-open:inline">Hide the numbers</span>
          </summary>
          <div className="scroll-panel mt-3 max-h-80 overflow-auto rounded border border-border">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="sticky top-0 bg-surface-2">
                <tr>
                  {table.columns.map((column, i) => (
                    <th
                      key={column}
                      scope="col"
                      className={cn(
                        "whitespace-nowrap border-b border-border px-3 py-2 font-mono text-[10px] font-normal uppercase tracking-[0.06em] text-ink-subtle",
                        i > 0 && "text-right",
                      )}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={cn(
                          "whitespace-nowrap px-3 py-1.5",
                          j === 0
                            ? "text-ink-muted"
                            : "tnum text-right font-mono text-ink",
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </figure>
  );
}

/** Identity key for two or more series. A single series never gets one. */
export function Legend({
  items,
}: {
  items: Array<{ label: string; color: string }>;
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
            style={{ background: item.color }}
          />
          <span className="text-xs text-ink-muted">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
