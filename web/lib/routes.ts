/**
 * The route registry is the single source of truth for navigation, page
 * headers, and the command palette. Adding a page means adding it here.
 */

export type Phase = 1 | 2 | 3 | 4 | 5 | 6;

export type Route = {
  href: string;
  /** Short label used in the top navigation. */
  label: string;
  /** Full page title used in the page header and <title>. */
  title: string;
  /** One line describing what the page demonstrates. */
  blurb: string;
  group: "Dashboards" | "AI systems" | "Evidence" | null;
  /** Build phase this page lands in. Pages past the current phase render a
   *  scaffold state rather than pretending to have content. */
  phase: Phase;
};

export const ROUTES: Route[] = [
  {
    href: "/",
    label: "Home",
    title: "Jack Kelly",
    blurb: "Business intelligence and applied AI, demonstrated rather than described.",
    group: null,
    phase: 1,
  },
  {
    href: "/pipeline",
    label: "Pipeline",
    title: "Business development pipeline",
    blurb:
      "An executive view of a B2B pipeline: win rates by segment, sales-cycle distribution, quota attainment, and where deals actually stall.",
    group: "Dashboards",
    phase: 3,
  },
  {
    href: "/attribution",
    label: "Attribution",
    title: "Lead-to-revenue attribution",
    blurb:
      "Which acquisition channels produce clients that generate revenue — and a transparent prospect score you can re-weight yourself.",
    group: "Dashboards",
    phase: 3,
  },
  {
    href: "/ask",
    label: "Ask",
    title: "Ask the data",
    blurb:
      "A natural-language interface over a governed semantic layer. The generated SQL is always shown, and it runs in your browser.",
    group: "AI systems",
    phase: 4,
  },
  {
    href: "/guardrails",
    label: "Guardrails",
    title: "Guardrails",
    blurb:
      "The validation chain that stands between a non-technical question and the database. Try to break it.",
    group: "AI systems",
    phase: 4,
  },
  {
    href: "/anomalies",
    label: "Anomalies",
    title: "Anomaly detection",
    blurb:
      "Automated detection over two real time series, validated by injecting anomalies of known size to measure what it would miss.",
    group: "AI systems",
    phase: 6,
  },
  {
    href: "/evals",
    label: "Evals",
    title: "Evaluation lab",
    blurb:
      "Benchmarking language models on structured analytical work — text-to-SQL accuracy and extraction consistency, with confidence intervals and an error taxonomy.",
    group: "Evidence",
    phase: 5,
  },
  {
    href: "/methods",
    label: "Methods",
    title: "Methods and provenance",
    blurb:
      "The data dictionary, the cleaning log, where every number came from, and a SQL console that runs in your browser.",
    group: "Evidence",
    phase: 2,
  },
  {
    href: "/about",
    label: "About",
    title: "About Jack",
    blurb: "Eleven years of turning expensive business problems into working systems.",
    group: null,
    phase: 6,
  },
];

export const NAV_ROUTES = ROUTES.filter((r) => r.href !== "/");

export function routeByHref(href: string): Route | undefined {
  return ROUTES.find((r) => r.href === href);
}

/** The highest phase currently shipped. Pages above this render a scaffold. */
export const CURRENT_PHASE: Phase = 6;

export const RESUME_HREF = "/Jack-Kelly-Resume.pdf";

export const SITE = {
  name: "Jack Kelly",
  role: "Business Intelligence & Applied AI",
  email: "jackkellywsu@gmail.com",
  linkedin: "https://linkedin.com/in/jackkellywsu",
  location: "Appleton, WI",
} as const;
