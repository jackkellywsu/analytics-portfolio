# Jack Kelly — BI & Applied AI Portfolio

**Live:** https://analytics-portfolio-umber.vercel.app

A working portfolio, not a slide deck. Four things it sets out to demonstrate:

1. **Governed dashboards on real data** — a B2B business-development pipeline and a
   lead-to-revenue attribution model with a transparent, re-weightable prospect score.
2. **A natural-language interface over a semantic layer** — questions translate to SQL
   against published entity and metric definitions, and the SQL is always shown.
3. **Guardrails a non-technical user can be trusted with** — input screening, a semantic
   whitelist, SQL AST validation, and deliberate refusal when the data cannot answer.
4. **Statistical evaluation of model output** — text-to-SQL accuracy and extraction
   consistency benchmarked with confidence intervals, paired significance tests, an error
   taxonomy, and calibration curves.

## Ground rules

- **Every number is real and traceable.** Each page carries a provenance block: source,
  files, pull date, record count, known gaps. Where a dataset is itself synthetic, the page
  says so plainly.
- **Limitations live next to the results**, not in a footnote.
- **The model does not do the thinking.** The semantic layer, the prompts, and the
  guardrails are the work; the model is a fast executor inside constraints someone authored.
- **You can check the work.** Generated SQL, metric definitions, test cases, and statistical
  methods are all visible, and the pipeline reproduces every figure from one command.

## Architecture

The language model never touches the data. It writes SQL against a semantic layer; that SQL
executes in the visitor's own browser via DuckDB-WASM over Parquet files. No database to run,
no data egress, sub-100ms queries, and a much smaller attack surface — the only SQL that
reaches the data is SQL a validator already approved against a whitelist.

```
pipeline/     Python: acquisition, cleaning, scoring, evaluation
  raw/        downloaded as-is (gitignored)
  processed/  Parquet outputs
  evals/      benchmark harness, test cases, scorers, statistics
semantic/     layer definitions: entities, metrics, joins, refusal rules
web/          Next.js app (App Router, TypeScript, Tailwind v4)
docs/         methodology writeups, data dictionary, eval protocol
```

## Running locally

```bash
npm --prefix web install
npm --prefix web run dev
```

The site runs at http://localhost:3000. No API key or database is needed to browse it;
the live natural-language demo falls back to a cached gallery of pre-run examples when no
key is configured.

To regenerate the data from source, put a Kaggle API token at `~/.kaggle/access_token`
and run:

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m pipeline.acquire
.venv/Scripts/python.exe -m pipeline.build_crm
.venv/Scripts/python.exe -m pipeline.build_olist
.venv/Scripts/python.exe -m pipeline.build_manifest
.venv/Scripts/python.exe -m pipeline.build_dashboards
.venv/Scripts/python.exe -m pipeline.build_attribution
```

`acquire` downloads each source and writes a provenance record with per-file checksums
and quote-aware row counts. The `build_*` scripts clean each source and write a quality
log recording every rule applied and the rows it touched. `build_manifest` publishes the
Parquet and generates the data dictionary the site renders — so the dictionary cannot
drift from what actually shipped.

## Build status

| Phase | Scope | State |
|---|---|---|
| 1 | Foundation — design system, layout, routes | ✅ done |
| 2 | Data pipeline, provenance, DuckDB-WASM | ✅ done |
| 3 | Dashboards | ✅ done |
| 4 | Semantic layer, natural-language interface, guardrails | next |
| 5 | Evaluation lab | not started |
| 6 | Anomaly detection, methods, about, polish | not started |

Prior, abandoned work on a USPTO patent dataset is preserved on the
`archive/uspto-portfolio` branch. That effort stopped when the PatentsView API was retired.
