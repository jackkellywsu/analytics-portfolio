import { cn } from "@/lib/cn";

const TONES = {
  neutral: "border-border text-ink-muted",
  accent: "border-accent/40 text-accent",
  positive: "border-positive/40 text-positive",
  negative: "border-negative/40 text-negative",
  caution: "border-caution/40 text-caution",
  info: "border-info/40 text-info",
} as const;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: keyof typeof TONES;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
        "font-mono text-[11px] uppercase tracking-[0.08em]",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
