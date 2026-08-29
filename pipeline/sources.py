"""Where source data comes from.

Two acquisition paths exist for the same USPTO bulk tables, and they differ only in
how bytes arrive on disk (see docs/data-source-availability.md):

  LocalDirectorySource  files downloaded by hand from the ODP website. Requires a
                        USPTO.gov account, no API key, no identity verification.
  OdpBulkApiSource      files fetched via the ODP Bulk Datasets API. Requires an API
                        key, which requires ID.me identity verification.

Everything downstream reads through this interface, so switching paths does not touch
the transformation, scoring, or semantic-layer code.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "pipeline" / "raw"

#: ODP bulk product holding all three tables this project needs.
ODP_PRODUCT_ID = "pvgpatdis"
ODP_PRODUCT_URL = f"https://data.uspto.gov/bulkdata/datasets/{ODP_PRODUCT_ID}"
ODP_API_BASE = "https://api.uspto.gov/api/v1/datasets/products"

#: Tables required, keyed by the PatentsView table name. Matching is done on the
#: filename stem so it survives ODP's packaging choices (.tsv, .tsv.zip, .zip).
REQUIRED_TABLES: dict[str, str] = {
    "g_patent": "Grant date and patent id, the spine of every trailing-window metric",
    "g_assignee_disambiguated": "Assignee organizations, the unit the model ranks",
    "g_cpc_current": "CPC classification, mapping patents to practice-area sectors",
}


class BulkSource(Protocol):
    """Makes the required tables available as local files."""

    access_method: str
    source_url: str

    def ensure_local(self) -> dict[str, Path]:
        """Return {table_name: path}. Raises if a required table is missing."""
        ...


def _match_tables(paths: list[Path]) -> dict[str, Path]:
    """Map required table names onto whatever files are present.

    Longest table name wins so `g_patent` cannot shadow a more specific table.
    """
    matched: dict[str, Path] = {}
    for table in sorted(REQUIRED_TABLES, key=len, reverse=True):
        for path in paths:
            if path.name in {p.name for p in matched.values()}:
                continue
            if path.name.lower().startswith(table.lower()):
                matched[table] = path
                break
    return matched


class LocalDirectorySource:
    """Files placed in pipeline/raw/ by hand. See pipeline/raw/README.md."""

    access_method = "Manual download from ODP website (signed-in USPTO.gov account)"
    source_url = ODP_PRODUCT_URL

    def __init__(self, directory: Path = RAW_DIR) -> None:
        self.directory = directory

    def available(self) -> list[Path]:
        if not self.directory.is_dir():
            return []
        skip = {".gitkeep", "README.md"}
        return sorted(
            p for p in self.directory.iterdir() if p.is_file() and p.name not in skip
        )

    def ensure_local(self) -> dict[str, Path]:
        present = self.available()
        matched = _match_tables(present)
        missing = set(REQUIRED_TABLES) - set(matched)
        if missing:
            found = "\n".join(f"    {p.name}" for p in present) or "    (none)"
            raise FileNotFoundError(
                "Missing required table(s): "
                + ", ".join(sorted(missing))
                + f"\n\n  Files found in {self.directory}:\n{found}\n\n"
                f"  Download them from {ODP_PRODUCT_URL}\n"
                "  Instructions: pipeline/raw/README.md"
            )
        return matched


class OdpBulkApiSource:
    """Fetch via the ODP Bulk Datasets API.

    Not implemented. Deliberately left as a stub: the API requires an ID.me-verified
    account, and the project is currently on the manual path by design. The interface
    exists so adopting it later is a swap, not a rewrite.
    """

    access_method = "ODP Bulk Datasets API (X-API-KEY)"
    source_url = f"{ODP_API_BASE}/{ODP_PRODUCT_ID}"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or os.environ.get("USPTO_ODP_API_KEY")

    def ensure_local(self) -> dict[str, Path]:
        raise NotImplementedError(
            "The ODP Bulk Datasets API path is not implemented.\n"
            "  It requires an API key, which requires ID.me identity verification.\n"
            "  Use LocalDirectorySource; see pipeline/raw/README.md.\n"
            "  Rate limit when implemented: 60 requests/minute."
        )


def default_source() -> BulkSource:
    """The acquisition path this project currently uses."""
    return LocalDirectorySource()
