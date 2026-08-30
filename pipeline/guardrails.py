"""SQL validation.

What this is actually for, stated plainly: the data behind this site is public
and every query runs in the visitor's own browser, so nothing here is guarding a
secret. These checks guard the *answer*. A model that silently reads a forbidden
join, drops a mandatory filter, or invents a column produces a number that looks
right and is not, which is the failure mode that matters when a non-technical
person is asking the questions.

The same chain is what would stand between a natural-language question and a
private warehouse, and it is written so that it could. It parses to an abstract
syntax tree rather than matching strings, because a keyword blocklist is defeated
by a comment, a case change, or a nested subquery.

A mirror of this runs in TypeScript at web/lib/guardrails. Both are checked
against the same corpus in semantic/guardrail_cases.json, so they cannot drift.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parent.parent
LAYER_PATH = ROOT / "semantic" / "layer.yaml"
MANIFEST_PATH = ROOT / "web" / "public" / "data" / "manifest.json"

DIALECT = "duckdb"

# Expression types that must never appear. Parsed, not pattern-matched.
FORBIDDEN_NODES: dict[type, str] = {
    exp.Insert: "INSERT",
    exp.Update: "UPDATE",
    exp.Delete: "DELETE",
    exp.Drop: "DROP",
    exp.Create: "CREATE",
    exp.Alter: "ALTER",
    exp.Merge: "MERGE",
    exp.Command: "a raw command",
    exp.Transaction: "a transaction",
    exp.Commit: "COMMIT",
    exp.Rollback: "ROLLBACK",
    exp.Use: "USE",
}
# read_csv / read_parquet deliberately are NOT listed above. sqlglot gives them
# their own node classes, so treating them as forbidden statements would report
# them as not_select - while the TypeScript validator, which sees them as
# table-valued functions, reports unknown_table. They are caught by the unnamed-
# table check below instead, so both implementations agree on the code.

# Functions that reach outside the registered views.
FORBIDDEN_FUNCTIONS = {
    "read_csv",
    "read_csv_auto",
    "read_json",
    "read_json_auto",
    "read_parquet",
    "read_text",
    "glob",
    "install",
    "load",
    "copy",
    "system",
    "shell",
    "getenv",
}


@dataclass(frozen=True)
class Violation:
    code: str
    message: str


@dataclass
class Verdict:
    allowed: bool
    violations: list[Violation] = field(default_factory=list)
    """SQL as it would actually execute: a LIMIT is added or clamped here."""
    sql: str | None = None
    tables: list[str] = field(default_factory=list)
    limit_applied: int | None = None

    @property
    def codes(self) -> list[str]:
        return sorted({v.code for v in self.violations})

    def to_dict(self) -> dict[str, Any]:
        return asdict(self) | {"codes": self.codes}


@dataclass(frozen=True)
class Policy:
    allowed_tables: frozenset[str]
    columns_by_table: dict[str, frozenset[str]]
    forbidden_pairs: frozenset[frozenset[str]]
    max_rows: int = 1000
    max_joins: int = 5
    max_chars: int = 4000
    max_depth: int = 3


def load_policy(
    manifest_path: Path = MANIFEST_PATH, layer_path: Path = LAYER_PATH
) -> Policy:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    columns = {
        table["name"]: frozenset(c["name"] for c in table["columns"])
        for table in manifest["tables"]
    }

    import yaml

    layer = yaml.safe_load(layer_path.read_text(encoding="utf-8"))
    entity_tables = {name: e["table"] for name, e in layer["entities"].items()}
    forbidden = frozenset(
        frozenset(
            entity_tables[entity] for entity in pair["between"] if entity in entity_tables
        )
        for pair in layer.get("forbidden_joins", [])
    )
    policy = layer.get("policy", {})
    return Policy(
        allowed_tables=frozenset(columns),
        columns_by_table=columns,
        forbidden_pairs=forbidden,
        max_rows=int(policy.get("max_rows", 1000)),
        max_joins=int(policy.get("max_joins", 5)),
        max_chars=int(policy.get("max_query_chars", 4000)),
    )


def validate(sql: str, policy: Policy) -> Verdict:
    violations: list[Violation] = []

    if not sql or not sql.strip():
        return Verdict(False, [Violation("empty", "No SQL was produced.")])

    if len(sql) > policy.max_chars:
        return Verdict(
            False,
            [
                Violation(
                    "too_long",
                    f"Query is {len(sql)} characters; the limit is {policy.max_chars}.",
                )
            ],
        )

    try:
        statements = [s for s in sqlglot.parse(sql, dialect=DIALECT) if s is not None]
    except Exception as error:  # sqlglot raises several distinct parse errors
        return Verdict(
            False,
            [Violation("unparseable", f"Could not parse as SQL: {error}")],
        )

    # Statement type is checked across every parsed statement before the count
    # is. Order matters for agreement with the TypeScript validator: DuckDB's
    # serialiser refuses a batch containing any non-SELECT outright and never
    # reports how many statements there were, so "SELECT 1; DROP TABLE x" has to
    # come back as not_select on both sides rather than as multiple_statements
    # here and not_select there.
    for statement in statements:
        matched = False
        for node_type, label in FORBIDDEN_NODES.items():
            if isinstance(statement, node_type) or list(statement.find_all(node_type)):
                violations.append(
                    Violation(
                        "not_select",
                        f"{label} is not permitted; queries are read-only.",
                    )
                )
                matched = True
                break
        if matched:
            break

    if violations:
        return Verdict(False, violations)

    if len(statements) != 1:
        return Verdict(
            False,
            [
                Violation(
                    "multiple_statements",
                    f"Expected one statement, found {len(statements)}. "
                    "Chaining statements is how a second, unreviewed query gets in.",
                )
            ],
        )

    tree = statements[0]

    if not isinstance(tree, (exp.Select, exp.Union, exp.Subquery)):
        violations.append(
            Violation("not_select", "Only SELECT statements are permitted.")
        )

    for function in tree.find_all(exp.Anonymous):
        name = (function.this or "").lower() if isinstance(function.this, str) else ""
        if name in FORBIDDEN_FUNCTIONS:
            violations.append(
                Violation(
                    "forbidden_function",
                    f"{name}() reaches outside the published tables.",
                )
            )

    # Tables actually referenced, excluding CTE names the query defines itself.
    cte_names = {cte.alias_or_name.lower() for cte in tree.find_all(exp.CTE)}
    referenced: set[str] = set()
    for table in tree.find_all(exp.Table):
        name = (table.name or "").lower()
        if name in cte_names:
            continue
        if not name:
            # A table position holding something other than an identifier is a
            # table-valued function: read_parquet('http://...'), read_csv('/etc/
            # passwd'), glob('*'). These have no name, so a check that skips
            # unnamed tables waves them straight through - which is exactly what
            # this validator did until the conformance corpus caught it.
            inner = type(table.this).__name__ if table.this is not None else "unknown"
            violations.append(
                Violation(
                    "unknown_table",
                    f"A table-valued function ({inner}) is not a published table. "
                    "Queries may only read the views the layer defines.",
                )
            )
            continue
        referenced.add(name)

    unknown = sorted(referenced - policy.allowed_tables)
    if unknown:
        violations.append(
            Violation(
                "unknown_table",
                f"References {', '.join(unknown)}, which the layer does not define.",
            )
        )

    # Backstop: a query that reads none of the published tables is not answering
    # a question about this data, whatever else it might be doing.
    if not referenced and not cte_names:
        violations.append(
            Violation(
                "no_known_table",
                "The query reads none of the published tables.",
            )
        )

    known = referenced & policy.allowed_tables
    for pair in policy.forbidden_pairs:
        if pair <= known:
            violations.append(
                Violation(
                    "forbidden_join",
                    f"Joins {' and '.join(sorted(pair))}, which describe different "
                    "businesses and share no entity.",
                )
            )

    # Column check, only for unambiguously qualified references. An unqualified
    # column in a multi-table query cannot be attributed without resolving
    # aliases, and guessing would produce false rejections.
    alias_map: dict[str, str] = {}
    for table in tree.find_all(exp.Table):
        name = (table.name or "").lower()
        if name in policy.allowed_tables:
            alias_map[(table.alias or name).lower()] = name
    for column in tree.find_all(exp.Column):
        qualifier = (column.table or "").lower()
        if not qualifier:
            continue
        target = alias_map.get(qualifier)
        if target is None:
            continue
        if column.name not in policy.columns_by_table.get(target, frozenset()):
            violations.append(
                Violation(
                    "unknown_column",
                    f"{target}.{column.name} does not exist.",
                )
            )

    join_count = len(list(tree.find_all(exp.Join)))
    if join_count > policy.max_joins:
        violations.append(
            Violation(
                "too_many_joins",
                f"{join_count} joins; the limit is {policy.max_joins}.",
            )
        )

    if _depth(tree) > policy.max_depth:
        violations.append(
            Violation(
                "too_deep",
                f"Subqueries nest more than {policy.max_depth} levels.",
            )
        )

    # A cross join with no ON clause multiplies the tables together. With
    # 99,000-row tables that is not a slow query, it is a hung browser tab.
    for join in tree.find_all(exp.Join):
        if join.args.get("on") is None and join.args.get("using") is None:
            violations.append(
                Violation(
                    "cartesian_join",
                    "A join without an ON condition multiplies both tables together.",
                )
            )
            break

    if violations:
        return Verdict(False, violations, tables=sorted(referenced))

    limited, applied = _apply_limit(tree, policy.max_rows)
    return Verdict(
        allowed=True,
        violations=[],
        sql=limited,
        tables=sorted(referenced),
        limit_applied=applied,
    )


def _depth(node: exp.Expression, level: int = 0) -> int:
    deepest = level
    for child in node.find_all(exp.Subquery):
        if child is node:
            continue
        deepest = max(deepest, _depth(child, level + 1))
    return deepest


def _apply_limit(tree: exp.Expression, max_rows: int) -> tuple[str, int]:
    """Add a LIMIT, or clamp one that is too large.

    Enforced here rather than requested in the prompt, because a limit the model
    is asked to include is a limit it will sometimes forget.
    """
    limit = tree.args.get("limit")
    applied = max_rows
    if limit is not None:
        try:
            requested = int(limit.expression.this)
            applied = min(requested, max_rows)
        except (AttributeError, TypeError, ValueError):
            applied = max_rows
    tree.set("limit", exp.Limit(expression=exp.Literal.number(applied)))
    return tree.sql(dialect=DIALECT, pretty=True), applied


def export_policy(policy: Policy, path: Path) -> Path:
    """Write the policy as JSON for the TypeScript validator.

    Generated rather than hand-maintained: two copies of an allowlist is one
    copy too many, and the one that drifts is always the one nobody is testing.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "allowed_tables": sorted(policy.allowed_tables),
        "columns_by_table": {
            table: sorted(columns) for table, columns in sorted(policy.columns_by_table.items())
        },
        "forbidden_pairs": sorted(sorted(pair) for pair in policy.forbidden_pairs),
        "max_rows": policy.max_rows,
        "max_joins": policy.max_joins,
        "max_chars": policy.max_chars,
        "max_depth": policy.max_depth,
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path
