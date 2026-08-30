"""Known-answer tests for the statistics used on the site.

Every figure the dashboards publish depends on these, so they are checked
against values computed independently rather than against their own output.
"""

from __future__ import annotations

import math

import pytest

from pipeline.stats import Interval, histogram, quantile, summarise, wilson


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
