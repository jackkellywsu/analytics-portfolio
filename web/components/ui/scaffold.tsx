import { Container } from "./container";
import { Panel } from "./panel";

/**
 * Shown on routes whose build phase has not landed yet. It says what is coming
 * and what it will be built from — an honest placeholder beats lorem ipsum or,
 * worse, plausible-looking fake numbers.
 */
export function Scaffold({
  phase,
  building,
}: {
  phase: number;
  building: string[];
}) {
  return (
    <Container wide className="py-16">
      <Panel className="max-w-2xl p-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-caution">
          Phase {phase} — not yet built
        </p>
        <p className="mt-4 text-ink-muted">
          This page is scaffolded but has no content yet. It deliberately shows
          nothing rather than placeholder numbers: every figure on this site has
          to trace to a real source, and none exist for this page yet.
        </p>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-subtle">
          Planned
        </p>
        <ul className="mt-3 space-y-2 text-sm text-ink-muted">
          {building.map((item) => (
            <li key={item} className="flex gap-3">
              <span className="mt-2 h-px w-4 shrink-0 bg-border-strong" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </Container>
  );
}
