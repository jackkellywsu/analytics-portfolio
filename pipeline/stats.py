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


@dataclass(frozen=True)
class BetaPrior:
    alpha: float
    beta: float

    @property
    def mean(self) -> float:
        return self.alpha / (self.alpha + self.beta)

    @property
    def strength(self) -> float:
        """Prior weight in pseudo-observations - how many real rows it takes to
        move a group's estimate away from the population mean."""
        return self.alpha + self.beta

    def shrink(self, successes: int, trials: int) -> float:
        return (successes + self.alpha) / (trials + self.alpha + self.beta)


def fit_beta_prior(groups: list[tuple[int, int]]) -> BetaPrior:
    """Fit a Beta prior to a set of (successes, trials) groups by moments.

    The problem this solves: rank a dozen segments by conversion rate and the
    top of the list is whichever tiny segment got lucky. A segment that
    converted 2 of 2 shows 100%, and no amount of adding error bars stops a
    reader's eye from going to the top row.

    Shrinkage fixes it at the estimate rather than in the annotation. Each
    group's rate is pulled toward the population mean by an amount set by its
    own sample size, so a 2-of-2 segment lands near the average while a
    200-of-400 segment barely moves. Groups with fewer than two observations
    are excluded from the fit but still receive an estimate.
    """
    usable = [(s, n) for s, n in groups if n > 0]
    if len(usable) < 2:
        return BetaPrior(1.0, 1.0)

    rates = [s / n for s, n in usable]
    mean = sum(rates) / len(rates)
    variance = sum((r - mean) ** 2 for r in rates) / (len(rates) - 1)

    # Degenerate cases: no spread between groups, or more spread than a Beta
    # can represent. Fall back to a weak uniform prior rather than a negative
    # concentration, which would produce nonsense estimates silently.
    if variance <= 0 or variance >= mean * (1 - mean):
        return BetaPrior(1.0, 1.0)

    concentration = mean * (1 - mean) / variance - 1
    if concentration <= 0:
        return BetaPrior(1.0, 1.0)
    return BetaPrior(alpha=mean * concentration, beta=(1 - mean) * concentration)


def shrink_group_means(groups: dict[str, list[float]]) -> dict[str, float]:
    """Empirical-Bayes shrinkage for group means (the normal-normal model).

    The Beta shrinkage above fixes small-sample *rates*. This fixes small-sample
    *averages*, which is the same failure in a different coat: a segment with
    five clients and one very large one shows a mean nobody should plan against,
    and on revenue data — where the top decile takes most of the total — that is
    the common case rather than the edge case.

    Each group's mean is pulled toward the grand mean by

        w = n·tau2 / (n·tau2 + sigma2)

    where sigma2 is the pooled within-group variance and tau2 the between-group
    variance net of sampling noise. A large, internally consistent group keeps
    its own mean; a small or noisy one is pulled most of the way back. When the
    data shows no real spread between groups (tau2 <= 0), every group collapses
    to the grand mean, which is the correct answer rather than a failure.
    """
    usable = {key: values for key, values in groups.items() if values}
    if len(usable) < 2:
        return {key: (sum(v) / len(v) if v else 0.0) for key, v in groups.items()}

    all_values = [v for values in usable.values() for v in values]
    grand_mean = sum(all_values) / len(all_values)

    # Pooled within-group variance.
    residual_ss = 0.0
    residual_df = 0
    for values in usable.values():
        if len(values) < 2:
            continue
        mean = sum(values) / len(values)
        residual_ss += sum((v - mean) ** 2 for v in values)
        residual_df += len(values) - 1
    sigma2 = residual_ss / residual_df if residual_df > 0 else 0.0

    means = {key: sum(v) / len(v) for key, v in usable.items()}
    spread = sum((m - grand_mean) ** 2 for m in means.values()) / (len(means) - 1)
    mean_sampling_variance = (
        sum(sigma2 / len(v) for v in usable.values()) / len(usable) if sigma2 else 0.0
    )
    tau2 = max(0.0, spread - mean_sampling_variance)

    out: dict[str, float] = {}
    for key, values in groups.items():
        if not values:
            out[key] = grand_mean
            continue
        n = len(values)
        if tau2 <= 0 or sigma2 <= 0:
            weight = 0.0 if tau2 <= 0 else 1.0
        else:
            weight = (n * tau2) / (n * tau2 + sigma2)
        out[key] = weight * means[key] + (1 - weight) * grand_mean
    return out


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
