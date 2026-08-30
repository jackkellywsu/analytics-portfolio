"""Publish processed tables and a manifest the site can read.

    .venv/Scripts/python.exe -m pipeline.build_manifest

The manifest is what makes the site's provenance claims mechanical rather than
editorial: table shapes, column types, source records, and cleaning logs are all
generated here, so nothing on a page can drift from what is actually in the
Parquet files.
"""

from __future__ import annotations

import json
import shutil
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

import polars as pl

from pipeline.guardrails import export_policy, load_policy
from pipeline.provenance import PROVENANCE_DIR
from pipeline.quality import QUALITY_DIR

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "pipeline" / "processed"
PUBLIC_DATA = ROOT / "web" / "public" / "data"

# Domain grouping and a plain-language description per table. These are the
# business definitions a reader needs before any number means anything, so they
# live with the data rather than in page copy.
TABLES: dict[str, dict[str, str]] = {
    "crm_opportunities": {
        "domain": "crm",
        "source": "crm_pipeline",
        "grain": "One row per sales opportunity.",
        "description": (
            "Every opportunity in the pipeline, open or closed. Won deals carry a "
            "close value; lost deals carry zero; open deals carry null."
        ),
    },
    "crm_accounts": {
        "domain": "crm",
        "source": "crm_pipeline",
        "grain": "One row per client account.",
        "description": "The client companies opportunities are opened against.",
    },
    "crm_products": {
        "domain": "crm",
        "source": "crm_pipeline",
        "grain": "One row per product.",
        "description": "Product catalogue with list prices, grouped into series.",
    },
    "crm_sales_teams": {
        "domain": "crm",
        "source": "crm_pipeline",
        "grain": "One row per sales agent.",
        "description": "Agents, the manager they report to, and their regional office.",
    },
    "funnel_leads": {
        "domain": "funnel",
        "source": "olist_funnel",
        "grain": "One row per marketing-qualified lead.",
        "description": (
            "Leads that passed marketing qualification, with the channel and "
            "landing page that produced them."
        ),
    },
    "funnel_deals": {
        "domain": "funnel",
        "source": "olist_funnel",
        "grain": "One row per closed deal.",
        "description": (
            "Leads that converted into signed clients, with segment, lead type, "
            "and the reps who worked them."
        ),
    },
    "deal_outcomes": {
        "domain": "funnel",
        "source": "olist_funnel",
        "grain": "One row per closed deal.",
        "description": (
            "Closed deals joined to the revenue that client actually generated "
            "afterwards, with the observation window each deal had. This is the "
            "attribution table; window_complete marks the deals a rate may use."
        ),
    },
    "seller_performance": {
        "domain": "commerce",
        "source": "olist_commerce",
        "grain": "One row per selling client.",
        "description": (
            "Lifetime orders, revenue, and average review score per client, "
            "excluding cancelled orders."
        ),
    },
    "sellers": {
        "domain": "commerce",
        "source": "olist_commerce",
        "grain": "One row per client.",
        "description": "Client registry with location.",
    },
    "orders": {
        "domain": "commerce",
        "source": "olist_commerce",
        "grain": "One row per order.",
        "description": (
            "Orders with status and the purchase, approval, shipping, delivery, "
            "and estimated-delivery timestamps."
        ),
    },
    "order_items": {
        "domain": "commerce",
        "source": "olist_commerce",
        "grain": "One row per item line within an order.",
        "description": (
            "Item lines with price and freight. An order with three items is three "
            "rows, so per-order metrics must aggregate first."
        ),
    },
    "order_reviews": {
        "domain": "commerce",
        "source": "olist_commerce",
        "grain": "One row per review.",
        "description": (
            "Review scores and timestamps. Free-text comments were dropped; no "
            "metric uses them."
        ),
    },
    "products": {
        "domain": "commerce",
        "source": "olist_commerce",
        "grain": "One row per product.",
        "description": "Product attributes with the official English category name.",
    },
    "customers": {
        "domain": "commerce",
        "source": "olist_commerce",
        "grain": "One row per customer record on an order.",
        "description": (
            "End customers. customer_id is per order; customer_unique_id "
            "identifies the person across orders."
        ),
    },
}


def _load_json_dir(directory: Path) -> dict[str, dict]:
    if not directory.exists():
        return {}
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(directory.glob("*.json"))}


def main() -> int:
    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)

    provenance = _load_json_dir(PROVENANCE_DIR)
    quality = _load_json_dir(QUALITY_DIR)

    missing = sorted(set(TABLES) - {p.stem for p in PROCESSED.glob("*.parquet")})
    if missing:
        msg = f"processed tables missing; run the build scripts first: {missing}"
        raise FileNotFoundError(msg)

    tables = []
    total_bytes = 0
    for name, meta in TABLES.items():
        src = PROCESSED / f"{name}.parquet"
        shutil.copy2(src, PUBLIC_DATA / src.name)
        frame = pl.scan_parquet(src)
        schema = frame.collect_schema()
        rows = int(frame.select(pl.len()).collect().item())
        size = src.stat().st_size
        total_bytes += size
        tables.append(
            {
                "name": name,
                **meta,
                "file": f"/data/{src.name}",
                "bytes": size,
                "rows": rows,
                "columns": [
                    {"name": col, "type": str(dtype)}
                    for col, dtype in zip(schema.names(), schema.dtypes())
                ],
                "quality": quality.get(name),
            }
        )

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total_bytes": total_bytes,
        "tables": tables,
        "sources": list(provenance.values()),
    }
    out = PUBLIC_DATA / "manifest.json"
    out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"published {len(tables)} tables -> {PUBLIC_DATA}")
    print(f"  {total_bytes / 1024 / 1024:.1f} MB of Parquet across {len(provenance)} sources")
    for t in tables:
        print(f"    {t['name']:<22} {t['rows']:>8,} rows  {t['bytes'] / 1024:>7.0f} KB")
    print(f"  manifest -> {out}")

    # The validator policy is derived from the manifest that was just written,
    # so it can never describe tables that did not ship.
    policy_path = export_policy(load_policy(manifest_path=out), PUBLIC_DATA / "policy.json")
    print(f"  policy   -> {policy_path}")

    # The layer is authored in YAML because a human maintains it; the site and
    # the prompt builder read JSON. Converting here keeps one source of truth
    # and spares the web app a YAML parser.
    import yaml

    layer = yaml.safe_load((ROOT / "semantic" / "layer.yaml").read_text(encoding="utf-8"))
    layer_path = PUBLIC_DATA / "layer.json"
    # default=str because YAML parses the layer's `updated:` field into a date
    # object, which json cannot serialise on its own.
    layer_path.write_text(
        json.dumps(layer, indent=2, default=str) + "\n", encoding="utf-8"
    )
    # The conformance corpus ships too: the guardrails page runs these exact
    # cases through the real validator in the browser, so what a visitor fires
    # is what the test suite asserts.
    cases_src = ROOT / "semantic" / "guardrail_cases.json"
    shutil.copy2(cases_src, PUBLIC_DATA / "guardrail_cases.json")
    print(f"  cases    -> {PUBLIC_DATA / 'guardrail_cases.json'}")

    print(
        f"  layer    -> {layer_path} "
        f"({len(layer['entities'])} entities, {len(layer['metrics'])} metrics, "
        f"{len(layer['refusals'])} refusal rules)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
