"""Validate the practice-area sector map against the official CPC scheme.

    .venv/Scripts/python.exe -m pipeline.build_sector_map

The mapping in pipeline/semantic/sector_cpc_map.yaml is analyst judgment: which
technologies imply demand for which legal practice. This script does not second-guess
that judgment. It checks the mechanical parts that judgment rests on:

  * every mapped code actually exists in the published CPC scheme
  * every code gets its official title attached, never a remembered one
  * no code is silently claimed by two sectors without the overlap being reported
  * coverage against the full scheme is measured, so the unmapped remainder is a
    published number rather than an unexamined blind spot

Outputs pipeline/processed/sector_cpc_map.json (consumed downstream and by the site)
and docs/cpc-sector-mapping.md (the reviewable writeup).
"""

from __future__ import annotations

import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import yaml

from pipeline.provenance import (
    FileRecord,
    ProvenanceRecord,
    TableRecord,
    sha256_file,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
MAP_PATH = REPO_ROOT / "pipeline" / "semantic" / "sector_cpc_map.yaml"
CPC_ZIP = REPO_ROOT / "pipeline" / "raw" / "CPCTitleList202608.zip"
OUT_JSON = REPO_ROOT / "pipeline" / "processed" / "sector_cpc_map.json"
OUT_DOC = REPO_ROOT / "docs" / "cpc-sector-mapping.md"

CPC_SOURCE_URL = (
    "https://www.cooperativepatentclassification.org/sites/default/files/"
    "cpc/bulk/CPCTitleList202608.zip"
)


def load_cpc_titles(zip_path: Path) -> tuple[dict[str, str], dict[str, int]]:
    """Return {symbol: title} and per-section symbol counts from the CPC Title List.

    Format is tab-separated: symbol, hierarchy level, title.
    """
    titles: dict[str, str] = {}
    per_section: dict[str, int] = {}
    with zipfile.ZipFile(zip_path) as archive:
        for info in sorted(archive.infolist(), key=lambda i: i.filename):
            if info.is_dir() or not info.filename.endswith(".txt"):
                continue
            count = 0
            with archive.open(info) as handle:
                for raw in handle:
                    parts = raw.decode("utf-8", errors="replace").rstrip("\r\n").split("\t")
                    if len(parts) < 3 or not parts[0]:
                        continue
                    titles[parts[0].strip()] = parts[2].strip()
                    count += 1
            per_section[info.filename] = count
    return titles, per_section


def match_prefix(code: str) -> str:
    """The string a patent's CPC symbol must start with to belong to this code.

    A subclass (H01M) matches itself. A main group (H01L31/00) must match its
    subgroups too (H01L31/0203), so the trailing '00' is dropped to leave 'H01L31/'.
    """
    if "/" in code:
        stem, _, _ = code.partition("/")
        return f"{stem}/"
    return code


def is_subclass(symbol: str) -> bool:
    """Subclass symbols are exactly 4 chars: letter, 2 digits, letter (e.g. A61B)."""
    return (
        len(symbol) == 4
        and symbol[0].isalpha()
        and symbol[1:3].isdigit()
        and symbol[3].isalpha()
    )


def fetch_cpc_titles(dest: Path) -> None:
    """Download the CPC Title List if absent.

    Unauthenticated and ~4.7 MB, so a fresh clone can reproduce this step with one
    command. The edition is pinned in the URL; a new edition is a deliberate edit to
    the YAML, never a silent upgrade underneath a published result.
    """
    if dest.exists():
        return
    import requests

    print(f"CPC Title List not cached; downloading edition 2026.08...")
    dest.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(CPC_SOURCE_URL, stream=True, timeout=180) as response:
        response.raise_for_status()
        tmp = dest.with_suffix(dest.suffix + ".part")
        with tmp.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1 << 20):
                handle.write(chunk)
        tmp.replace(dest)
    print(f"  saved {dest.name} ({dest.stat().st_size:,} bytes)")


def build() -> int:
    try:
        fetch_cpc_titles(CPC_ZIP)
    except Exception as exc:  # noqa: BLE001 - surface any network/IO failure plainly
        print(
            f"Could not obtain the CPC Title List: {exc}\n"
            f"  Download manually from {CPC_SOURCE_URL}\n"
            f"  and save it to {CPC_ZIP}",
            file=sys.stderr,
        )
        return 1

    spec = yaml.safe_load(MAP_PATH.read_text(encoding="utf-8"))
    titles, per_section = load_cpc_titles(CPC_ZIP)
    print(f"CPC scheme loaded: {len(titles):,} symbols across {len(per_section)} sections")

    all_subclasses = {s for s in titles if is_subclass(s)}
    print(f"  of which subclasses: {len(all_subclasses):,}")

    errors: list[str] = []
    prefix_owners: dict[str, list[str]] = defaultdict(list)
    resolved: dict[str, dict] = {}

    for key, sector in spec["sectors"].items():
        entries = []
        for entry in sector.get("codes", []):
            code = entry["code"]
            title = titles.get(code)
            if title is None:
                errors.append(
                    f"{key}: code {code!r} does not exist in CPC edition "
                    f"{spec['cpc_edition']}"
                )
                continue
            prefix = match_prefix(code)
            prefix_owners[prefix].append(key)
            entries.append(
                {
                    "code": code,
                    "official_title": title,
                    "match_prefix": prefix,
                    "level": "group" if "/" in code else "subclass",
                    "why": entry["why"].strip(),
                }
            )
        resolved[key] = {
            "label": sector["label"],
            "thesis": sector["thesis"].strip(),
            "codes": entries,
            "excluded_codes": [
                {
                    "code": e["code"],
                    "official_title": titles.get(e["code"], "(not in scheme)"),
                    "why": e["why"].strip(),
                }
                for e in sector.get("excluded_codes", [])
            ],
        }
        print(f"  {sector['label']}: {len(entries)} codes validated")

    if errors:
        print("\nVALIDATION FAILED", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    collisions = {p: s for p, s in prefix_owners.items() if len(set(s)) > 1}

    # Coverage: how much of the CPC subclass space do the sectors touch?
    mapped_subclasses = {
        e["code"] for s in resolved.values() for e in s["codes"] if e["level"] == "subclass"
    }
    coverage_pct = 100 * len(mapped_subclasses) / len(all_subclasses)

    output = {
        "version": spec["version"],
        "firm": spec["firm"],
        "cpc_edition": spec["cpc_edition"],
        "cpc_source": CPC_SOURCE_URL,
        "cpc_symbols_in_scheme": len(titles),
        "cpc_subclasses_in_scheme": len(all_subclasses),
        "subclasses_mapped": len(mapped_subclasses),
        "subclass_coverage_pct": round(coverage_pct, 2),
        "cross_sector_prefix_collisions": collisions,
        "decisions": spec["decisions"],
        "sectors": resolved,
        "known_limitations": spec["known_limitations"],
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    OUT_DOC.write_text(render_doc(output), encoding="utf-8")

    record = ProvenanceRecord(
        source_name="Cooperative Patent Classification - CPC Title List",
        source_url=CPC_SOURCE_URL,
        access_method="Direct HTTPS download, no authentication required",
        retrieved_at=ProvenanceRecord.now_utc(),
        release_version=f"CPC edition {spec['cpc_edition']} (files dated 2026-08-01)",
        files=[
            FileRecord(
                filename=CPC_ZIP.name,
                size_bytes=CPC_ZIP.stat().st_size,
                sha256=sha256_file(CPC_ZIP),
                tables=[
                    TableRecord(
                        table=name.removesuffix(".txt"),
                        archive=CPC_ZIP.name,
                        member=name,
                        columns=["symbol", "level", "title"],
                        record_count=count,
                        count_method="line count (fixed 3-column TSV, no quoting)",
                    )
                    for name, count in sorted(per_section.items())
                ],
            )
        ],
        known_gaps=[
            "The CPC scheme is revised quarterly. Codes valid in edition "
            f"{spec['cpc_edition']} may be reclassified later; the edition is pinned "
            "here so a rebuild is reproducible.",
            f"The sector map touches {len(mapped_subclasses)} of {len(all_subclasses)} "
            f"CPC subclasses ({coverage_pct:.1f}%). The remainder is out of scope for "
            "this firm's practice areas, not missing.",
        ],
        notes=[
            "Used to validate pipeline/semantic/sector_cpc_map.yaml. Every CPC title "
            "in the sector map is attached from this file, never written by hand.",
        ],
    )
    record.write("cpc-title-list")

    print(f"\nSubclass coverage: {len(mapped_subclasses)}/{len(all_subclasses)} "
          f"({coverage_pct:.2f}% of the CPC subclass space)")
    if collisions:
        print("Cross-sector prefix collisions (expected; see decision overlap-allowed):")
        for prefix, owners in collisions.items():
            print(f"  {prefix} -> {', '.join(sorted(set(owners)))}")
    else:
        print("No cross-sector prefix collisions.")
    print(f"\nWrote {OUT_JSON}")
    print(f"Wrote {OUT_DOC}")
    print("Wrote docs/provenance/cpc-title-list.{json,md}")
    return 0


def render_doc(output: dict) -> str:
    lines = [
        "# CPC to practice-area sector mapping",
        "",
        "<!-- Generated by pipeline/build_sector_map.py. Edit the YAML, not this file. -->",
        "",
        f"Target firm: **{output['firm']}** · CPC edition **{output['cpc_edition']}**",
        "",
        "Every code below was validated against the official CPC scheme and its title "
        "attached from the published title list. The *why* column is analyst judgment "
        "and is the part worth arguing with.",
        "",
        "| | |",
        "|---|---|",
        f"| CPC symbols in scheme | {output['cpc_symbols_in_scheme']:,} |",
        f"| CPC subclasses in scheme | {output['cpc_subclasses_in_scheme']:,} |",
        f"| Subclasses mapped to a sector | {output['subclasses_mapped']} |",
        f"| Subclass coverage | {output['subclass_coverage_pct']}% |",
        "",
        "Low coverage is expected and correct: four practice areas should not span all "
        "of human invention.",
        "",
        "## Cross-cutting decisions",
        "",
    ]
    for decision in output["decisions"]:
        lines += [
            f"### `{decision['id']}`",
            "",
            f"**Decision.** {decision['decision'].strip()}",
            "",
            f"**Why.** {decision['rationale'].strip()}",
            "",
            f"**Consequence.** {decision['consequence'].strip()}",
            "",
        ]

    lines += ["## Sectors", ""]
    for sector in output["sectors"].values():
        lines += [
            f"### {sector['label']}",
            "",
            sector["thesis"],
            "",
            "| CPC | Official title | Matches | Why this sector |",
            "|---|---|---|---|",
        ]
        for entry in sector["codes"]:
            title = entry["official_title"]
            if len(title) > 90:
                title = title[:87] + "..."
            lines.append(
                f"| `{entry['code']}` | {title} | `{entry['match_prefix']}*` | "
                f"{entry['why']} |"
            )
        lines.append("")
        if sector["excluded_codes"]:
            lines += ["**Deliberately excluded:**", ""]
            for entry in sector["excluded_codes"]:
                lines.append(f"- `{entry['code']}` — {entry['why']}")
            lines.append("")

    collisions = output["cross_sector_prefix_collisions"]
    lines += ["## Cross-sector overlap", ""]
    if collisions:
        lines += [
            "These prefixes are claimed by more than one sector. This is intended "
            "(see `overlap-allowed`) and is why sector counts must never be summed.",
            "",
        ]
        lines += [
            f"- `{p}` → {', '.join(sorted(set(o)))}" for p, o in collisions.items()
        ]
    else:
        lines.append(
            "No CPC prefix is claimed by two sectors. Overlap between sectors can "
            "still occur at the company level, and will be reported once the patent "
            "data is joined."
        )
    lines += ["", "## Known limitations", ""]
    lines += [f"- {lim}" for lim in output["known_limitations"]]
    lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(build())
