"""Score a benchmark run and compute the statistics the site publishes.

    .venv/Scripts/python.exe -m pipeline.evals.analyze

Scoring is separate from running so it can be re-run, corrected, and argued with
without paying for the API calls again. The raw responses in runs/*.jsonl are the
record; everything here is derived from them and can be regenerated.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from pipeline.evals.scoring import Outcome, score_case
from pipeline.evals.verify_gold import connect, load_cases
from pipeline.llm import MODELS
from pipeline.stats import calibration, compare_paired, wilson

EVALS = Path(__file__).resolve().parent
RUNS = EVALS / "runs"
OUT = EVALS.parent.parent / "web" / "public" / "data"

CONDITION_LABELS = {
    "bare": "Bare schema",
    "layer": "Semantic layer",
    "layer_fewshot": "Layer + examples",
}


def latest_run() -> Path:
    runs = sorted(RUNS.glob("*.jsonl"))
    if not runs:
        msg = "no runs found; run pipeline.evals.harness first"
        raise FileNotFoundError(msg)
    return runs[-1]


def rate(successes: int, trials: int) -> dict:
    return {"n": trials, "successes": successes, **wilson(successes, trials).as_dict()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, help="Path to a run JSONL. Defaults to latest.")
    args = parser.parse_args()

    run_path = args.run or latest_run()
    raw = [json.loads(line) for line in run_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    cases = {case["id"]: case for case in load_cases()}
    connection = connect()

    # Score every response. Deduplicate on (case, model, condition): the warm-up
    # call repeats the first case, and counting it twice would weight that one
    # question three times more than the rest.
    scored: dict[tuple[str, str, str], dict] = {}
    for row in raw:
        key = (row["case_id"], row["model"], row["condition"])
        if key in scored:
            continue
        case = cases.get(row["case_id"])
        if case is None:
            continue

        lenient = False
        if row["kind"] == "error":
            outcome, correct, detail = Outcome.API_ERROR, False, row.get("error", "")
            dropped = False
        elif row["kind"] == "no_tool":
            outcome, correct, detail = Outcome.NO_TOOL_CALL, False, ""
            dropped = False
        elif row["kind"] == "refusal":
            # Every case in this benchmark is answerable, so a refusal is wrong
            # by construction. Refusal quality is a separate question.
            outcome, correct, detail = Outcome.FALSE_REFUSAL, False, row.get("refusal_id", "")
            dropped = False
        else:
            score = score_case(
                connection,
                case["gold_sql"],
                row.get("sql"),
                required_filter=_required_filter(case),
            )
            outcome, correct, detail = score.outcome, score.correct, score.detail
            dropped = score.dropped_required_filter
            lenient = score.correct_lenient

        scored[key] = {
            **row,
            "outcome": str(outcome),
            "correct": correct,
            "correct_lenient": correct or lenient,
            "detail": detail,
            "dropped_required_filter": dropped,
            "difficulty": case["difficulty"],
            "domain": case["domain"],
            "trap_kind": case.get("trap_kind"),
            "question": case["question"],
            "gold_sql": case["gold_sql"],
        }

    rows = list(scored.values())
    models = sorted({r["model"] for r in rows}, key=lambda m: -MODELS[m].input_per_mtok)
    conditions = [c for c in ["bare", "layer", "layer_fewshot"] if any(r["condition"] == c for r in rows)]
    case_ids = sorted({r["case_id"] for r in rows})

    def cell(model: str, condition: str) -> list[dict]:
        subset = {r["case_id"]: r for r in rows if r["model"] == model and r["condition"] == condition}
        return [subset[cid] for cid in case_ids if cid in subset]

    # Accuracy grid.
    accuracy = []
    for model in models:
        for condition in conditions:
            items = cell(model, condition)
            if not items:
                continue
            correct = sum(1 for r in items if r["correct"])
            lenient_correct = sum(1 for r in items if r["correct_lenient"])
            accuracy.append(
                {
                    "model": model,
                    "model_label": MODELS[model].label,
                    "condition": condition,
                    "condition_label": CONDITION_LABELS[condition],
                    "rate": rate(correct, len(items)),
                    "rate_lenient": rate(lenient_correct, len(items)),
                    "extra_columns": sum(1 for r in items if r["outcome"] == str(Outcome.EXTRA_COLUMNS)),
                    "cost_usd": round(sum(r["cost_usd"] for r in items), 4),
                    "cost_per_query": round(sum(r["cost_usd"] for r in items) / len(items), 6),
                    "median_latency_ms": sorted(r["latency_ms"] for r in items)[len(items) // 2],
                    "false_refusals": sum(1 for r in items if r["outcome"] == str(Outcome.FALSE_REFUSAL)),
                    "dropped_filters": sum(1 for r in items if r["dropped_required_filter"]),
                }
            )

    # The ablation: what the semantic layer is worth, measured on the same cases.
    ablation = []
    for model in models:
        for a, b in [("layer", "bare"), ("layer_fewshot", "layer"), ("layer_fewshot", "bare")]:
            left, right = cell(model, a), cell(model, b)
            if not left or not right:
                continue
            shared = sorted(set(r["case_id"] for r in left) & set(r["case_id"] for r in right))
            entry = {
                "model": model,
                "model_label": MODELS[model].label,
                "a": a,
                "b": b,
                "a_label": CONDITION_LABELS[a],
                "b_label": CONDITION_LABELS[b],
            }
            # Every comparison is reported under both scorings. The strict one
            # penalises extra columns; the lenient one does not. Publishing only
            # the flattering number would be the same failure this whole page is
            # about.
            for key, field in [("strict", "correct"), ("lenient", "correct_lenient")]:
                left_map = {r["case_id"]: r[field] for r in left}
                right_map = {r["case_id"]: r[field] for r in right}
                entry[key] = compare_paired(
                    [left_map[c] for c in shared], [right_map[c] for c in shared]
                ).as_dict()
            ablation.append(entry)

    # Model comparison, holding the prompt fixed at what production uses.
    model_comparison = []
    for i, a in enumerate(models):
        for b in models[i + 1 :]:
            left, right = cell(a, "layer"), cell(b, "layer")
            if not left or not right:
                continue
            shared = sorted(set(r["case_id"] for r in left) & set(r["case_id"] for r in right))
            entry = {}
            for key, field in [("strict", "correct"), ("lenient", "correct_lenient")]:
                left_map = {r["case_id"]: r[field] for r in left}
                right_map = {r["case_id"]: r[field] for r in right}
                entry[key] = compare_paired(
                    [left_map[c] for c in shared], [right_map[c] for c in shared]
                ).as_dict()
            model_comparison.append(
                {
                    "a": a,
                    "b": b,
                    "a_label": MODELS[a].label,
                    "b_label": MODELS[b].label,
                    "condition": "layer",
                    **entry,
                }
            )

    # Accuracy by difficulty, and by the trap each case sets.
    by_difficulty = []
    for condition in conditions:
        for difficulty in ["easy", "medium", "hard"]:
            items = [r for r in rows if r["condition"] == condition and r["difficulty"] == difficulty]
            if not items:
                continue
            by_difficulty.append(
                {
                    "condition": condition,
                    "condition_label": CONDITION_LABELS[condition],
                    "difficulty": difficulty,
                    "rate": rate(sum(1 for r in items if r["correct"]), len(items)),
                    "rate_lenient": rate(
                        sum(1 for r in items if r["correct_lenient"]), len(items)
                    ),
                }
            )

    trap_kinds = sorted({r["trap_kind"] for r in rows if r["trap_kind"]})
    by_trap = []
    for condition in conditions:
        for trap in trap_kinds:
            items = [r for r in rows if r["condition"] == condition and r["trap_kind"] == trap]
            if not items:
                continue
            by_trap.append(
                {
                    "condition": condition,
                    "condition_label": CONDITION_LABELS[condition],
                    "trap_kind": trap,
                    "rate": rate(sum(1 for r in items if r["correct"]), len(items)),
                    "rate_lenient": rate(
                        sum(1 for r in items if r["correct_lenient"]), len(items)
                    ),
                }
            )

    # Error taxonomy: which failure, at which difficulty, under which prompt.
    taxonomy: dict[str, int] = defaultdict(int)
    for r in rows:
        if r["correct"]:
            continue
        taxonomy[f"{r['condition']}|{r['difficulty']}|{r['outcome']}"] += 1
    heatmap = [
        {
            "condition": key.split("|")[0],
            "difficulty": key.split("|")[1],
            "outcome": key.split("|")[2],
            "count": count,
        }
        for key, count in sorted(taxonomy.items())
    ]

    # Calibration, per model, on the production prompt.
    calibrations = []
    for model in models:
        items = [r for r in cell(model, "layer") if r.get("confidence") is not None]
        if not items:
            continue
        calibrations.append(
            {
                "model": model,
                "model_label": MODELS[model].label,
                **calibration([r["confidence"] for r in items], [r["correct"] for r in items]),
                "lenient": calibration(
                    [r["confidence"] for r in items], [r["correct_lenient"] for r in items]
                ),
            }
        )

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "run_file": run_path.name,
        "cases": len(case_ids),
        "calls": len(rows),
        "total_cost_usd": round(sum(r["cost_usd"] for r in rows), 4),
        "models": [{"key": m, "label": MODELS[m].label} for m in models],
        "conditions": [{"key": c, "label": CONDITION_LABELS[c]} for c in conditions],
        "accuracy": accuracy,
        "ablation": ablation,
        "model_comparison": model_comparison,
        "by_difficulty": by_difficulty,
        "by_trap": by_trap,
        "error_heatmap": heatmap,
        "calibration": calibrations,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "evals.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    # Case-level detail, kept in its own file so the summary stays small.
    detail = [
        {
            "case_id": r["case_id"],
            "model": r["model"],
            "condition": r["condition"],
            "question": r["question"],
            "difficulty": r["difficulty"],
            "trap_kind": r["trap_kind"],
            "outcome": r["outcome"],
            "correct": r["correct"],
            "detail": r["detail"][:200],
            "confidence": r.get("confidence"),
            "gold_sql": r["gold_sql"],
            "sql": r.get("sql"),
            "refusal_id": r.get("refusal_id"),
        }
        for r in sorted(rows, key=lambda r: (r["case_id"], r["model"], r["condition"]))
    ]
    (OUT / "evals-cases.json").write_text(
        json.dumps({"cases": detail}, indent=2) + "\n", encoding="utf-8"
    )

    print(f"{len(rows)} scored results from {run_path.name}, ${payload['total_cost_usd']:.4f}")
    print(
        f"\n{'model':<9}{'condition':<16}{'strict':>9}{'lenient':>9}"
        f"{'extra':>7}{'refuse':>8}{'$/query':>9}"
    )
    for row in accuracy:
        print(
            f"{row['model']:<9}{row['condition']:<16}{row['rate']['point']:>8.1%}"
            f"{row['rate_lenient']['point']:>9.1%}{row['extra_columns']:>7}"
            f"{row['false_refusals']:>8}{row['cost_per_query']:>9.4f}"
        )

    def mark(comparison: dict) -> str:
        return "*" if comparison["significant"] else " "

    print("\nablation (paired, same cases), strict | lenient:")
    for row in ablation:
        strict, lenient = row["strict"], row["lenient"]
        print(
            f"  {row['model']:<7}{row['a_label']:<17} vs {row['b_label']:<17} "
            f"{strict['difference']:+6.1%} p={strict['p_value']:.4f}{mark(strict)} | "
            f"{lenient['difference']:+6.1%} p={lenient['p_value']:.4f}{mark(lenient)}"
        )

    print("\nmodel comparison on the production prompt, strict | lenient:")
    for row in model_comparison:
        strict, lenient = row["strict"], row["lenient"]
        print(
            f"  {row['a_label']:<17} vs {row['b_label']:<17} "
            f"{strict['difference']:+6.1%} p={strict['p_value']:.4f}{mark(strict)} | "
            f"{lenient['difference']:+6.1%} p={lenient['p_value']:.4f}{mark(lenient)}"
        )

    print(f"\n-> {OUT / 'evals.json'}")
    return 0


def _required_filter(case: dict) -> str | None:
    """The filter this case's trap is about, if it has one."""
    if case.get("trap_kind") != "missing_required_filter":
        return None
    gold = case["gold_sql"].lower()
    for candidate in ["window_complete", "is_closed", "order_delivered_customer_date", "<> 'canceled'"]:
        if candidate in gold:
            return candidate
    return None


if __name__ == "__main__":
    raise SystemExit(main())
