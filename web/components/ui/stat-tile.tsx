import { cn } from "@/lib/cn";

/**
 * A number that does not need a chart.
 *
 * Values use the font's default proportional figures. `tabular-nums` gives every
 * digit the width of a zero, which reads loose at display sizes; it belongs in
 * columns that align vertically, not on a standalone figure.
 */
export function StatTile({
  label,
  value,
  detail,
  hero = false,
  className,
}: {
  label: string;
  value: string;
  detail?: string;
  hero?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("bg-surface p-5", className)}>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </p>
      <p
        className={cn(
          "mt-2.5 font-medium tracking-tight text-ink",
          hero ? "text-4xl sm:text-5xl" : "text-2xl",
        )}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{detail}</p>
      ) : null}
    </div>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}
