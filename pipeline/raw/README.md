# `pipeline/raw/` — cached source data

Contents are gitignored. Everything here is reproducible from the documented source
below; nothing here is authored by this project.

## What to download

All three tables live in one ODP bulk product, **`pvgpatdis`**
("PatentsView granted patent disambiguated"):

> https://data.uspto.gov/bulkdata/datasets/pvgpatdis

You must be signed into a USPTO.gov account to reach that page (required since
2026-06-18). No API key and no ID.me verification are needed for a website download.

Download the files backing these three tables and drop them in this directory
**exactly as downloaded** — do not rename, unzip, or re-encode them. The inspector
reads archives directly and records a checksum of the file as USPTO published it.

| Table | Why this project needs it |
|---|---|
| `g_patent` | Grant date and patent id — the spine of every trailing-window metric |
| `g_assignee_disambiguated` | Assignee organization names — the unit the scoring model ranks |
| `g_cpc_current` | CPC classification — how patents map to practice-area sectors |

Also grab the **data dictionary** from the "Documents and Resources" sidebar on that
page if one is offered, and save it to `docs/`. Field definitions belong in the repo.

## Then run

```
.venv/Scripts/python.exe -m pipeline.inspect_raw
```

That writes a provenance record to `docs/provenance/` recording the file names, sizes,
SHA-256 checksums, column headers, and row counts of whatever is actually present —
no assumptions about packaging. Read its output before any transformation is written.

## Note on record date

ODP publishes these tables as periodic releases. Record the **release/version date
shown on the ODP page at time of download**, not the date you happened to download.
The inspector will prompt for it and store it in the provenance record.
