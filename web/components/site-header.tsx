"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_ROUTES, RESUME_HREF, SITE } from "@/lib/routes";
import { cn } from "@/lib/cn";
import { Container } from "./ui/container";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Lock scroll while the sheet is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/85 backdrop-blur-md">
      <Container wide className="flex h-16 items-center justify-between gap-6">
        <Link href="/" className="group flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded border border-border-strong bg-surface-2 font-mono text-xs font-medium text-accent transition-colors group-hover:border-accent">
            JK
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm leading-tight font-medium">{SITE.name}</span>
            <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
              {SITE.role}
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV_ROUTES.map((route) => {
            const active = pathname === route.href;
            return (
              <Link
                key={route.href}
                href={route.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors",
                  active
                    ? "bg-surface-2 text-accent"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                {route.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ResumeButton />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="grid h-9 w-9 place-items-center rounded border border-border text-ink-muted hover:text-ink lg:hidden"
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <MenuIcon open={open} />
          </button>
        </div>
      </Container>

      {open ? (
        <div id="mobile-nav" className="border-t border-border bg-bg lg:hidden">
          <Container wide className="py-4">
            <ul className="divide-y divide-border">
              {NAV_ROUTES.map((route) => (
                <li key={route.href}>
                  <Link
                    href={route.href}
                    onClick={() => setOpen(false)}
                    className="flex flex-col gap-1 py-3.5"
                    aria-current={pathname === route.href ? "page" : undefined}
                  >
                    <span
                      className={cn(
                        "font-mono text-xs uppercase tracking-[0.1em]",
                        pathname === route.href ? "text-accent" : "text-ink",
                      )}
                    >
                      {route.label}
                    </span>
                    <span className="text-sm leading-snug text-ink-subtle">
                      {route.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </div>
      ) : null}
    </header>
  );
}

function ResumeButton() {
  return (
    <a
      href={RESUME_HREF}
      download
      className="inline-flex items-center gap-2 rounded border border-accent/40 bg-accent/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-accent transition-colors hover:bg-accent hover:text-bg"
    >
      Résumé
      <svg
        width="11"
        height="11"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          d="M6 1v8m0 0L3 6m3 3l3-3M1.5 10.5h9"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {open ? (
        <path
          d="M3.5 3.5l9 9m0-9l-9 9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M2 4.5h12M2 11.5h12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
