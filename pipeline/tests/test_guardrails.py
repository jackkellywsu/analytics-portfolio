"""Conformance tests for the SQL validator.

The corpus in semantic/guardrail_cases.json is shared with the TypeScript
implementation. Both must produce the same verdict on every case.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline.guardrails import Policy, load_policy, validate

ROOT = Path(__file__).resolve().parent.parent.parent
CASES_PATH = ROOT / "semantic" / "guardrail_cases.json"

CASES = json.loads(CASES_PATH.read_text(encoding="utf-8"))["cases"]


@pytest.fixture(scope="module")
def policy() -> Policy:
    return load_policy()


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_shared_corpus(case: dict, policy: Policy) -> None:
    verdict = validate(case["sql"], policy)

    if case["expect"] == "allow":
        assert verdict.allowed, (
            f"{case['id']} should have been allowed but was rejected: "
            f"{[v.message for v in verdict.violations]}"
        )
        assert verdict.sql is not None
        if "limit_applied" in case:
            assert verdict.limit_applied == case["limit_applied"]
    else:
        assert not verdict.allowed, f"{case['id']} should have been rejected"
        for code in case.get("codes", []):
            assert code in verdict.codes, (
                f"{case['id']} was rejected but not for {code!r}; got {verdict.codes}"
            )


class TestLimitEnforcement:
    def test_limit_is_written_into_the_returned_sql(self, policy: Policy) -> None:
        verdict = validate("SELECT order_id FROM orders", policy)
        assert verdict.allowed
        assert "LIMIT" in (verdict.sql or "").upper()

    def test_returned_sql_is_what_executes(self, policy: Policy) -> None:
        """The verdict carries the SQL to run, not the SQL that was submitted."""
        verdict = validate("SELECT order_id FROM orders LIMIT 999999", policy)
        assert verdict.allowed
        assert "999999" not in (verdict.sql or "")


class TestTableExtraction:
    def test_reports_every_table_touched(self, policy: Policy) -> None:
        verdict = validate(
            "SELECT c.customer_state FROM orders o "
            "JOIN customers c ON c.customer_id = o.customer_id LIMIT 10",
            policy,
        )
        assert verdict.allowed
        assert verdict.tables == ["customers", "orders"]

    def test_cte_names_are_not_reported_as_tables(self, policy: Policy) -> None:
        verdict = validate(
            "WITH live AS (SELECT * FROM orders) SELECT COUNT(*) FROM live", policy
        )
        assert verdict.allowed
        assert verdict.tables == ["orders"]


class TestUnqualifiedColumns:
    def test_unqualified_columns_are_not_rejected(self, policy: Policy) -> None:
        """Resolving an unqualified column across joins needs alias resolution the
        validator does not do. Guessing would reject correct queries, so these
        pass the column check and fail later in the engine if genuinely wrong."""
        verdict = validate("SELECT sector FROM crm_accounts LIMIT 5", policy)
        assert verdict.allowed

    def test_qualified_bad_column_is_rejected(self, policy: Policy) -> None:
        verdict = validate(
            "SELECT o.definitely_not_a_column FROM orders o LIMIT 5", policy
        )
        assert not verdict.allowed
        assert "unknown_column" in verdict.codes
