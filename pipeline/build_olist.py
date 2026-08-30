"""Clean the Olist funnel and commerce sources into governed tables.

    .venv/Scripts/python.exe -m pipeline.build_olist

The interesting output is `deal_outcomes`, which joins a closed deal to the
revenue that seller actually went on to generate. That join is what turns a
conversion-rate question into an attribution question, and it is also where the
data's main trap lives: the commerce window ends before the last deals close, so
a naive attachment rate is depressed by censoring rather than by performance.
"""

from __future__ import annotations

from pathlib import Path

import polars as pl

from pipeline.quality import QualityLog
from pipeline.sources import SOURCES, fetch

PROCESSED = Path(__file__).resolve().parent / "processed"

# Post-win window used for attributed revenue. Ninety days is long enough for a
# new seller to list and sell, and short enough that most won cohorts have a
# complete window inside the commerce data.
ATTRIBUTION_WINDOW_DAYS = 90


def build() -> dict[str, pl.DataFrame]:
    funnel = fetch(SOURCES["olist_funnel"])
    commerce = fetch(SOURCES["olist_commerce"])

    orders = _orders(commerce)
    order_items = _order_items(commerce)
    reviews = _reviews(commerce)
    products = _products(commerce)
    customers = _customers(commerce)
    sellers = _sellers(commerce)

    leads = _leads(funnel)
    deals = _deals(funnel, leads)

    seller_performance = _seller_performance(orders, order_items, reviews)
    deal_outcomes = _deal_outcomes(deals, orders, order_items)

    return {
        "funnel_leads": leads,
        "funnel_deals": deals,
        "deal_outcomes": deal_outcomes,
        "sellers": sellers,
        "seller_performance": seller_performance,
        "orders": orders,
        "order_items": order_items,
        "order_reviews": reviews,
        "products": products,
        "customers": customers,
    }


def _leads(funnel: Path) -> pl.DataFrame:
    df = pl.read_csv(funnel / "olist_marketing_qualified_leads_dataset.csv")
    log = QualityLog(dataset="funnel_leads", rows_in=df.height)

    missing_origin = df["origin"].null_count()
    log.record(
        "origin_missing_vs_unknown",
        "60 leads have a null origin and 1,099 carry the literal value 'unknown'. "
        "These are different facts - one is an unrecorded channel, the other is a "
        "channel recorded as unidentifiable - so they are kept apart rather than "
        "merged into one bucket.",
        missing_origin,
        severity="flagged",
    )

    df = df.with_columns(
        pl.col("first_contact_date").str.to_date("%Y-%m-%d", strict=False),
        pl.col("origin").fill_null("not_recorded"),
    )
    log.rows_out = df.height
    log.write()
    print(log.report())
    return df


def _deals(funnel: Path, leads: pl.DataFrame) -> pl.DataFrame:
    df = pl.read_csv(funnel / "olist_closed_deals_dataset.csv")
    log = QualityLog(dataset="funnel_deals", rows_in=df.height)

    df = df.with_columns(
        pl.col("won_date").str.to_datetime("%Y-%m-%d %H:%M:%S", strict=False)
    )

    orphans = df.join(leads.select("mql_id"), on="mql_id", how="anti").height
    log.record(
        "deal_without_lead",
        "Every closed deal resolves to a marketing-qualified lead, so the funnel "
        "join is complete. Checked rather than assumed.",
        orphans,
    )
    if orphans:
        msg = f"{orphans} closed deals have no matching lead"
        raise ValueError(msg)

    # lead_behaviour_profile is multi-valued in a handful of rows ("cat, wolf").
    # Splitting to a primary profile keeps it groupable while preserving the fact
    # that the original was multi-valued.
    multi = df.filter(pl.col("lead_behaviour_profile").str.contains(",")).height
    df = df.with_columns(
        pl.col("lead_behaviour_profile")
        .str.split(",")
        .list.first()
        .str.strip_chars()
        .alias("behaviour_primary"),
        pl.col("lead_behaviour_profile")
        .str.contains(",")
        .fill_null(False)
        .alias("behaviour_multi"),
    )
    log.record(
        "behaviour_profile_multivalued",
        "Some leads carry two behaviour profiles in one comma-separated field. "
        "Split to a primary profile for grouping, with a flag preserving that the "
        "original was multi-valued.",
        multi,
    )

    unusable = df.filter(pl.col("declared_monthly_revenue") == 0).height
    log.record(
        "declared_revenue_unusable",
        "declared_monthly_revenue is self-reported and unusable: the median and "
        "the 75th percentile are both zero while the maximum is 50,000,000. It is "
        "retained for transparency but excluded from every metric and from the "
        "prospect score.",
        unusable,
        severity="flagged",
    )

    sparse = {
        "has_company": df["has_company"].null_count(),
        "has_gtin": df["has_gtin"].null_count(),
        "average_stock": df["average_stock"].null_count(),
        "declared_product_catalog_size": df["declared_product_catalog_size"].null_count(),
    }
    detail = ", ".join(f"{k}: {v}" for k, v in sparse.items())
    log.record(
        "qualification_fields_sparse",
        f"Four qualification fields are ~92% null ({detail}). Too sparse to model "
        "on; kept for drill-down only.",
        max(sparse.values()),
        severity="flagged",
    )

    df = df.join(
        leads.select("mql_id", "first_contact_date", "origin", "landing_page_id"),
        on="mql_id",
        how="left",
    ).with_columns(
        (pl.col("won_date").dt.date() - pl.col("first_contact_date"))
        .dt.total_days()
        .alias("days_to_close"),
    )

    negative = df.filter(pl.col("days_to_close") < 0).height
    log.record(
        "negative_time_to_close",
        "Deals won before first contact would indicate a source defect. Checked "
        "explicitly.",
        negative,
        severity="flagged" if negative else "fixed",
    )

    log.rows_out = df.height
    log.write()
    print(log.report())
    return df


def _orders(commerce: Path) -> pl.DataFrame:
    df = pl.read_csv(commerce / "olist_orders_dataset.csv", try_parse_dates=True)
    log = QualityLog(dataset="orders", rows_in=df.height)
    cancelled = df.filter(pl.col("order_status") == "canceled").height
    log.record(
        "cancelled_orders_retained",
        "Cancelled orders are kept in the table but excluded from every revenue "
        "metric. Dropping them here would make the exclusion invisible to anyone "
        "reading a query.",
        cancelled,
        severity="flagged",
    )
    undelivered = df["order_delivered_customer_date"].null_count()
    log.record(
        "delivery_date_missing",
        "Orders with no delivery timestamp - cancelled, unavailable, or still in "
        "transit at the end of the window. Delivery metrics must exclude them.",
        undelivered,
        severity="flagged",
    )
    log.rows_out = df.height
    log.write()
    print(log.report())
    return df


def _order_items(commerce: Path) -> pl.DataFrame:
    df = pl.read_csv(commerce / "olist_order_items_dataset.csv", try_parse_dates=True)
    log = QualityLog(dataset="order_items", rows_in=df.height, rows_out=df.height)
    log.record(
        "line_level_grain",
        "One row per item line, not per order: an order with three items is three "
        "rows. Any per-order metric has to aggregate first or it will double count.",
        df.height,
        severity="flagged",
    )
    log.write()
    print(log.report())
    return df


def _reviews(commerce: Path) -> pl.DataFrame:
    df = pl.read_csv(commerce / "olist_order_reviews_dataset.csv", try_parse_dates=True)
    log = QualityLog(dataset="order_reviews", rows_in=df.height)
    with_text = int(df["review_comment_message"].is_not_null().sum())
    df = df.drop("review_comment_title", "review_comment_message")
    log.record(
        "review_text_dropped",
        f"{with_text:,} reviews carry Portuguese free text. It is dropped from the "
        "shipped table: no metric uses it, and it would inflate the download for a "
        "reader who cannot verify it anyway.",
        with_text,
        severity="dropped",
    )
    duplicated = df.height - df["review_id"].n_unique()
    log.record(
        "duplicate_review_ids",
        "review_id is not unique - a single review can attach to more than one "
        "order. Counting reviews by id would undercount.",
        duplicated,
        severity="flagged",
    )
    log.rows_out = df.height
    log.write()
    print(log.report())
    return df


def _products(commerce: Path) -> pl.DataFrame:
    df = pl.read_csv(commerce / "olist_products_dataset.csv")
    translation = pl.read_csv(commerce / "product_category_name_translation.csv")
    log = QualityLog(dataset="products", rows_in=df.height)

    df = df.rename(
        {
            "product_name_lenght": "product_name_length",
            "product_description_lenght": "product_description_length",
        }
    )
    log.record(
        "misspelled_source_columns",
        "Two columns are misspelled at source ('lenght'). Renamed, because a model "
        "writing SQL against this schema should not have to reproduce a typo to get "
        "a correct answer.",
        2,
        before="product_name_lenght",
        after="product_name_length",
    )

    df = df.join(translation, on="product_category_name", how="left")
    untranslated = df.filter(
        pl.col("product_category_name").is_not_null()
        & pl.col("product_category_name_english").is_null()
    ).height
    log.record(
        "category_untranslated",
        "Categories present in the product table but absent from the official "
        "translation file. Left with a null English name rather than a guessed one.",
        untranslated,
        severity="flagged",
    )
    log.record(
        "category_missing",
        "Products with no category at all.",
        df["product_category_name"].null_count(),
        severity="flagged",
    )
    log.rows_out = df.height
    log.write()
    print(log.report())
    return df


def _customers(commerce: Path) -> pl.DataFrame:
    df = pl.read_csv(commerce / "olist_customers_dataset.csv")
    log = QualityLog(dataset="customers", rows_in=df.height, rows_out=df.height)
    repeat = df.height - df["customer_unique_id"].n_unique()
    log.record(
        "customer_id_is_per_order",
        "customer_id identifies an order's customer record, not a person. "
        f"customer_unique_id does that, and {repeat:,} rows are repeat buyers. "
        "Counting customers by customer_id overstates the customer base.",
        repeat,
        severity="flagged",
    )
    log.write()
    print(log.report())
    return df


def _sellers(commerce: Path) -> pl.DataFrame:
    df = pl.read_csv(commerce / "olist_sellers_dataset.csv")
    log = QualityLog(dataset="sellers", rows_in=df.height, rows_out=df.height)
    log.write()
    print(log.report())
    return df


def _seller_performance(
    orders: pl.DataFrame, order_items: pl.DataFrame, reviews: pl.DataFrame
) -> pl.DataFrame:
    live = orders.filter(pl.col("order_status") != "canceled")
    joined = order_items.join(
        live.select("order_id", "order_purchase_timestamp"), on="order_id", how="inner"
    )
    perf = joined.group_by("seller_id").agg(
        pl.col("order_id").n_unique().alias("orders"),
        pl.len().alias("items"),
        pl.col("price").sum().round(2).alias("revenue_brl"),
        pl.col("freight_value").sum().round(2).alias("freight_brl"),
        pl.col("order_purchase_timestamp").min().alias("first_order_at"),
        pl.col("order_purchase_timestamp").max().alias("last_order_at"),
    )
    scores = (
        joined.select("order_id", "seller_id")
        .unique()
        .join(reviews.select("order_id", "review_score"), on="order_id", how="inner")
        .group_by("seller_id")
        .agg(
            pl.col("review_score").mean().round(3).alias("avg_review_score"),
            pl.len().alias("reviews"),
        )
    )
    perf = perf.join(scores, on="seller_id", how="left")

    log = QualityLog(
        dataset="seller_performance", rows_in=perf.height, rows_out=perf.height
    )
    log.record(
        "revenue_excludes_freight_and_cancellations",
        "Revenue is the sum of item price on non-cancelled orders. Freight is "
        "reported separately because it is a pass-through cost, not seller revenue.",
        perf.height,
    )
    log.write()
    print(log.report())
    return perf


def _deal_outcomes(
    deals: pl.DataFrame, orders: pl.DataFrame, order_items: pl.DataFrame
) -> pl.DataFrame:
    """Join each closed deal to the revenue that seller generated after winning.

    The censoring correction lives here. The commerce data stops before the last
    deals close, so deals won late have little or no window in which revenue
    could appear. Reporting a raw attachment rate across all deals reads as a
    performance finding when it is an artefact of the observation window.
    """
    live = orders.filter(pl.col("order_status") != "canceled")
    joined = order_items.join(
        live.select("order_id", "order_purchase_timestamp"), on="order_id", how="inner"
    )
    observation_end = joined["order_purchase_timestamp"].max()

    base = (
        deals.select(
            "mql_id",
            "seller_id",
            "won_date",
            "business_segment",
            "lead_type",
            "behaviour_primary",
            "business_type",
            "origin",
            "landing_page_id",
            "first_contact_date",
            "days_to_close",
            "sdr_id",
            "sr_id",
        )
        .with_columns(
            (pl.lit(observation_end) - pl.col("won_date"))
            .dt.total_days()
            .alias("days_observed"),
        )
        .with_columns(
            (pl.col("days_observed") >= ATTRIBUTION_WINDOW_DAYS).alias("window_complete"),
        )
    )

    windowed = (
        base.select("seller_id", "won_date")
        .join(
            joined.select("seller_id", "order_id", "price", "order_purchase_timestamp"),
            on="seller_id",
            how="inner",
        )
        .filter(
            (pl.col("order_purchase_timestamp") >= pl.col("won_date"))
            & (
                pl.col("order_purchase_timestamp")
                < pl.col("won_date").dt.offset_by(f"{ATTRIBUTION_WINDOW_DAYS}d")
            )
        )
        .group_by("seller_id")
        .agg(
            pl.col("price").sum().round(2).alias("revenue_90d"),
            pl.col("order_id").n_unique().alias("orders_90d"),
        )
    )
    lifetime = joined.group_by("seller_id").agg(
        pl.col("price").sum().round(2).alias("revenue_lifetime"),
        pl.col("order_id").n_unique().alias("orders_lifetime"),
    )

    out = (
        base.join(windowed, on="seller_id", how="left")
        .join(lifetime, on="seller_id", how="left")
        .with_columns(
            pl.col("revenue_90d").fill_null(0.0),
            pl.col("orders_90d").fill_null(0),
            pl.col("revenue_lifetime").fill_null(0.0),
            pl.col("orders_lifetime").fill_null(0),
        )
        .with_columns((pl.col("revenue_lifetime") > 0).alias("ever_sold"))
    )

    log = QualityLog(dataset="deal_outcomes", rows_in=out.height, rows_out=out.height)
    naive = out["ever_sold"].mean()
    complete = out.filter(pl.col("window_complete"))
    corrected = complete["ever_sold"].mean()
    log.record(
        "right_censoring",
        f"The commerce data ends {observation_end:%Y-%m-%d} while deals close "
        f"through {deals['won_date'].max():%Y-%m-%d}. Across all {out.height} deals "
        f"{naive:.1%} show any revenue, but that figure is depressed by deals with "
        f"no observation window. Restricted to the {complete.height} deals with a "
        f"full {ATTRIBUTION_WINDOW_DAYS}-day window the rate is {corrected:.1%}. "
        "Every attachment and revenue metric uses the restricted set.",
        out.height - complete.height,
        severity="flagged",
    )
    log.record(
        "deals_after_observation_end",
        "Deals won after the commerce data stops. They cannot show revenue by "
        "construction and are excluded from every rate.",
        out.filter(pl.col("days_observed") < 0).height,
        severity="flagged",
    )
    log.write()
    print(log.report())
    return out


def main() -> int:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    for name, frame in build().items():
        path = PROCESSED / f"{name}.parquet"
        frame.write_parquet(path, compression="zstd")
        size_kb = path.stat().st_size / 1024
        print(f"  wrote {path.name:<28} {frame.height:>7,} rows  {size_kb:>7.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
