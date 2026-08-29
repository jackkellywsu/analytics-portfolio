# AI-Enabled Analytics Portfolio

Two projects built on real USPTO patent data:

1. **Business Development Targeting Engine** — a transparent, decomposable score
   ranking companies by near-term demand signals for IP legal services.
2. **Governed Semantic Layer** — a documented entity/metric layer over that data,
   with natural-language access and deliberate refusal behavior.

The full brief is in [SPEC.md](SPEC.md). Ground rules that govern everything here:
every number is real and traceable, model limitations are stated on the page, and the
semantic layer is the artifact rather than the chat box.

**Status:** Phase 1 (pipeline foundation) — awaiting source data download.

## Data source

The brief names PatentsView as the primary source. **The PatentsView API was retired
on 2026-03-20** and has no announced replacement. The underlying tables survived the
migration to the USPTO Open Data Portal and are the source used here. The full
verification record, including what was probed and when, is in
[docs/data-source-availability.md](docs/data-source-availability.md).

| | |
|---|---|
| Source | USPTO Open Data Portal, product `pvgpatdis` |
| Tables | `g_patent`, `g_assignee_disambiguated`, `g_cpc_current` |
| Access | Manual download from the ODP website (USPTO.gov account + MFA) |
| Location | https://data.uspto.gov/bulkdata/datasets/pvgpatdis |

Acquisition is abstracted behind `pipeline/sources.py`, so the ODP Bulk Datasets API
can replace the manual download later without touching downstream code. That path
needs an API key, which needs ID.me identity verification; it is currently a stub.

## Reproducing

Requires Python 3.14+.

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
```

Download the three tables into `pipeline/raw/` following
[pipeline/raw/README.md](pipeline/raw/README.md), then:

```bash
.venv/Scripts/python.exe -m pipeline.inspect_raw --release <ODP release date>
```

This checksums each file as published, reports real column headers and quote-aware
record counts, and writes a provenance record to `docs/provenance/`. It asserts
nothing about packaging — it reports what is actually there.

## Layout

```
pipeline/          extraction, normalization, scoring
  raw/             source files as downloaded (gitignored)
  processed/       cleaned, governed datasets
  semantic/        the layer definition
  sources.py       acquisition paths behind one interface
  provenance.py    provenance records (SPEC.md 1.4)
  inspect_raw.py   Phase 1: inspect source files, emit provenance
site/              static site source
docs/              methodology writeups, provenance records
```

## Data quality note

`g_assignee_disambiguated` carries USPTO's own assignee disambiguation. This project
does **not** treat that as finished work — Phase 2 measures the residual normalization
error against it and reports the count of affected records, rather than assuming the
published disambiguation is complete.
