import { Container } from "./container";
import { Badge } from "./badge";

export function PageHeader({
  eyebrow,
  title,
  blurb,
  status,
}: {
  eyebrow?: string;
  title: string;
  blurb?: string;
  status?: React.ReactNode;
}) {
  return (
    <header className="border-b border-border bg-surface/40">
      <Container wide className="py-14 sm:py-20">
        <div className="max-w-3xl">
          {eyebrow ? (
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl">
            {title}
          </h1>
          {blurb ? (
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted">
              {blurb}
            </p>
          ) : null}
          {status ? <div className="mt-7">{status}</div> : null}
        </div>
      </Container>
    </header>
  );
}

export function PhaseBadge({ phase }: { phase: number }) {
  return <Badge tone="caution">Phase {phase} — in development</Badge>;
}
