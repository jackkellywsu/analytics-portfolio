"""Source registry and acquisition.

Acquisition sits behind one interface so that swapping a mirror, pinning a
version, or replacing a source later does not touch anything downstream. Each
entry records what the data actually is — including when it is synthetic, which
the site states plainly rather than quietly benefiting from.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import kagglehub
import polars as pl

from pipeline.provenance import FileRecord, ProvenanceRecord, sha256_of, utc_now


@dataclass(frozen=True)
class KaggleSource:
    key: str
    slug: str
    title: str
    publisher: str
    nature: Literal["real", "synthetic"]
    notes: str
    gaps: tuple[str, ...]
    expected_files: tuple[str, ...]

    @property
    def url(self) -> str:
        return f"https://www.kaggle.com/datasets/{self.slug}"


SOURCES: dict[str, KaggleSource] = {
    "crm_pipeline": KaggleSource(
        key="crm_pipeline",
        slug="innocentmfa/crm-sales-opportunities",
        title="CRM Sales Opportunities",
        publisher="Maven Analytics (via Kaggle mirror)",
        nature="synthetic",
        notes=(
            "A fictitious B2B hardware vendor's sales pipeline, published by Maven "
            "Analytics as a teaching dataset. Three independent Kaggle mirrors carry "
            "byte-identical files, which is how the mirror was verified against the "
            "original. It is used here for pipeline shape — stages, cycle time, quota "
            "attainment — and never for a claim that depends on the data being real."
        ),
        gaps=(
            "The data is synthetic. No finding here describes a real market.",
            "Covers 2017 only, so there is no multi-year trend to read.",
            "Deal values are list prices; no discounting, margin, or cost of sale.",
            "No marketing touch history, so nothing upstream of the opportunity is visible.",
        ),
        expected_files=(
            "accounts.csv",
            "products.csv",
            "sales_pipeline.csv",
            "sales_teams.csv",
            "data_dictionary.csv",
        ),
    ),
    "olist_funnel": KaggleSource(
        key="olist_funnel",
        slug="olistbr/marketing-funnel-olist",
        title="Marketing Funnel by Olist",
        publisher="Olist",
        nature="real",
        notes=(
            "Real marketing-qualified leads and closed deals from Olist, a Brazilian "
            "marketplace, covering its acquisition of sellers as business clients. "
            "Joins to the Olist e-commerce dataset on seller id, which is what makes "
            "lead-to-revenue attribution possible rather than just lead counting."
        ),
        gaps=(
            "Leads are marketing-qualified only; anything before qualification is absent.",
            "Anonymised sales reps, so rep-level findings cannot be validated externally.",
            "Brazilian marketplace, mid-2017 to end-2018 — not a legal-services market.",
            "Declared monthly revenue is self-reported by the lead and is unverified.",
        ),
        expected_files=(
            "olist_marketing_qualified_leads_dataset.csv",
            "olist_closed_deals_dataset.csv",
        ),
    ),
    "olist_commerce": KaggleSource(
        key="olist_commerce",
        slug="olistbr/brazilian-ecommerce",
        title="Brazilian E-Commerce Public Dataset by Olist",
        publisher="Olist",
        nature="real",
        notes=(
            "~100k real orders across nine related tables. Used here for what a "
            "seller actually billed after being acquired, which turns the funnel data "
            "into an attribution problem instead of a conversion-rate problem."
        ),
        gaps=(
            "Order values are anonymised and rescaled by the publisher.",
            "Review comments are in Portuguese.",
            "Geolocation is zip-prefix level, so it cannot identify a customer.",
            "Sellers acquired late in the window have little realised revenue yet, "
            "which biases any lifetime-value figure downward for recent cohorts.",
        ),
        expected_files=(
            "olist_orders_dataset.csv",
            "olist_order_items_dataset.csv",
            "olist_order_payments_dataset.csv",
            "olist_order_reviews_dataset.csv",
            "olist_customers_dataset.csv",
            "olist_sellers_dataset.csv",
            "olist_products_dataset.csv",
            "olist_geolocation_dataset.csv",
            "product_category_name_translation.csv",
        ),
    ),
}


def fetch(source: KaggleSource) -> Path:
    """Download (or reuse the cache for) a source and return its directory."""
    return Path(kagglehub.dataset_download(source.slug))


def _portable_cache_path(directory: Path) -> str:
    """Record the cache location without the local user's home directory in it.

    These records are published on the site, and an absolute Windows path would
    put a username on a public page while telling a reader nothing useful.
    """
    parts = directory.parts
    if "kagglehub" in parts:
        index = parts.index("kagglehub")
        return "~/.cache/" + "/".join(parts[index:])
    return directory.name


def inspect(source: KaggleSource, directory: Path) -> ProvenanceRecord:
    """Report what is actually in the downloaded files.

    This asserts nothing about packaging. It reads the real headers and counts
    rows quote-aware, because several Olist columns contain embedded newlines and
    a naive line count is wrong by thousands.
    """
    records: list[FileRecord] = []
    for name in sorted(p.name for p in directory.glob("*.csv")):
        path = directory / name
        frame = pl.read_csv(path, infer_schema_length=0)
        records.append(
            FileRecord(
                name=name,
                bytes=path.stat().st_size,
                sha256=sha256_of(path),
                rows=frame.height,
                columns=frame.columns,
            )
        )

    missing = sorted(set(source.expected_files) - {r.name for r in records})
    if missing:
        msg = f"{source.slug}: expected files absent from download: {missing}"
        raise FileNotFoundError(msg)

    return ProvenanceRecord(
        key=source.key,
        source=f"{source.title} — {source.publisher}",
        url=source.url,
        slug=source.slug,
        nature=source.nature,
        pulled_at=utc_now(),
        cache_path=_portable_cache_path(directory),
        files=records,
        notes=source.notes,
        gaps=list(source.gaps),
    )
