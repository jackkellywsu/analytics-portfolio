import { cn } from "@/lib/cn";

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  meta,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-3.5",
        className,
      )}
    >
      <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-muted">
        {title}
      </h3>
      {meta ? <div className="text-xs text-ink-subtle">{meta}</div> : null}
    </div>
  );
}
