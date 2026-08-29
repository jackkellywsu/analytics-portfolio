# Portfolio Project Spec — AI-Enabled Analytics Portfolio

**For execution in Claude Code.** This document is the brief. Hand it to Claude Code at the start of the project and keep it in the repo root as `SPEC.md` so it stays in context across sessions.

---

## 0. Purpose and Audience

**Who sees this:** hiring managers and talent acquisition leads at law firms and professional services organizations, plus anyone evaluating me for data governance, analytics, or applied-AI roles. Assume they are smart, non-technical or semi-technical, and give the site 90 seconds before deciding whether to keep reading.

**What it must prove**, in this order:

1. I understand a business well enough to know which problems are worth solving.
2. I can turn raw, unstructured public data into a governed, trustworthy dataset.
3. I can encode that understanding so an AI tool can act on it reliably.

That is the same three-part argument as my resume and cover letter. The portfolio is the evidence.

**What it must not do:** look like a generic data-viz showcase. Charts are not the point. The point is judgment, governance, and the encoding step.

---

## 1. Non-Negotiable Ground Rules

These are the most important constraints in this document. Violating them makes the portfolio worse than not having one.

### 1.1 Every number must be real and traceable

No synthetic data. No illustrative placeholders that could be mistaken for findings. Every figure on the site traces to a specific API call or bulk file, and the site says where it came from and when it was pulled.

If a section needs sample data during development, label it `SAMPLE — NOT REAL` in the UI until real data replaces it, and never deploy with that label present.

### 1.2 State the model's limits on the page

The prospect-scoring model uses patent activity as a proxy for legal services demand. That proxy has real weaknesses: it says nothing about who already has outside counsel, it lags reality by the grant delay, and it over-weights companies that patent heavily for cultural rather than strategic reasons.

**Say all of that on the page.** A visible limitations section is a hiring signal, not a weakness. It demonstrates exactly the judgment the job requires and it preempts the objection an interviewer would otherwise raise.

### 1.3 Never claim the AI did the thinking

The semantic layer demo shows an AI executing against a governed dataset using context I authored. The framing is that the encoding work is what makes the AI useful. Do not imply the model discovered anything on its own.

### 1.4 Data provenance block on every project page

Source name, endpoint or file, query parameters, date pulled, record count, and known gaps. This is a governance portfolio; the provenance block is part of the demonstration.

---

## 2. Data Sources

### Primary: PatentsView (USPTO)

- Registration: `patentsview.org/apis` — free API key
- Coverage: all granted US patents. Utility, design, plant, reissue.
- Useful fields: assignee organization, grant date, CPC classification, title, abstract, inventor
- Bulk downloads available without a key, which is better for volume work
- **Known limits:** granted patents only, no pending applications; grant lag means recent activity is under-represented; assignee names need normalization (e.g. "Google LLC" vs "Google Inc.")

### Secondary: CourtListener (Free Law Project)

- Free account provides an API token, but the free request allowance is small and full access including PACER data now requires a membership
- **Use for a small illustrative sample only.** Do not architect anything that needs volume here.
- Good for: a handful of IP litigation examples to enrich top-scored companies

### Optional enrichment

- SEC EDGAR full-text search and company facts API — free, no key, good for public company revenue and sector
- BLS and Census County Business Patterns — free, useful for industry sizing
- USPTO Open Data Portal — free but requires a USPTO.gov account with MFA as of mid-2026

### Assignee normalization is a real task, not a footnote

Company names in patent data are inconsistent. Building the normalization mapping *is* part of the data quality demonstration. Document the rules, show the before/after count, and surface how many records the mapping affected. This is the most portfolio-relevant part of the whole pipeline.

---

## 3. Project One — Business Development Targeting Engine

### The business framing

A law firm's IP practice needs to know which companies to call. Most firms rely on relationships, referrals, and whoever happens to read the news. The question this answers: *which companies show the strongest signals of near-term demand for IP legal services, ranked, with reasoning?*

This mirrors the panelist-acquisition work: stop contacting broadly, score prospects on data you already have access to, and concentrate effort where it is most likely to convert.

### Scope

Filter to sectors matching a target firm's practice. For Foley: Energy, Health Care & Life Sciences, Innovative Technology, Manufacturing. Map each to CPC classification prefixes and document the mapping — the mapping decisions are analyst judgment and should be visible.

### Scoring model

Build a transparent, explainable score. No black box. Components to consider:

| Signal | Rationale | Notes |
| --- | --- | --- |
| Filing volume (trailing 3y) | Baseline IP activity | Normalize by company size where possible |
| Filing velocity (YoY change) | Growth signals new legal need | The strongest single signal |
| Technology concentration | Focused portfolios suggest strategic IP programs | Use HHI across CPC classes |
| Portfolio recency | Recent activity beats historical volume | Weight recent years more |
| Geographic fit | Proximity to office locations | Optional; relevant for a specific firm |

**Requirements:** weights must be visible and adjustable in the UI. Every score must decompose into its components on drill-down. A reviewer should be able to disagree with a weighting and see what changes.

### Deliverable

A ranked prospect table with per-company drill-down showing score decomposition, filing trend, top CPC areas, and any litigation sample found. Plus a short written analysis of what the data says and what it cannot say.

---

## 4. Project Two — Governed Semantic Layer with Natural Language Access

### The point of this project

**The semantic layer is the artifact, not the chat box.** Anyone can wire a chat input to an LLM. The differentiator is the governed layer underneath: documented entities, defined metrics, explicit allowed joins, and refusal behavior when a question falls outside what the data can answer.

Design the page so the layer is at least as visible as the answers.

### Components

1. **The layer definition itself**, displayed on the page. YAML or JSON defining entities, dimensions, metrics with explicit formulas, allowed relationships, and business definitions in plain language. Make it readable and make it the centerpiece.

2. **A query interface** that takes a natural language question, translates it against the layer, and returns an answer.

3. **The generated query, always shown.** Every answer displays the structured query that produced it, so a reviewer can verify rather than trust.

4. **Refusal behavior, demonstrated deliberately.** Include example questions the layer correctly declines because the data cannot support them. This is the governance demonstration. A system that answers everything is a system that lies sometimes.

5. **A short written explanation** of why the layer exists: without it, an LLM pointed at raw patent data produces confident nonsense, because it does not know that assignee names need normalization or that grant dates lag filing dates.

### API key problem — read this before architecting

A public static site cannot safely hold an LLM API key. Client-side keys are extractable. Options, in order of preference:

1. **Serverless proxy** (Vercel or Netlify function) holding the key server-side, with strict rate limiting and a short allowlist of permitted operations. Best experience, some setup.
2. **Pre-run example gallery** — a curated set of questions with their real generated queries and real answers, computed ahead of time and cached as JSON, clearly labeled as pre-run, with the full source code linked. Zero cost, zero risk, and honest.
3. **Local live demo** — the repo runs live on my laptop with my key for interviews, while the public site shows option 2.

**Recommendation: ship option 2 publicly and keep option 3 ready for interviews.** Option 1 only if cost and abuse controls are settled.

---

## 5. The Resume Integration

The request was for the resume to appear "in a fun way," and there is an on-theme option worth considering: treat my career as a governed dataset with its own small semantic layer, queryable the same way as the patent data. Questions like "what has he done with data quality" or "where has he applied AI" return structured answers from a documented layer.

**Caution:** this is either delightful or too clever depending on execution. Build it only after both real projects work, and only if it stays fast and obviously navigable. Always include a plain "Download resume (PDF)" button, prominently. Some readers want the document, not the experience, and making them play a game to get it will annoy exactly the wrong people.

---

## 6. Technical Approach

### Recommended stack

- **Data pipeline:** Python. pandas for transformation, requests for API access, results cached to local parquet or JSON so the site never calls the API at page load.
- **Site:** static. Astro or plain Vite + React. No backend unless a serverless function is added for the live query option.
- **Charts:** whatever is lightweight and readable. Charts support the argument; they are not the argument.
- **Hosting:** GitHub Pages or Vercel, both free. Vercel if serverless functions are needed.
- **Repo:** public on GitHub. The code being readable is part of the portfolio.

### Repository structure

```
/pipeline          Python: extraction, normalization, scoring
  /raw             Cached API responses, gitignored if large
  /processed       Cleaned, governed datasets
  /semantic        The layer definition
/site              Static site source
/docs              Methodology writeups, provenance records
SPEC.md            This document
README.md          What this is, how to run it, what the data is
```

### Build phases

**Phase 1 — Pipeline foundation.** Get the API key, pull a small sample, understand the response shape. Build the extraction script with caching and rate-limit handling. *Checkpoint: a reproducible pull with a documented provenance record.*

**Phase 2 — Data quality work.** Assignee normalization, CPC mapping to sectors, deduplication. Document every rule and count every record affected. *Checkpoint: a written data quality report showing before/after and known remaining gaps.*

**Phase 3 — Scoring model.** Build it, make weights configurable, make scores decompose. Write the limitations section honestly. *Checkpoint: a ranked list I can defend in an interview.*

**Phase 4 — Semantic layer.** Define entities, metrics, and allowed joins over the processed data. Build the translation and the refusal behavior. *Checkpoint: correct answers to ten questions, and correct refusals on five.*

**Phase 5 — Site.** Two project pages, a short about page, resume download. Provenance blocks throughout. *Checkpoint: loads fast, reads clearly, works on a phone.*

**Phase 6 — Resume integration and polish.** Only after phases 1–5 are done.

---

## 7. Definition of Done

The site is finished when:

- Every number traces to a documented source with a pull date
- The scoring model's weights are visible and adjustable
- The limitations section is honest enough that an interviewer's first objection is already answered on the page
- The semantic layer is readable on the page, not hidden behind a chat box
- The system visibly refuses at least one question it cannot answer
- The resume PDF downloads in one click from anywhere on the site
- The repo README explains how to reproduce every result
- It loads in under two seconds and works on a phone

---

## 8. What to Tell Claude Code at the Start

> I'm building a portfolio site demonstrating data governance and applied AI, using real USPTO patent data. The full brief is in SPEC.md — read it before proposing an approach. Ground rules: all data must be real and traceable, model limitations must be stated visibly on the page, and the semantic layer is the centerpiece rather than the chat interface. Start with Phase 1 and check in with me at each phase checkpoint before proceeding.
