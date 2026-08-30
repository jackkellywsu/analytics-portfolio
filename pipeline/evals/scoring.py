"""Scoring for the text-to-SQL benchmark.

Execution accuracy, not string comparison. Two queries that reach the same
answer by different routes are both correct, and a benchmark that insists on
matching the gold query's syntax measures imitation rather than competence.

The comparison is deliberately strict about the things that change an answer -
values, row counts, column counts - and deliberately lax about the things that
do not: column names, column order within a row, and row order unless the gold
query asked for one.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

import duckdb


class Outcome(StrEnum):
    CORRECT = "correct"
    # The model declined a question the benchmark says is answerable.
    FALSE_REFUSAL = "false_refusal"
    # Never reached the database.
    INVALID_SQL = "invalid_sql"
    BLOCKED = "blocked_by_validator"
    NO_TOOL_CALL = "no_tool_call"
    API_ERROR = "api_error"
    # Reached the database and got the wrong answer.
    WRONG_SHAPE = "wrong_shape"
    WRONG_ROW_COUNT = "wrong_row_count"
    WRONG_VALUES = "wrong_values"
    EXECUTION_ERROR = "execution_error"


# Outcomes where the model produced something the database refused, versus ones
# where it produced a confident wrong answer. The second kind is worse: nothing
# looks broken.
SILENT_FAILURES = {Outcome.WRONG_SHAPE, Outcome.WRONG_ROW_COUNT, Outcome.WRONG_VALUES}


@dataclass
class Score:
    outcome: Outcome
    correct: bool
    detail: str = ""
    gold_rows: int = 0
    candidate_rows: int = 0
    dropped_required_filter: bool = False
    notes: list[str] = field(default_factory=list)


def _normalise(value: Any) -> Any:
    """Make two values comparable when they mean the same thing.

    DuckDB hands back Decimal, date, and datetime objects depending on the
    expression that produced them, so a correct query can disagree with the gold
    query on type while agreeing on value.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return bool(value)
    if isinstance(value, (int, float)):
        number = float(value)
        if math.isnan(number):
            return "nan"
        # Round to a tolerance that survives float arithmetic but still
        # distinguishes answers that genuinely differ.
        return round(number, 6)
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value).strip()
    return round(number, 6)


def _rows_equal(gold: list[tuple], candidate: list[tuple], ordered: bool) -> bool:
    normalised_gold = [tuple(_normalise(v) for v in row) for row in gold]
    normalised_candidate = [tuple(_normalise(v) for v in row) for row in candidate]

    if ordered:
        return normalised_gold == normalised_candidate

    # Multiset comparison: a duplicated row is a different answer from a single
    # one, so sorting and comparing beats using sets here.
    return sorted(normalised_gold, key=repr) == sorted(normalised_candidate, key=repr)


def gold_is_ordered(sql: str) -> bool:
    """Row order only matters when the question asked for it."""
    return "order by" in sql.lower()


def score_case(
    connection: duckdb.DuckDBPyConnection,
    gold_sql: str,
    candidate_sql: str | None,
    *,
    required_filter: str | None = None,
) -> Score:
    if candidate_sql is None:
        return Score(Outcome.INVALID_SQL, False, "No SQL produced.")

    try:
        gold_rows = connection.execute(gold_sql).fetchall()
    except Exception as error:  # noqa: BLE001
        msg = f"gold query failed - the answer key is broken: {error}"
        raise RuntimeError(msg) from error

    try:
        candidate_rows = connection.execute(candidate_sql).fetchall()
    except Exception as error:  # noqa: BLE001
        return Score(
            Outcome.EXECUTION_ERROR,
            False,
            f"{type(error).__name__}: {str(error)[:200]}",
            gold_rows=len(gold_rows),
        )

    notes: list[str] = []
    dropped = False
    if required_filter:
        # A targeted check for the failure the semantic layer exists to prevent.
        needle = required_filter.split(".")[-1].strip().lower()
        if needle and needle not in candidate_sql.lower():
            dropped = True
            notes.append(f"omits the required filter on {required_filter}")

    if gold_rows and candidate_rows and len(gold_rows[0]) != len(candidate_rows[0]):
        return Score(
            Outcome.WRONG_SHAPE,
            False,
            f"gold returns {len(gold_rows[0])} columns, candidate returns {len(candidate_rows[0])}",
            gold_rows=len(gold_rows),
            candidate_rows=len(candidate_rows),
            dropped_required_filter=dropped,
            notes=notes,
        )

    if len(gold_rows) != len(candidate_rows):
        return Score(
            Outcome.WRONG_ROW_COUNT,
            False,
            f"gold returns {len(gold_rows)} rows, candidate returns {len(candidate_rows)}",
            gold_rows=len(gold_rows),
            candidate_rows=len(candidate_rows),
            dropped_required_filter=dropped,
            notes=notes,
        )

    if _rows_equal(gold_rows, candidate_rows, gold_is_ordered(gold_sql)):
        return Score(
            Outcome.CORRECT,
            True,
            gold_rows=len(gold_rows),
            candidate_rows=len(candidate_rows),
            dropped_required_filter=dropped,
            notes=notes,
        )

    return Score(
        Outcome.WRONG_VALUES,
        False,
        "same shape, different values",
        gold_rows=len(gold_rows),
        candidate_rows=len(candidate_rows),
        dropped_required_filter=dropped,
        notes=notes,
    )
