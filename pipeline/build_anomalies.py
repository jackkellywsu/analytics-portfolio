"""Detect anomalies in the acquisition and order time series.

    .venv/Scripts/python.exe -m pipeline.build_anomalies

Three things have to be true before a detector's output is worth showing:

1. It has to separate structure from surprise. A Monday is not an anomaly for
   being busier than a Sunday, so weekly seasonality is removed before anything
   is flagged.
2. It has to be robust. The standard deviation is computed from the very
   outliers it is meant to find - one large spike inflates it, raising the
   threshold, hiding the spike. The median absolute deviation is used instead.
3. It has to be validated. Without labelled anomalies there is no recall to
   report, so this injects synthetic spikes of known size into the real residual
   series and measures how many come back. That gives a sensitivity curve: what
   size of event this detector would actually catch.

The order series contains a real, externally verifiable event - Black Friday,
24 November 2017 - which is the closest thing to ground truth available here.
"""

from __future__ import annotations

import json
import random
from datetime import date, timedelta
from pathlib import Path

import polars as pl

from pipeline.stats import mad, median, rolling_median

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "pipeline" / "processed"
OUT = ROOT / "web" / "public" / "data"

TREND_WINDOW = 29  # days, centred; wide enough not to absorb a single spike
THRESHOLD = 3.5  # robust sigmas


def load(name: str) -> pl.DataFrame:
    return pl.read_parquet(PROCESSED / f"{name}.parquet")


def daily_counts(dates: list[date]) -> tuple[list[str], list[float]]:
    """Dense daily series - days with no events must appear as zeros.

    Skipping empty days would hide the most interesting kind of anomaly, which
    is a day when the thing stopped happening entirely.
    """
    if not dates:
        return [], []
    counts: dict[date, int] = {}
    for d in dates:
        counts[d] = counts.get(d, 0) + 1
    start, end = min(counts), max(counts)
    out_dates: list[str] = []
    out_values: list[float] = []
    day = start
    while day <= end:
        out_dates.append(day.isoformat())
        out_values.append(float(counts.get(day, 0)))
        day += timedelta(days=1)
    return out_dates, out_values


def decompose(dates: list[str], values: list[float]) -> dict:
    """Trend, weekly seasonality, and what is left over."""
    trend = rolling_median(values, TREND_WINDOW)
    detrended = [v - t for v, t in zip(values, trend)]

    # Day-of-week effect, as a median so one unusual Tuesday cannot define
    # Tuesdays.
    by_weekday: dict[int, list[float]] = {i: [] for i in range(7)}
    for iso, value in zip(dates, detrended):
        by_weekday[date.fromisoformat(iso).weekday()].append(value)
    seasonal_by_weekday = {
        weekday: median(vals) if vals else 0.0 for weekday, vals in by_weekday.items()
    }
    seasonal = [seasonal_by_weekday[date.fromisoformat(d).weekday()] for d in dates]
    residual = [v - t - s for v, t, s in zip(values, trend, seasonal)]

    return {
        "trend": trend,
        "seasonal": seasonal,
        "seasonal_by_weekday": seasonal_by_weekday,
        "residual": residual,
    }


def flag(residual: list[float], threshold: float = THRESHOLD) -> tuple[list[float], float]:
    scale = mad(residual)
    centre = median(residual)
    if scale <= 0:
        return [0.0] * len(residual), 0.0
    return [(r - centre) / scale for r in residual], scale


def detect(name: str, label: str, dates: list[str], values: list[float]) -> dict:
    parts = decompose(dates, values)
    scores, scale = flag(parts["residual"])

    anomalies = []
    for i, score in enumerate(scores):
        if abs(score) < THRESHOLD:
            continue
        expected = parts["trend"][i] + parts["seasonal"][i]
        anomalies.append(
            {
                "date": dates[i],
                "weekday": date.fromisoformat(dates[i]).strftime("%A"),
                "observed": values[i],
                "expected": round(expected, 2),
                "difference": round(values[i] - expected, 2),
                "z": round(score, 2),
                "direction": "spike" if score > 0 else "drop",
                "neighbours": [
                    {"date": dates[j], "observed": values[j]}
                    for j in range(max(0, i - 3), min(len(dates), i + 4))
                    if j != i
                ],
            }
        )
    anomalies.sort(key=lambda a: -abs(a["z"]))

    return {
        "key": name,
        "label": label,
        "dates": dates,
        "values": values,
        "trend": [round(t, 2) for t in parts["trend"]],
        "expected": [
            round(t + s, 2) for t, s in zip(parts["trend"], parts["seasonal"])
        ],
        "z": [round(s, 2) for s in scores],
        "scale": round(scale, 3),
        "threshold": THRESHOLD,
        "anomalies": anomalies,
        "seasonal_by_weekday": {
            ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][k]: round(v, 2)
            for k, v in parts["seasonal_by_weekday"].items()
        },
        "n_days": len(dates),
    }


def sensitivity(
    dates: list[str],
    values: list[float],
    magnitudes: tuple[float, ...] = (1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0),
    trials: int = 200,
    seed: int = 20260830,
) -> list[dict]:
    """How big does an event have to be before this detector finds it?

    There are no labelled anomalies in this data, so recall cannot be measured
    directly. Instead a spike of known size is injected into the real series at a
    random date and the detector is re-run; the share of injections recovered is
    the detection rate at that size. This is an honest substitute for ground
    truth, and it makes the detector's blind spot explicit rather than leaving a
    reader to assume it has none.

    Injections land on quiet days only - dates that were not already flagged -
    so an injection is never credited to an anomaly that was already there.
    """
    rng = random.Random(seed)
    baseline = decompose(dates, values)
    baseline_scores, scale = flag(baseline["residual"])
    if scale <= 0:
        return []
    quiet = [i for i, s in enumerate(baseline_scores) if abs(s) < 2.0]
    if not quiet:
        return []

    rows = []
    for magnitude in magnitudes:
        detected = 0
        for _ in range(trials):
            index = rng.choice(quiet)
            injected = list(values)
            injected[index] += magnitude * scale
            scores, _ = flag(decompose(dates, injected)["residual"])
            if abs(scores[index]) >= THRESHOLD:
                detected += 1
        rows.append(
            {
                "magnitude": magnitude,
                "detection_rate": round(detected / trials, 4),
                "trials": trials,
            }
        )
    return rows


def main() -> int:
    leads = load("funnel_leads")
    orders = load("orders").filter(pl.col("order_status") != "canceled")

    series = []

    lead_dates, lead_values = daily_counts(
        [d for d in leads["first_contact_date"].to_list() if d is not None]
    )
    series.append(
        detect(
            "leads",
            "Marketing-qualified leads per day",
            lead_dates,
            lead_values,
        )
    )

    order_dates, order_values = daily_counts(
        [
            d.date()
            for d in orders["order_purchase_timestamp"].to_list()
            if d is not None
        ]
    )
    series.append(
        detect("orders", "Orders placed per day", order_dates, order_values)
    )

    payload = {
        "series": series,
        "sensitivity": {
            "leads": sensitivity(lead_dates, lead_values),
            "orders": sensitivity(order_dates, order_values),
        },
        "method": {
            "trend_window_days": TREND_WINDOW,
            "threshold_sigma": THRESHOLD,
            "scale": "median absolute deviation, scaled by 1.4826",
        },
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "anomalies.json").write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )

    for s in series:
        print(f"\n{s['label']}: {s['n_days']} days, robust scale {s['scale']}")
        print(f"  {len(s['anomalies'])} flagged at |z| >= {THRESHOLD}")
        for a in s["anomalies"][:6]:
            print(
                f"    {a['date']} ({a['weekday'][:3]}) {a['direction']:<5} "
                f"observed {a['observed']:>6.0f} vs expected {a['expected']:>7.2f}  z={a['z']:+.1f}"
            )

    print("\nsensitivity (share of injected spikes recovered):")
    for key, rows in payload["sensitivity"].items():
        summary = "  ".join(f"{r['magnitude']}s:{r['detection_rate']:.0%}" for r in rows)
        print(f"  {key:<8}{summary}")
    print(f"\n-> {OUT / 'anomalies.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
