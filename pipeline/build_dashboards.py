"""Compute dashboard aggregates at build time.

    .venv/Scripts/python.exe -m pipeline.build_dashboards

The dashboards render from these pre-computed figures rather than querying in
the browser. That is a deliberate split: the 36MB WebAssembly engine earns its
download on /methods and /ask, where running arbitrary SQL is the point, but a
dashboard should paint immediately and work with JavaScript disabled. Interactive
re-weighting still happens client-side, over a few hundred rows of JSON.

Every proportion published here carries a Wilson interval. A ranked list of rates
without them invites a reader to act on noise, which is exactly what this
dashboard is arguing against.
"""

from __future__ import annotations

import json
from pathlib import Path

import polars as pl

from pipeline.stats import histogram, summarise, wilson

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "pipeline" / "processed"
OUT = ROOT / "web" / "public" / "data"


def load(name: str) -> pl.DataFrame:
    return pl.read_parquet(PROCESSED / f"{name}.parquet")


def rate(successes: int, trials: int) -> dict:
    interval = wilson(successes, trials)
    return {"n": trials, "successes": successes, **interval.as_dict()}


def build_pipeline() -> dict:
    opps = load("crm_opportunities")
    accounts = load("crm_accounts")
    products = load("crm_products")
    teams = load("crm_sales_teams")

    closed = opps.filter(pl.col("is_closed"))
    won = opps.filter(pl.col("is_won"))
    open_deals = opps.filter(~pl.col("is_closed"))

    # Open deals carry no value at all, so pipeline value has to be imputed.
    # List price is the honest choice: it is the only figure the data supports,
    # and the page says so rather than presenting it as booked.
    open_valued = open_deals.join(products, on="product", how="left")

    headline = {
        "won_value": float(won["close_value"].sum()),
        "won_deals": won.height,
        "closed_deals": closed.height,
        "open_deals": open_deals.height,
        "open_pipeline_list_value": float(open_valued["list_price"].sum()),
        "win_rate": rate(won.height, closed.height),
        "median_cycle_days": float(won["cycle_days"].median()),
        "accounts": accounts.height,
        "agents": teams.height,
        "median_won_value": float(won["close_value"].median()),
    }

    stage_order = ["Prospecting", "Engaging", "Won", "Lost"]
    stages = [
        {
            "stage": stage,
            "count": opps.filter(pl.col("deal_stage") == stage).height,
        }
        for stage in stage_order
    ]

    # Win rate by sector, the page's central point: the ranking looks
    # meaningful until the intervals go on.
    by_sector = []
    joined = closed.join(accounts, on="account", how="inner")
    for sector in sorted(joined["sector"].unique().to_list()):
        rows = joined.filter(pl.col("sector") == sector)
        wins = rows.filter(pl.col("is_won"))
        by_sector.append(
            {
                "sector": sector,
                "rate": rate(wins.height, rows.height),
                "won_value": float(wins["close_value"].sum()),
                "median_won_value": float(wins["close_value"].median() or 0),
            }
        )
    by_sector.sort(key=lambda r: r["rate"]["point"], reverse=True)

    pooled = rate(closed.filter(pl.col("is_won")).height, closed.height)
    all_overlap_pooled = all(
        s["rate"]["low"] <= pooled["high"] and pooled["low"] <= s["rate"]["high"]
        for s in by_sector
    )

    by_series = []
    series_joined = closed.join(products, on="product", how="inner")
    for series in sorted(series_joined["series"].unique().to_list()):
        rows = series_joined.filter(pl.col("series") == series)
        wins = rows.filter(pl.col("is_won"))
        by_series.append(
            {
                "series": series,
                "rate": rate(wins.height, rows.height),
                "median_list_price": float(rows["list_price"].median()),
            }
        )
    by_series.sort(key=lambda r: r["rate"]["point"], reverse=True)

    # Cycle time by outcome. Lost deals carry a close date too, so the question
    # "how long does a deal take to die" is answerable and is the more useful
    # number for a pipeline review.
    cycle = {}
    day_totals: dict[str, list[float]] = {}
    for label, frame in (("Won", won), ("Lost", closed.filter(~pl.col("is_won")))):
        days = [float(d) for d in frame["cycle_days"].drop_nulls().to_list()]
        day_totals[label] = days
        cycle[label] = {
            "summary": summarise(days),
            "histogram": histogram(days, bin_width=10, cap=150),
            "share_under_20d": len([d for d in days if d < 20]) / len(days),
            "share_over_60d": len([d for d in days if d > 60]) / len(days),
        }

    # Deal-days, not deal counts. A pipeline review that counts losses treats a
    # deal lost in a week the same as one lost after four months; the second one
    # is what actually costs the team.
    slow_threshold = 60
    lost_days = day_totals["Lost"]
    slow_losses = [d for d in lost_days if d >= slow_threshold]
    total_days = sum(day_totals["Won"]) + sum(lost_days)
    time_cost = {
        "slow_threshold_days": slow_threshold,
        "won_deal_days": sum(day_totals["Won"]),
        "lost_deal_days": sum(lost_days),
        "lost_share_of_all_days": sum(lost_days) / total_days,
        "slow_loss_count": len(slow_losses),
        "slow_loss_share_of_losses": len(slow_losses) / len(lost_days),
        "slow_loss_days": sum(slow_losses),
        "slow_loss_share_of_lost_days": sum(slow_losses) / sum(lost_days),
    }

    monthly = (
        closed.with_columns(pl.col("close_date").dt.strftime("%Y-%m").alias("month"))
        .group_by("month")
        .agg(
            pl.len().alias("closed"),
            pl.col("is_won").sum().alias("won"),
            pl.col("close_value").sum().alias("won_value"),
        )
        .sort("month")
    )
    monthly_rows = [
        {
            "month": r["month"],
            "closed": r["closed"],
            "won": r["won"],
            "won_value": float(r["won_value"]),
            "rate": rate(r["won"], r["closed"]),
        }
        for r in monthly.to_dicts()
    ]

    by_manager = []
    staffed = closed.join(teams, on="sales_agent", how="inner")
    for manager in sorted(staffed["manager"].unique().to_list()):
        rows = staffed.filter(pl.col("manager") == manager)
        wins = rows.filter(pl.col("is_won"))
        by_manager.append(
            {
                "manager": manager,
                "office": rows["regional_office"][0],
                "agents": rows["sales_agent"].n_unique(),
                "rate": rate(wins.height, rows.height),
                "won_value": float(wins["close_value"].sum()),
            }
        )
    by_manager.sort(key=lambda r: r["won_value"], reverse=True)

    by_product = []
    for row in products.sort("list_price").to_dicts():
        rows = won.filter(pl.col("product") == row["product"])
        values = [float(v) for v in rows["close_value"].to_list()]
        by_product.append(
            {
                "product": row["product"],
                "series": row["series"],
                "list_price": row["list_price"],
                "won": rows.height,
                "summary": summarise(values),
                "discount_vs_list": (
                    round(1 - (summarise(values)["median"] / row["list_price"]), 4)
                    if values
                    else None
                ),
            }
        )

    return {
        "headline": headline,
        "stages": stages,
        "by_sector": by_sector,
        "pooled_win_rate": pooled,
        "all_sectors_overlap_pooled": all_overlap_pooled,
        "by_series": by_series,
        "cycle": cycle,
        "time_cost": time_cost,
        "monthly": monthly_rows,
        "by_manager": by_manager,
        "by_product": by_product,
        "coverage": {
            "first_engage": str(opps["engage_date"].min()),
            "last_close": str(opps["close_date"].max()),
        },
    }


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    payload = build_pipeline()
    path = OUT / "pipeline.json"
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print(f"pipeline.json -> {path.stat().st_size / 1024:.0f} KB")
    h = payload["headline"]
    print(f"  won {h['won_deals']:,} of {h['closed_deals']:,} closed deals")
    print(
        f"  win rate {h['win_rate']['point']:.1%} "
        f"[{h['win_rate']['low']:.1%}, {h['win_rate']['high']:.1%}]"
    )
    print(f"  booked ${h['won_value']:,.0f}; open at list ${h['open_pipeline_list_value']:,.0f}")
    print(f"  every sector interval overlaps the pooled rate: {payload['all_sectors_overlap_pooled']}")
    t = payload["time_cost"]
    print(
        f"  {t['lost_share_of_all_days']:.0%} of all deal-days went to deals that were lost; "
        f"{t['slow_loss_share_of_losses']:.0%} of losses took {t['slow_threshold_days']}d+ "
        f"and consumed {t['slow_loss_share_of_lost_days']:.0%} of that time"
    )
    for s in payload["by_sector"][:3]:
        r = s["rate"]
        print(f"    {s['sector']:<20} {r['point']:.1%} [{r['low']:.1%}, {r['high']:.1%}]  n={r['n']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
