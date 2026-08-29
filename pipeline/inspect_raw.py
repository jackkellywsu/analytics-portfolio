"""Phase 1 checkpoint: inspect the raw bulk files and emit a provenance record.

Run after placing the ODP files in pipeline/raw/:

    .venv/Scripts/python.exe -m pipeline.inspect_raw --release 2026-XX-XX

This makes no assumptions about how USPTO packaged the tables. It opens whatever is
present, reports the real column headers and record counts, and writes the result to
docs/provenance/. Read its output before writing any transformation.
"""

from __future__ import annotations

import argparse
import gzip
import io
import sys
import zipfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import pyarrow as pa
from pyarrow import csv as pacsv

from pipeline.provenance import FileRecord, ProvenanceRecord, TableRecord, sha256_file
from pipeline.sources import REQUIRED_TABLES, LocalDirectorySource

DATA_SUFFIXES = (".tsv", ".csv", ".txt")
READ_BLOCK = 8 * 1024 * 1024


@contextmanager
def open_member(path: Path, member: str | None) -> Iterator[io.BufferedIOBase]:
    """Open a data stream, transparently handling .zip and .gz containers."""
    suffix = path.suffix.lower()
    if suffix == ".zip":
        with zipfile.ZipFile(path) as archive:
            with archive.open(member) as handle:  # type: ignore[arg-type]
                yield handle  # type: ignore[misc]
    elif suffix == ".gz":
        with gzip.open(path, "rb") as handle:
            yield handle  # type: ignore[misc]
    else:
        with path.open("rb") as handle:
            yield handle


def list_members(path: Path) -> list[str | None]:
    """Data members inside a container, or [None] for a bare file."""
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            members = [
                info.filename
                for info in archive.infolist()
                if not info.is_dir()
                and Path(info.filename).suffix.lower() in DATA_SUFFIXES
            ]
        return members or [None]
    return [None]


def sniff_delimiter(header_line: bytes) -> str:
    return "\t" if header_line.count(b"\t") >= header_line.count(b",") else ","


def read_header(path: Path, member: str | None) -> tuple[list[str], str]:
    with open_member(path, member) as handle:
        raw = handle.readline()
    delimiter = sniff_delimiter(raw)
    text = raw.decode("utf-8", errors="replace").rstrip("\r\n")
    columns = [c.strip().strip('"') for c in text.split(delimiter)]
    return columns, delimiter


def count_records(path: Path, member: str | None, delimiter: str) -> tuple[int, str]:
    """Count data rows.

    Preferred method parses with pyarrow so quoted fields containing newlines count
    as one record. If parsing fails, the fallback counts raw newlines and reports
    that as a different method rather than passing it off as exact.
    """
    try:
        with open_member(path, member) as handle:
            reader = pacsv.open_csv(
                handle,
                read_options=pacsv.ReadOptions(block_size=READ_BLOCK),
                parse_options=pacsv.ParseOptions(
                    delimiter=delimiter, newlines_in_values=True
                ),
            )
            total = 0
            for batch in reader:
                total += batch.num_rows
        return total, "parsed (pyarrow, quote-aware)"
    except (pa.ArrowInvalid, UnicodeDecodeError, ValueError) as exc:
        print(f"    parse failed ({type(exc).__name__}); falling back to line count")
        with open_member(path, member) as handle:
            handle.readline()  # discard header
            newlines = 0
            while chunk := handle.read(READ_BLOCK):
                newlines += chunk.count(b"\n")
        return newlines, "raw newline count (approximate: quoting not honoured)"


def resolve_table(label: str, fallback: str) -> str:
    stem = Path(label).stem.lower()
    for table in sorted(REQUIRED_TABLES, key=len, reverse=True):
        if stem.startswith(table.lower()):
            return table
    return fallback


def inspect(release: str | None) -> ProvenanceRecord:
    source = LocalDirectorySource()
    tables = source.ensure_local()

    record = ProvenanceRecord(
        source_name=(
            "USPTO Open Data Portal - PatentsView granted patent disambiguated "
            "tables (product pvgpatdis)"
        ),
        source_url=source.source_url,
        access_method=source.access_method,
        retrieved_at=ProvenanceRecord.now_utc(),
        release_version=release,
        known_gaps=[
            "Granted patents only. Pending applications are out of scope, so demand "
            "signals visible only in recent filings cannot appear in this dataset.",
            "Grant lag under-represents recent activity; the most recent grant years "
            "are incomplete by construction, not by data error.",
            "Assignee names still require normalization after USPTO disambiguation. "
            "The residual error rate is measured in Phase 2, not assumed here.",
        ],
        notes=[
            "The PatentsView PatentSearch API was retired 2026-03-20 with no "
            "announced replacement; these bulk tables are the surviving source. "
            "See docs/data-source-availability.md.",
            "Checksums are of the files exactly as published by USPTO.",
        ],
    )

    seen: set[Path] = set()
    for table_name in REQUIRED_TABLES:
        path = tables[table_name]
        if path in seen:
            continue
        seen.add(path)

        print(f"\n[{path.name}]")
        print("  checksumming...")
        file_record = FileRecord(
            filename=path.name,
            size_bytes=path.stat().st_size,
            sha256=sha256_file(path),
        )
        size_mib = file_record.size_bytes / (1024 * 1024)
        print(f"  sha256 {file_record.sha256[:16]}...  {size_mib:,.1f} MiB")

        for member in list_members(path):
            label = member or path.name
            resolved = resolve_table(label, table_name)
            columns, delimiter = read_header(path, member)
            print(f"  member {label}: {len(columns)} columns, delimiter {delimiter!r}")
            print("  counting records...")
            count, method = count_records(path, member, delimiter)
            print(f"  -> {count:,} records ({method})")
            file_record.tables.append(
                TableRecord(
                    table=resolved,
                    archive=path.name if member else None,
                    member=label,
                    columns=columns,
                    record_count=count,
                    count_method=method,
                    notes=[REQUIRED_TABLES[resolved]] if resolved in REQUIRED_TABLES else [],
                )
            )
        record.files.append(file_record)

    return record


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--release",
        help=(
            "Release/version date shown on the ODP page at time of download "
            "(e.g. 2026-07-15). Recorded verbatim in the provenance block."
        ),
    )
    parser.add_argument("--slug", default="uspto-pvgpatdis")
    args = parser.parse_args()

    if not args.release:
        print(
            "WARNING: no --release given. The provenance block will read "
            "'NOT RECORDED',\n         which does not satisfy SPEC.md 1.4. "
            "Re-run with --release.\n",
            file=sys.stderr,
        )

    try:
        record = inspect(args.release)
    except FileNotFoundError as exc:
        print(f"\n{exc}\n", file=sys.stderr)
        return 1

    json_path, md_path = record.write(args.slug)
    print(f"\nTotal records across all tables: {record.total_records:,}")
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
