"""Clean the CRM sales-pipeline source into governed tables.

    .venv/Scripts/python.exe -m pipeline.build_crm

The tables stay normalised rather than flattened into one wide table. Real joins
are the point: the text-to-SQL benchmark is only meaningful if a model has to
resolve relationships, and a pre-joined table would quietly do that work for it.
"""

from __future__ import annotations

from pathlib import Path

import polars as pl

from pipeline.quality import QualityLog
from pipeline.sources import SOURCES, fetch

PROCESSED = Path(__file__).resolve().parent / "processed"

# Sector labels as published contain one misspelling. It is consistent — there
# is no correctly spelled "technology" to merge with — so this is a relabel, not
# a deduplication, and it is recorded as such.
SECTOR_FIXES = {"technolgy": "technology"}

# The pipeline table refers to a product the product table does not define. The
# spacing variant is unambiguous: "GTXPro" against a catalogue containing
# "GTX Pro" and no other candidate. Left unfixed it silently drops 1,480
# opportunities from any product join.
PRODUCT_FIXES = {"GTXPro": "GTX Pro"}


def build() -> dict[str, pl.DataFrame]:
    source = SOURCES["crm_pipeline"]
    raw = fetch(source)

    accounts = _accounts(raw)
    products = _products(raw)
    teams = _teams(raw)
    opportunities = _opportunities(raw, products)

    return {
        "crm_accounts": accounts,
        "crm_products": products,
        "crm_sales_teams": teams,
        "crm_opportunities": opportunities,
    }


def _accounts(raw: Path) -> pl.DataFrame:
    df = pl.read_csv(raw / "accounts.csv")
    log = QualityLog(dataset="crm_accounts", rows_in=df.height)

    misspelled = df.filter(pl.col("sector").is_in(list(SECTOR_FIXES))).height
    df = df.with_columns(pl.col("sector").replace(SECTOR_FIXES))
    log.record(
        "sector_spelling",
        "Sector label misspelled at source. No correctly spelled variant exists "
        "to merge with, so this relabels rather than deduplicates.",
        misspelled,
        before="technolgy",
        after="technology",
    )

    orphans = df["subsidiary_of"].null_count()
    log.record(
        "parent_account_missing",
        "Accounts with no parent company. This is meaningful absence, not a "
        "defect — most accounts are independent — so it is left null rather "
        "than filled.",
        orphans,
        severity="flagged",
    )

    df = df.rename({"revenue": "revenue_musd", "subsidiary_of": "parent_account"})
    log.rows_out = df.height
    log.write()
    print(log.report())
    return df


def _products(raw: Path) -> pl.DataFrame:
    df = pl.read_csv(raw / "products.csv").rename({"sales_price": "list_price"})
    log = QualityLog(dataset="crm_products", rows_in=df.height, rows_out=df.height)
    log.write()
    print(log.report())
    return df


def _teams(raw: Path) -> pl.DataFrame:
    df = pl.read_csv(raw / "sales_teams.csv")
    log = QualityLog(dataset="crm_sales_teams", rows_in=df.height, rows_out=df.height)
    log.write()
    print(log.report())
    return df


def _opportunities(raw: Path, products: pl.DataFrame) -> pl.DataFrame:
    df = pl.read_csv(raw / "sales_pipeline.csv")
    log = QualityLog(dataset="crm_opportunities", rows_in=df.height)

    unmatched = df.filter(pl.col("product").is_in(list(PRODUCT_FIXES))).height
    df = df.with_columns(pl.col("product").replace(PRODUCT_FIXES))
    log.record(
        "product_name_variant",
        "Pipeline rows referenced 'GTXPro', which the product catalogue does not "
        "define. The catalogue contains 'GTX Pro' and no other candidate, so the "
        "spacing variant is unambiguous. Left unfixed, these rows drop out of "
        "every product join.",
        unmatched,
        before="GTXPro",
        after="GTX Pro",
    )

    still_unmatched = (
        df.join(products.select("product"), on="product", how="anti")["product"]
        .unique()
        .to_list()
    )
    if still_unmatched:
        msg = f"product names with no catalogue entry after cleaning: {still_unmatched}"
        raise ValueError(msg)

    df = df.with_columns(
        pl.col("engage_date").str.to_date("%Y-%m-%d", strict=False),
        pl.col("close_date").str.to_date("%Y-%m-%d", strict=False),
    )

    # close_value is 0 for lost deals and null for open ones. Those mean
    # different things and collapsing them would put 2,473 zeros into any
    # average deal size.
    log.record(
        "lost_deal_zero_value",
        "Lost deals carry close_value = 0. That is a real outcome, not a missing "
        "value, but it must be excluded from deal-size averages or it drags them "
        "toward zero. Kept as 0 and flagged via is_won.",
        df.filter(pl.col("deal_stage") == "Lost").height,
        severity="flagged",
    )
    log.record(
        "open_deal_null_value",
        "Open deals (Prospecting, Engaging) have no close_value or close_date. "
        "Left null so that open pipeline is never counted as booked revenue.",
        df.filter(pl.col("close_value").is_null()).height,
        severity="flagged",
    )
    log.record(
        "prospecting_no_engage_date",
        "Every Prospecting opportunity lacks an engage_date, so cycle time is "
        "undefined for them by construction rather than by data loss.",
        df.filter(pl.col("engage_date").is_null()).height,
        severity="flagged",
    )
    log.record(
        "opportunity_without_account",
        "Opportunities with no account named. Confined to open stages, which is "
        "consistent with an account being attached later in the process. Left "
        "null; any account-level metric must exclude them explicitly.",
        df["account"].null_count(),
        severity="flagged",
    )

    df = df.with_columns(
        (pl.col("deal_stage") == "Won").alias("is_won"),
        pl.col("deal_stage").is_in(["Won", "Lost"]).alias("is_closed"),
        (pl.col("close_date") - pl.col("engage_date")).dt.total_days().alias("cycle_days"),
    )

    negative = df.filter(pl.col("cycle_days") < 0).height
    log.record(
        "negative_cycle_time",
        "Opportunities closing before they were engaged would indicate a source "
        "defect. Checked explicitly.",
        negative,
        severity="flagged" if negative else "fixed",
    )

    log.rows_out = df.height
    log.write()
    print(log.report())
    return df


def main() -> int:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    for name, frame in build().items():
        path = PROCESSED / f"{name}.parquet"
        frame.write_parquet(path, compression="zstd")
        print(f"  wrote {path.name:<28} {frame.height:>7,} rows  {path.stat().st_size / 1024:>7.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
