"""Check every gold query before anything is scored against it.

    .venv/Scripts/python.exe -m pipeline.evals.verify_gold

A benchmark is only as good as its answer key. A gold query that does not run,
or that returns an empty result, silently marks every model wrong - and the
resulting chart looks like a finding rather than a bug. This runs the whole
answer key and refuses to pass if anything is broken or suspiciously empty.
"""

from __future__ import annotations

import json
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "web" / "public" / "data"
CASES_PATH = Path(__file__).resolve().parent / "cases.json"


def connect() -> duckdb.DuckDBPyConnection:
    connection = duckdb.connect()
    for parquet in sorted(DATA.glob("*.parquet")):
        connection.execute(
            f"CREATE VIEW {parquet.stem} AS SELECT * FROM read_parquet('{parquet.as_posix()}')"
        )
    return connection


def load_cases() -> list[dict]:
    return json.loads(CASES_PATH.read_text(encoding="utf-8"))["cases"]


def main() -> int:
    connection = connect()
    cases = load_cases()
    failures: list[str] = []
    empty: list[str] = []
    seen_ids: set[str] = set()

    for case in cases:
        case_id = case["id"]
        if case_id in seen_ids:
            failures.append(f"{case_id}: duplicate id")
        seen_ids.add(case_id)

        try:
            rows = connection.execute(case["gold_sql"]).fetchall()
        except Exception as error:  # noqa: BLE001 - any failure is a failure
            failures.append(f"{case_id}: {type(error).__name__}: {str(error)[:160]}")
            continue

        if not rows:
            empty.append(case_id)
            continue

        # A single NULL is the signature of an aggregate over an empty filter -
        # technically a result, practically a broken answer key.
        if len(rows) == 1 and all(value is None for value in rows[0]):
            empty.append(f"{case_id} (all NULL)")

    by_difficulty: dict[str, int] = {}
    by_domain: dict[str, int] = {}
    traps = 0
    for case in cases:
        by_difficulty[case["difficulty"]] = by_difficulty.get(case["difficulty"], 0) + 1
        by_domain[case["domain"]] = by_domain.get(case["domain"], 0) + 1
        if case.get("trap_kind"):
            traps += 1

    print(f"{len(cases)} cases")
    print(f"  difficulty: {dict(sorted(by_difficulty.items()))}")
    print(f"  domain:     {dict(sorted(by_domain.items()))}")
    print(f"  traps:      {traps}")

    if empty:
        print(f"\n{len(empty)} returned nothing:")
        for case_id in empty:
            print(f"  {case_id}")
    if failures:
        print(f"\n{len(failures)} failed to execute:")
        for failure in failures:
            print(f"  {failure}")

    if failures or empty:
        return 1
    print("\nevery gold query executes and returns rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
