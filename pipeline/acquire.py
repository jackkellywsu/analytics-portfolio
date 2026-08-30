"""Download every registered source and write its provenance record.

    .venv/Scripts/python.exe -m pipeline.acquire

Idempotent: kagglehub caches downloads, so re-running verifies checksums and
refreshes the pull date without re-fetching.
"""

from __future__ import annotations

import argparse

from pipeline.sources import SOURCES, fetch, inspect


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        choices=sorted(SOURCES),
        action="append",
        help="Limit to one source; repeatable. Defaults to all.",
    )
    args = parser.parse_args()
    keys = args.source or sorted(SOURCES)

    for key in keys:
        source = SOURCES[key]
        print(f"\n{source.key}  ({source.slug})")
        directory = fetch(source)
        record = inspect(source, directory)
        path = record.write()
        print(f"  {len(record.files)} files, {record.total_rows:,} rows total")
        for f in record.files:
            print(f"    {f.name:<48} {f.rows:>8,} rows  {len(f.columns):>2} cols")
        print(f"  provenance -> {path.relative_to(path.parent.parent.parent)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
