"""Data-quality logging.

Cleaning decisions are analyst judgment, so they are recorded rather than
buried: every rule carries a description, the count of rows it touched, and the
before/after values where those make sense. The site renders these logs, which
is the point — a normalisation nobody can inspect is indistinguishable from a
fudge.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

QUALITY_DIR = Path(__file__).resolve().parent.parent / "docs" / "quality"


@dataclass(frozen=True)
class Rule:
    rule: str
    description: str
    rows_affected: int
    before: str | None = None
    after: str | None = None
    severity: str = "fixed"  # "fixed" | "flagged" | "dropped"


@dataclass
class QualityLog:
    dataset: str
    rows_in: int = 0
    rows_out: int = 0
    rules: list[Rule] = field(default_factory=list)

    def record(
        self,
        rule: str,
        description: str,
        rows_affected: int,
        before: str | None = None,
        after: str | None = None,
        severity: str = "fixed",
    ) -> None:
        self.rules.append(
            Rule(
                rule=rule,
                description=description,
                rows_affected=rows_affected,
                before=before,
                after=after,
                severity=severity,
            )
        )

    def write(self, directory: Path = QUALITY_DIR) -> Path:
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{self.dataset}.json"
        path.write_text(json.dumps(asdict(self), indent=2) + "\n", encoding="utf-8")
        return path

    def report(self) -> str:
        lines = [f"{self.dataset}: {self.rows_in:,} rows in, {self.rows_out:,} rows out"]
        for r in self.rules:
            change = f" {r.before!r} -> {r.after!r}" if r.before is not None else ""
            lines.append(f"  [{r.severity}] {r.rule}: {r.rows_affected:,} rows{change}")
        return "\n".join(lines)
