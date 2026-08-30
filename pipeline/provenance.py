"""Provenance records.

The site claims that every number traces to a documented source. That claim is
only worth something if the trace is mechanical, so acquisition emits one of
these records per source and the site renders them verbatim.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

PROVENANCE_DIR = Path(__file__).resolve().parent.parent / "docs" / "provenance"


@dataclass(frozen=True)
class FileRecord:
    """One source file exactly as published."""

    name: str
    bytes: int
    sha256: str
    rows: int
    columns: list[str]


@dataclass
class ProvenanceRecord:
    key: str
    source: str
    url: str
    slug: str
    nature: str  # "real" | "synthetic"
    pulled_at: str
    cache_path: str
    files: list[FileRecord] = field(default_factory=list)
    notes: str = ""
    gaps: list[str] = field(default_factory=list)

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2) + "\n"

    def write(self, directory: Path = PROVENANCE_DIR) -> Path:
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{self.key}.json"
        path.write_text(self.to_json(), encoding="utf-8")
        return path

    @property
    def total_rows(self) -> int:
        return sum(f.rows for f in self.files)


def sha256_of(path: Path) -> str:
    """Checksum a file as published, so a later pull can be compared to this one."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")
