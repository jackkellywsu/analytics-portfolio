"""Compute the lead-to-revenue attribution aggregates.

    .venv/Scripts/python.exe -m pipeline.build_attribution

Two corrections carry this page, and both exist because the obvious version of
the analysis is wrong:

1. Right-censoring. The commerce data stops before the last deals close, so
   deals won late have little or no window in which revenue could appear. A
   single attachment rate across all of them reads as a performance finding
   when it is an artefact of the observation window.

2. Small-sample ranking. Sorting segments by conversion rate puts whichever
   tiny segment got lucky on top. Shrinkage fixes that at the estimate rather
   than in a footnote nobody reads.
"""

from __future__ import annotations

import json
import math

import polars as pl

from pipeline.build_dashboards import OUT, load, rate
from pipeline.stats import (
    fit_beta_prior,
    histogram,
    quantile,
    shrink_group_means,
    summarise,
)

ATTRIBUTION_WINDOW_DAYS = 90


def build() -> dict:
    leads = load("funnel_leads")
    outcomes = load("deal_outcomes")

    complete = outcomes.filter(pl.col("window_complete"))

    headline = {
        "leads": leads.height,
        "deals": outcomes.height,
        "conversion": rate(outcomes.height, leads.height),
        "naive_attachment": rate(int(outcomes["ever_sold"].sum()), outcomes.height),
        "corrected_attachment": rate(int(complete["ever_sold"].sum()), complete.height),
        "complete_deals": complete.height,
        "censored_deals": outcomes.height - complete.height,
        "window_days": ATTRIBUTION_WINDOW_DAYS,
        "revenue_90d_total": float(complete["revenue_90d"].sum()),
        "median_revenue_converting": float(
            complete.filter(pl.col("revenue_90d") > 0)["revenue_90d"].median() or 0
        ),
        "median_days_to_close": float(outcomes["days_to_close"].median()),
        "lead_window": [
            str(leads["first_contact_date"].min()),
            str(leads["first_contact_date"].max()),
        ],
        "won_window": [
            str(outcomes["won_date"].min())[:10],
            str(outcomes["won_date"].max())[:10],
        ],
    }

    cohorts = []
    grouped = (
        outcomes.with_columns(pl.col("won_date").dt.strftime("%Y-%m").alias("cohort"))
        .group_by("cohort")
        .agg(
            pl.len().alias("deals"),
            pl.col("ever_sold").sum().alias("attached"),
            pl.col("days_observed").median().alias("median_days_observed"),
            pl.col("window_complete").mean().alias("share_complete"),
        )
        .sort("cohort")
    )
    for row in grouped.to_dicts():
        cohorts.append(
            {
                "cohort": row["cohort"],
                "deals": row["deals"],
                "attached": int(row["attached"]),
                "rate": rate(int(row["attached"]), row["deals"]),
                "median_days_observed": float(row["median_days_observed"]),
                "window_complete": bool(row["share_complete"] >= 0.5),
            }
        )

    # Conversion uses every lead: nothing about a lead becoming a deal is
    # censored. Revenue uses only complete-window deals. Dividing a censored
    # revenue total by a full lead count would quietly understate every channel,
    # so the two halves are measured separately and multiplied.
    channels = []
    for origin in sorted(leads["origin"].unique().to_list()):
        channel_leads = leads.filter(pl.col("origin") == origin).height
        channel_deals = outcomes.filter(pl.col("origin") == origin)
        channel_complete = channel_deals.filter(pl.col("window_complete"))
        revenue_per_deal = (
            float(channel_complete["revenue_90d"].mean()) if channel_complete.height else 0.0
        )
        conversion = rate(channel_deals.height, channel_leads)
        channels.append(
            {
                "origin": origin,
                "leads": channel_leads,
                "deals": channel_deals.height,
                "conversion": conversion,
                "complete_deals": channel_complete.height,
                "attachment": rate(
                    int(channel_complete["ever_sold"].sum()), channel_complete.height
                )
                if channel_complete.height
                else rate(0, 0),
                "revenue_90d": float(channel_complete["revenue_90d"].sum()),
                "revenue_per_deal": revenue_per_deal,
                "revenue_per_lead": conversion["point"] * revenue_per_deal,
            }
        )
    channels.sort(key=lambda c: c["revenue_per_lead"], reverse=True)

    segment_rows = (
        complete.filter(pl.col("business_segment").is_not_null())
        .group_by("business_segment")
        .agg(
            pl.len().alias("deals"),
            pl.col("ever_sold").sum().alias("attached"),
            pl.col("revenue_90d").mean().alias("revenue_per_deal"),
            pl.col("revenue_90d").sum().alias("revenue_90d"),
            pl.col("days_to_close").median().alias("median_days_to_close"),
        )
        .sort("deals", descending=True)
    ).to_dicts()

    prior = fit_beta_prior([(int(r["attached"]), r["deals"]) for r in segment_rows])

    # Value has to be conditioned and transformed before it can be shrunk.
    #
    # Revenue in this window is zero-inflated - the median client bills nothing
    # in 90 days - so a segment mean mixes "how often a client converts" with
    # "what a converting client is worth", and the first of those is already a
    # separate component. Conditioning on converters separates them.
    #
    # What remains is heavily right-skewed: 289 converting clients, a median of
    # R$324 and a maximum of R$75,730. Shrinking those means on the linear scale
    # does almost nothing, because one extreme segment inflates the between-group
    # variance that the estimator reads as evidence the differences are real.
    # On the log scale it behaves: revenue like this is multiplicative, and the
    # result is a shrunk typical value rather than a mean one whale can set.
    converters: dict[str, list[float]] = {
        row["business_segment"]: [] for row in segment_rows
    }
    for row in complete.filter(pl.col("revenue_90d") > 0).select(
        "business_segment", "revenue_90d"
    ).to_dicts():
        if row["business_segment"] in converters:
            converters[row["business_segment"]].append(float(row["revenue_90d"]))

    log_shrunk = shrink_group_means(
        {key: [math.log(v) for v in values] for key, values in converters.items()}
    )

    segments = []
    for row in segment_rows:
        name = row["business_segment"]
        attached = int(row["attached"])
        won = converters[name]
        segments.append(
            {
                "segment": name,
                "deals": row["deals"],
                "attached": attached,
                "attachment_raw": round(attached / row["deals"], 5),
                "attachment_shrunk": round(prior.shrink(attached, row["deals"]), 5),
                "attachment_interval": rate(attached, row["deals"]),
                "converters": len(won),
                # Raw mean kept alongside the shrunk value so the page can show
                # what shrinkage did rather than assert that it helped.
                "revenue_per_converter_raw": round(sum(won) / len(won), 2) if won else 0.0,
                "revenue_per_converter_shrunk": round(math.exp(log_shrunk[name]), 2),
                "revenue_per_deal": float(row["revenue_per_deal"]),
                "revenue_90d": float(row["revenue_90d"]),
                "median_days_to_close": float(row["median_days_to_close"] or 0),
            }
        )

    converting = [
        float(v) for v in complete.filter(pl.col("revenue_90d") > 0)["revenue_90d"].to_list()
    ]
    days_to_close = [float(d) for d in outcomes["days_to_close"].drop_nulls().to_list()]

    return {
        "headline": headline,
        "cohorts": cohorts,
        "channels": channels,
        "segments": segments,
        "prior": {
            "alpha": round(prior.alpha, 4),
            "beta": round(prior.beta, 4),
            "mean": round(prior.mean, 5),
            "strength": round(prior.strength, 2),
        },
        "days_to_close": {
            "summary": summarise(days_to_close),
            "histogram": histogram(days_to_close, bin_width=30, cap=540),
        },
        "revenue_concentration": {
            "converting_clients": len(converting),
            "percentiles": {
                str(int(q * 100)): round(quantile(converting, q), 2)
                for q in (0.25, 0.5, 0.75, 0.9, 0.99)
            },
            "top_decile_share": round(
                sum(sorted(converting, reverse=True)[: max(1, len(converting) // 10)])
                / sum(converting),
                4,
            )
            if converting
            else 0.0,
        },
    }


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    payload = build()
    path = OUT / "attribution.json"
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    h = payload["headline"]
    print(f"attribution.json -> {path.stat().st_size / 1024:.0f} KB")
    print(f"  {h['leads']:,} leads -> {h['deals']:,} deals ({h['conversion']['point']:.1%})")
    print(
        f"  attachment: naive {h['naive_attachment']['point']:.1%} across all deals, "
        f"corrected {h['corrected_attachment']['point']:.1%} across {h['complete_deals']} "
        f"with a full {h['window_days']}-day window "
        f"({h['censored_deals']} censored)"
    )
    p = payload["prior"]
    print(f"  beta prior: mean {p['mean']:.1%}, strength {p['strength']:.1f} pseudo-deals")
    rc = payload["revenue_concentration"]
    print(
        f"  {rc['converting_clients']} clients produced revenue; "
        f"top decile took {rc['top_decile_share']:.0%} of it"
    )
    print(f"  {len(payload['segments'])} segments, {len(payload['channels'])} channels")
    print("  value component, raw mean vs shrunk typical (converting clients only):")
    for seg in sorted(
        payload["segments"], key=lambda s: -s["revenue_per_converter_raw"]
    )[:4]:
        print(
            f"    {seg['segment']:<26} {seg['converters']:>3} converters  "
            f"raw R${seg['revenue_per_converter_raw']:>10,.0f}  "
            f"shrunk R${seg['revenue_per_converter_shrunk']:>8,.0f}"
        )
    for c in payload["channels"][:5]:
        print(
            f"    {c['origin']:<18} {c['leads']:>5} leads  conv {c['conversion']['point']:>5.1%}  "
            f"R${c['revenue_per_lead']:>7.2f}/lead"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
