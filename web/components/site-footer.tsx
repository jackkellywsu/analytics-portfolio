import Link from "next/link";
import { NAV_ROUTES, RESUME_HREF, SITE } from "@/lib/routes";
import { Container } from "./ui/container";

const GROUPS = ["Dashboards", "AI systems", "Evidence"] as const;

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border bg-surface/40">
      <Container wide className="py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="font-display text-2xl">{SITE.name}</p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
              Business intelligence and applied AI. Every figure on this site is
              computed from a documented source, and every method is on the page.
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs text-ink-muted">
              <a href={`mailto:${SITE.email}`} className="hover:text-accent">
                {SITE.email}
              </a>
              <a href={SITE.linkedin} target="_blank" rel="noreferrer" className="hover:text-accent">
                LinkedIn
              </a>
              <a href={RESUME_HREF} download className="hover:text-accent">
                Résumé (PDF)
              </a>
            </div>
          </div>

          {GROUPS.map((group) => (
            <nav key={group} aria-label={group}>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
                {group}
              </p>
              <ul className="mt-3 space-y-2">
                {NAV_ROUTES.filter((r) => r.group === group).map((r) => (
                  <li key={r.href}>
                    <Link href={r.href} className="text-sm text-ink-muted hover:text-accent">
                      {r.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 font-mono text-[11px] text-ink-subtle">
          <p>{SITE.location}</p>
          <p>
            Built with Next.js and DuckDB-WASM.{" "}
            <Link href="/methods" className="hover:text-accent">
              Methods and provenance
            </Link>
          </p>
        </div>
      </Container>
    </footer>
  );
}
