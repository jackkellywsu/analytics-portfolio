"""Statistics used by the dashboards and, later, the evaluation lab.

Implemented here rather than pulled from a library so the formulas are visible
and testable. Each function has a known-answer test in pipeline/tests.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# 97.5th percentile of the standard normal, for a two-sided 95% interval.
Z_95 = 1.959963984540054


@dataclass(frozen=True)
class Interval:
    point: float
    low: float
    high: float

    @property
    def half_width(self) -> float:
        return (self.high - self.low) / 2

    def overlaps(self, other: "Interval") -> bool:
        return self.low <= other.high and other.low <= self.high

    def as_dict(self) -> dict[str, float]:
        return {
            "point": round(self.point, 5),
            "low": round(self.low, 5),
            "high": round(self.high, 5),
        }


def wilson(successes: int, trials: int, z: float = Z_95) -> Interval:
    """Wilson score interval for a binomial proportion.

    Preferred over the normal approximation because it stays inside [0, 1] and
    behaves at small n and at proportions near 0 or 1 - exactly the cases a
    dashboard hits when a category has few rows. A win rate quoted without one
    of these invites a reader to rank noise.
    """
    if trials <= 0:
        return Interval(0.0, 0.0, 0.0)

    p = successes / trials
    denominator = 1 + z * z / trials
    center = (p + z * z / (2 * trials)) / denominator
    margin = (
        z
        / denominator
        * math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials))
    )
    return Interval(p, max(0.0, center - margin), min(1.0, center + margin))


def quantile(values: list[float], q: float) -> float:
    """Linear-interpolation quantile, matching numpy's default and DuckDB's
    QUANTILE_CONT so a figure computed here matches one a reader derives in the
    SQL console."""
    if not values:
        return float("nan")
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = q * (len(ordered) - 1)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[int(position)]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def histogram(values: list[float], bin_width: float, cap: float | None = None) -> list[dict]:
    """Fixed-width bins, with everything at or above `cap` folded into a final
    overflow bin so a long tail cannot flatten the visible distribution."""
    if not values:
        return []
    kept = [v for v in values if cap is None or v < cap]
    overflow = len([v for v in values if cap is not None and v >= cap])

    top = max(kept) if kept else 0.0
    bin_count = int(top // bin_width) + 1
    counts = [0] * bin_count
    for value in kept:
        counts[min(int(value // bin_width), bin_count - 1)] += 1

    bins = [
        {
            "start": i * bin_width,
            "end": (i + 1) * bin_width,
            "count": count,
            "overflow": False,
        }
        for i, count in enumerate(counts)
    ]
    if overflow:
        bins.append({"start": cap, "end": None, "count": overflow, "overflow": True})
    return bins


def summarise(values: list[float]) -> dict[str, float]:
    """Five-number-style summary. Medians and tails, not means: every duration
    in this data is right-skewed, and a mean cycle time describes no real deal."""
    if not values:
        return {}
    return {
        "n": len(values),
        "min": min(values),
        "p25": quantile(values, 0.25),
        "median": quantile(values, 0.5),
        "p75": quantile(values, 0.75),
        "p90": quantile(values, 0.90),
        "max": max(values),
        "mean": sum(values) / len(values),
    }
