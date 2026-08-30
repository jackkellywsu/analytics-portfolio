"""Known-answer tests for the statistics used on the site.

Every figure the dashboards publish depends on these, so they are checked
against values computed independently rather than against their own output.
"""

from __future__ import annotations

import math

import pytest

from pipeline.stats import (
    BetaPrior,
    Interval,
    fit_beta_prior,
    histogram,
    quantile,
    shrink_group_means,
    summarise,
    wilson,
)


class TestWilson:
    def test_known_answer(self) -> None:
        # 15 successes in 20 trials. Values cross-checked against
        # statsmodels.stats.proportion.proportion_confint(method="wilson").
        result = wilson(15, 20)
        assert result.point == pytest.approx(0.75)
        assert result.low == pytest.approx(0.531299122, abs=1e-9)
        assert result.high == pytest.approx(0.888138299, abs=1e-9)

    @pytest.mark.parametrize(
        ("successes", "trials"),
        [(15, 20), (30, 30), (0, 30), (648, 1000), (1, 3), (2473, 6711)],
    )
    def test_matches_statsmodels(self, successes: int, trials: int) -> None:
        """Cross-check against an independent implementation.

        Worth more than a hardcoded constant: it catches a formula error at any
        input, not just the one someone happened to write a test for.
        """
        statsmodels = pytest.importorskip("statsmodels.stats.proportion")
        low, high = statsmodels.proportion_confint(
            successes, trials, alpha=0.05, method="wilson"
        )
        result = wilson(successes, trials)
        assert result.low == pytest.approx(low, abs=1e-9)
        assert result.high == pytest.approx(high, abs=1e-9)

    def test_stays_inside_unit_interval_at_zero(self) -> None:
        result = wilson(0, 30)
        assert result.low == 0.0
        assert 0 < result.high < 1
        # The normal approximation would give [0, 0] here and claim certainty.
        assert result.high > 0.1

    def test_stays_inside_unit_interval_at_one(self) -> None:
        result = wilson(30, 30)
        # Algebraically exactly 1 at p=1; the clamp absorbs float error.
        assert result.high == pytest.approx(1.0, abs=1e-12)
        assert result.low < 1.0

    def test_interval_narrows_with_more_data(self) -> None:
        small = wilson(30, 60)
        large = wilson(300, 600)
        assert large.half_width < small.half_width
        # Four times the sample should roughly halve the width.
        assert large.half_width == pytest.approx(small.half_width / math.sqrt(10), rel=0.15)

    def test_empty_is_not_an_error(self) -> None:
        assert wilson(0, 0) == Interval(0.0, 0.0, 0.0)

    def test_overlap_detection(self) -> None:
        a = wilson(648, 1000)
        b = wilson(631, 1000)
        assert a.overlaps(b)
        far = wilson(200, 1000)
        assert not a.overlaps(far)


class TestQuantile:
    def test_median_odd(self) -> None:
        assert quantile([1, 2, 3, 4, 5], 0.5) == 3

    def test_median_even_interpolates(self) -> None:
        assert quantile([1, 2, 3, 4], 0.5) == pytest.approx(2.5)

    def test_matches_linear_interpolation(self) -> None:
        # numpy.quantile([1,2,3,4,5,6,7,8,9,10], 0.9) == 9.1
        assert quantile(list(range(1, 11)), 0.9) == pytest.approx(9.1)

    def test_extremes(self) -> None:
        values = [4.0, 1.0, 9.0]
        assert quantile(values, 0.0) == 1.0
        assert quantile(values, 1.0) == 9.0

    def test_empty_is_nan(self) -> None:
        assert math.isnan(quantile([], 0.5))


class TestHistogram:
    def test_bins_and_counts(self) -> None:
        bins = histogram([0, 1, 5, 6, 11], bin_width=5)
        assert [b["count"] for b in bins] == [2, 2, 1]
        assert bins[0]["start"] == 0
        assert bins[0]["end"] == 5

    def test_cap_folds_tail_into_overflow(self) -> None:
        bins = histogram([1, 2, 3, 500], bin_width=5, cap=10)
        assert bins[-1]["overflow"] is True
        assert bins[-1]["count"] == 1
        assert sum(b["count"] for b in bins) == 4

    def test_empty(self) -> None:
        assert histogram([], bin_width=5) == []


class TestSummarise:
    def test_shape_and_values(self) -> None:
        result = summarise([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        assert result["n"] == 10
        assert result["median"] == pytest.approx(5.5)
        assert result["p90"] == pytest.approx(9.1)
        assert result["mean"] == pytest.approx(5.5)

    def test_empty(self) -> None:
        assert summarise([]) == {}


class TestBetaShrinkage:
    def test_prior_recovers_a_known_population(self) -> None:
        """Groups drawn around a 40% rate should yield a prior centred there."""
        groups = [(40, 100), (35, 100), (45, 100), (38, 100), (42, 100)]
        prior = fit_beta_prior(groups)
        assert prior.mean == pytest.approx(0.40, abs=0.02)
        assert prior.strength > 0

    def test_small_groups_are_pulled_hardest(self) -> None:
        groups = [(40, 100), (35, 100), (45, 100), (38, 100), (2, 2)]
        prior = fit_beta_prior(groups)

        tiny_raw = 2 / 2
        tiny_shrunk = prior.shrink(2, 2)
        big_raw = 40 / 100
        big_shrunk = prior.shrink(40, 100)

        # The 2-of-2 group must not stay at 100%.
        assert tiny_shrunk < tiny_raw - 0.2
        # The large group barely moves.
        assert abs(big_shrunk - big_raw) < abs(tiny_shrunk - tiny_raw)

    def test_shrinkage_never_leaves_the_unit_interval(self) -> None:
        prior = fit_beta_prior([(1, 10), (9, 10), (5, 10), (3, 10)])
        for successes, trials in [(0, 1), (1, 1), (0, 1000), (1000, 1000)]:
            value = prior.shrink(successes, trials)
            assert 0.0 <= value <= 1.0

    def test_zero_variance_falls_back_to_uniform(self) -> None:
        # Every group identical: a moment fit would divide by zero.
        prior = fit_beta_prior([(5, 10), (5, 10), (5, 10)])
        assert prior == BetaPrior(1.0, 1.0)

    def test_too_few_groups_falls_back_to_uniform(self) -> None:
        assert fit_beta_prior([(5, 10)]) == BetaPrior(1.0, 1.0)
        assert fit_beta_prior([]) == BetaPrior(1.0, 1.0)

    def test_overdispersed_input_falls_back_rather_than_going_negative(self) -> None:
        # Variance at the theoretical maximum would give a non-positive
        # concentration and, unguarded, negative alpha and beta.
        prior = fit_beta_prior([(0, 10), (10, 10), (0, 10), (10, 10)])
        assert prior.alpha > 0 and prior.beta > 0


class TestShrinkGroupMeans:
    def test_small_group_is_pulled_toward_the_grand_mean(self) -> None:
        groups = {
            "big_a": [10.0, 11.0, 9.0, 10.5, 9.5] * 10,
            "big_b": [20.0, 21.0, 19.0, 20.5, 19.5] * 10,
            "big_c": [30.0, 31.0, 29.0, 30.5, 29.5] * 10,
            "tiny": [40.0, 30.0],
        }
        shrunk = shrink_group_means(groups)
        raw_tiny = sum(groups["tiny"]) / len(groups["tiny"])
        grand = sum(v for values in groups.values() for v in values) / sum(
            len(v) for v in groups.values()
        )
        # The two-observation group moves toward the grand mean; the large,
        # internally consistent groups keep their own.
        assert abs(shrunk["tiny"] - grand) < abs(raw_tiny - grand)
        assert shrunk["big_a"] == pytest.approx(10.0, abs=0.5)

    def test_a_single_extreme_group_resists_shrinkage(self) -> None:
        """Documents a real limitation of the moment-based estimator.

        One wildly out-of-range group inflates the between-group variance, and
        a large between-group variance is exactly what tells the estimator that
        group differences are real and should be preserved. The outlier ends up
        justifying itself.

        This is why the attribution build shrinks revenue on the log scale and
        conditions on clients that actually converted, rather than feeding raw
        heavy-tailed means straight in. The estimator is not wrong; it is being
        asked the wrong question when the input is that skewed.
        """
        groups = {
            "a": [10.0] * 50,
            "b": [12.0] * 50,
            "c": [11.0] * 50,
            "outlier": [500.0, 5.0],
        }
        shrunk = shrink_group_means(groups)
        raw = sum(groups["outlier"]) / len(groups["outlier"])
        # Barely moves — this is the documented failure, asserted so that a
        # future change to the estimator has to confront it deliberately.
        assert shrunk["outlier"] > raw * 0.9

    def test_large_consistent_group_keeps_its_mean(self) -> None:
        groups = {
            "a": [10.0] * 200,
            "b": [20.0] * 200,
            "c": [30.0] * 200,
        }
        shrunk = shrink_group_means(groups)
        # No within-group variance at all, so nothing should move.
        assert shrunk["a"] == pytest.approx(10.0, abs=1e-6)
        assert shrunk["c"] == pytest.approx(30.0, abs=1e-6)

    def test_no_real_between_group_spread_collapses_to_grand_mean(self) -> None:
        # Groups differ only by sampling noise around the same mean.
        groups = {
            "a": [9.0, 11.0, 10.0, 10.0],
            "b": [10.0, 10.0, 9.0, 11.0],
            "c": [11.0, 9.0, 10.0, 10.0],
        }
        shrunk = shrink_group_means(groups)
        for value in shrunk.values():
            assert value == pytest.approx(10.0, abs=0.5)

    def test_shrunk_means_stay_within_the_observed_range(self) -> None:
        groups = {"a": [1.0, 2.0], "b": [100.0, 200.0], "c": [50.0] * 20}
        shrunk = shrink_group_means(groups)
        low = min(v for values in groups.values() for v in values)
        high = max(v for values in groups.values() for v in values)
        for value in shrunk.values():
            assert low <= value <= high

    def test_empty_group_gets_the_grand_mean(self) -> None:
        groups = {"a": [10.0] * 5, "b": [20.0] * 5, "empty": []}
        shrunk = shrink_group_means(groups)
        assert 10.0 <= shrunk["empty"] <= 20.0

    def test_single_group_is_returned_unchanged(self) -> None:
        assert shrink_group_means({"only": [3.0, 5.0]})["only"] == pytest.approx(4.0)
