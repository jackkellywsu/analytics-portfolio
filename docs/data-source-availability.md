# Data Source Availability Review

**Verified:** 2026-08-29 · **Reviewer:** Jack Kelly · **Method:** direct fetch of
vendor documentation and unauthenticated probe of the API endpoints.

This record exists because the project brief (`SPEC.md` §2) names PatentsView as the
primary data source. That source no longer exists in the form the brief assumes. The
finding, and the decision it forces, are documented here rather than silently worked
around.

## Finding 1 — The PatentsView API has been retired

`www.patentsview.org` now issues a `301` redirect to a USPTO transition guide. Per that
guide, the legacy PatentsView site began migrating to the USPTO Open Data Portal (ODP)
on **2026-03-20**. The PatentSearch API previously at `search.patentsview.org/api` is
down, and the guide states there is **no estimated launch date** for a replacement API.
Previously-issued PatentsView API keys are explicitly **not** compatible with ODP.

The host `search.patentsview.org` does not currently resolve in DNS.

> Source: https://data.uspto.gov/support/transition-guide/patentsview (retrieved 2026-08-29)

**Consequence:** the API-based extraction described in `SPEC.md` §6 Phase 1 is not
buildable as written. No amount of retry logic fixes a retired endpoint.

## Finding 2 — The underlying tables survived the migration intact

The PatentsView *bulk* tables were migrated to ODP and remain available. The three
tables this project needs are all in a single product:

| Table | Contents | ODP product |
|---|---|---|
| `g_patent` | Granted patents: id, grant date, title, abstract | `pvgpatdis` |
| `g_assignee_disambiguated` | Assignee org names, already disambiguated by USPTO | `pvgpatdis` |
| `g_cpc_current` | Current CPC classification per patent | `pvgpatdis` |

> Source: https://data.uspto.gov/bulkdata/datasets/pvgpatdis

This is a **better** foundation than the retired API for this project's purposes:

- Full population rather than a paginated sample. The old API capped a query at
  100,000 results; the scoring model in §3 wants every patent in the target sectors.
- A versioned file with a fixed release date is a stronger provenance record than a
  sequence of API calls whose results drift between runs.
- `g_assignee_disambiguated` carries USPTO's own disambiguation, which gives the
  assignee-normalization work in §2 a published baseline to be measured against
  rather than asserted over. That materially strengthens the Phase 2 deliverable.

## Finding 3 — Access now requires an authenticated USPTO.gov account

Two separate gates, with very different friction:

| Path | What it requires | What it unlocks |
|---|---|---|
| **Website download** | USPTO.gov account + MFA. Sign-in required to reach ODP since **2026-06-18**. No identity verification. | Manual download of bulk files. USPTO states plainly: *data products on the website download without an API key.* |
| **Bulk Datasets API** | The above **plus** a linked, identity-verified **ID.me** account (government ID; video call if outside the US). | Programmatic download; `X-API-KEY` header; 60 req/min. |

Probed unauthenticated on 2026-08-29 — both return `401 {"message":"Unauthorized"}`:

```
GET https://api.uspto.gov/api/v1/datasets/products/pvgpatdis
GET https://api.uspto.gov/api/v1/datasets/products/search?q=pvgpatdis
```

> Source: https://data.uspto.gov/apis/getting-started (retrieved 2026-08-29)

An unused ODP API key is deleted after 90 days.

## Finding 4 — CourtListener is unchanged in character

The brief already scopes CourtListener to "a small illustrative sample only" and warns
that full access now requires membership. Nothing found here contradicts that. It stays
a Phase 3 enrichment, not a dependency. Not yet independently re-verified.

## Decision required

The pipeline cannot be written against a live API. It will be written against local
bulk files. What remains open is whether acquiring those files is a **documented manual
step** or an **automated step**, which depends on whether an ODP API key exists.

This is recorded as an open decision, not an assumption. See `README.md` once resolved.
