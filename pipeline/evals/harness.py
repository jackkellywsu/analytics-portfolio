"""Run the text-to-SQL benchmark.

    .venv/Scripts/python.exe -m pipeline.evals.harness --limit 3   # smoke test
    .venv/Scripts/python.exe -m pipeline.evals.harness             # full grid

Design decisions worth stating, because they are what makes the numbers mean
anything:

- The prompts and tool definitions come from the production TypeScript module,
  printed by scripts/print-prompt.ts. A benchmark that measures a Python
  reimplementation of the prompt measures a prompt nobody ships.
- Each (model, condition) pair is warmed with one sequential call before the
  rest run concurrently, so the cached prefix is written once instead of being
  written N times in parallel. This is a cost decision, not a correctness one.
- Raw responses are written to JSONL as they arrive. A run that dies halfway
  leaves usable data, and scoring happens separately so it can be re-run and
  corrected without paying for the calls again.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import anthropic

from pipeline.llm import MODELS, get_client

ROOT = Path(__file__).resolve().parent.parent.parent
WEB = ROOT / "web"
EVALS = Path(__file__).resolve().parent
RUNS = EVALS / "runs"

CONDITIONS = ["bare", "layer", "layer_fewshot"]
MODEL_KEYS = ["opus", "sonnet", "haiku"]
SUPPORTS_EFFORT = {"claude-opus-5", "claude-sonnet-5"}


@dataclass
class Result:
    case_id: str
    model: str
    condition: str
    kind: str  # answer | refusal | no_tool | error
    sql: str | None = None
    metrics_used: list[str] | None = None
    confidence: float | None = None
    refusal_id: str | None = None
    explanation: str | None = None
    latency_ms: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    cost_usd: float = 0.0
    error: str | None = None


def render(condition: str) -> str:
    """Ask the production module for a prompt, so there is one source of truth."""
    result = subprocess.run(
        ["npx", "tsx", "scripts/print-prompt.ts", condition],
        cwd=WEB,
        capture_output=True,
        text=True,
        encoding="utf-8",
        shell=True,
        check=True,
    )
    if not result.stdout.strip():
        msg = f"empty prompt for condition {condition}: {result.stderr[:300]}"
        raise RuntimeError(msg)
    return result.stdout


def load_tools() -> list[dict]:
    result = subprocess.run(
        ["npx", "tsx", "scripts/print-prompt.ts", "tools"],
        cwd=WEB,
        capture_output=True,
        text=True,
        encoding="utf-8",
        shell=True,
        check=True,
    )
    return json.loads(result.stdout)


def load_cases() -> list[dict]:
    return json.loads((EVALS / "cases.json").read_text(encoding="utf-8"))["cases"]


class Spend:
    """Thread-safe running total, so a runaway grid can be stopped."""

    def __init__(self, ceiling: float) -> None:
        self.total = 0.0
        self.ceiling = ceiling
        self.calls = 0
        self._lock = threading.Lock()

    def add(self, amount: float) -> bool:
        with self._lock:
            self.total += amount
            self.calls += 1
            return self.total < self.ceiling


def ask_once(
    client: anthropic.Anthropic,
    model_key: str,
    condition: str,
    prompt: str,
    tools: list[dict],
    case: dict,
    effort: str,
) -> Result:
    pricing = MODELS[model_key]
    started = time.time()
    try:
        kwargs = {
            "model": pricing.model_id,
            "max_tokens": 4000,
            "system": [
                {
                    "type": "text",
                    "text": prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            "tools": tools,
            "tool_choice": {"type": "any"},
            "messages": [{"role": "user", "content": case["question"]}],
        }
        if pricing.model_id in SUPPORTS_EFFORT:
            kwargs["output_config"] = {"effort": effort}
        response = client.messages.create(**kwargs)
    except Exception as error:  # noqa: BLE001
        return Result(
            case_id=case["id"],
            model=model_key,
            condition=condition,
            kind="error",
            latency_ms=int((time.time() - started) * 1000),
            error=f"{type(error).__name__}: {str(error)[:240]}",
        )

    usage = response.usage
    cost = pricing.cost(
        usage.input_tokens,
        usage.output_tokens,
        cache_read_tokens=usage.cache_read_input_tokens or 0,
        cache_write_tokens=usage.cache_creation_input_tokens or 0,
    )
    base = {
        "case_id": case["id"],
        "model": model_key,
        "condition": condition,
        "latency_ms": int((time.time() - started) * 1000),
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "cache_read_tokens": usage.cache_read_input_tokens or 0,
        "cache_write_tokens": usage.cache_creation_input_tokens or 0,
        "cost_usd": round(cost, 6),
    }

    call = next((b for b in response.content if b.type == "tool_use"), None)
    if call is None:
        return Result(**base, kind="no_tool")
    payload = call.input if isinstance(call.input, dict) else {}
    if call.name == "refuse":
        return Result(
            **base,
            kind="refusal",
            refusal_id=str(payload.get("refusal_id", "")),
            explanation=str(payload.get("explanation", "")),
        )
    return Result(
        **base,
        kind="answer",
        sql=str(payload.get("sql", "")),
        metrics_used=list(payload.get("metrics_used", []) or []),
        confidence=float(payload.get("confidence", 0) or 0),
        explanation=str(payload.get("explanation", "")),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, help="Only run the first N cases.")
    parser.add_argument("--models", nargs="+", default=MODEL_KEYS)
    parser.add_argument("--conditions", nargs="+", default=CONDITIONS)
    parser.add_argument("--effort", default="medium")
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument(
        "--budget",
        type=float,
        default=8.0,
        help="Stop the run if spend passes this, in USD.",
    )
    args = parser.parse_args()

    cases = load_cases()
    if args.limit:
        cases = cases[: args.limit]
    tools = load_tools()
    prompts = {c: render(c) for c in args.conditions}

    client = get_client()
    # Retries matter here: a 429 halfway through a paid grid should cost time,
    # not data.
    client = client.with_options(max_retries=6)

    spend = Spend(args.budget)
    RUNS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = RUNS / f"{stamp}.jsonl"
    write_lock = threading.Lock()

    total = len(cases) * len(args.models) * len(args.conditions)
    print(f"{total} calls: {len(cases)} cases x {len(args.models)} models x {len(args.conditions)} conditions")
    print(f"budget ceiling ${args.budget:.2f}, writing to {out_path.name}\n")

    completed = 0
    stopped = False

    with out_path.open("w", encoding="utf-8") as handle:

        def record(result: Result) -> None:
            nonlocal completed
            with write_lock:
                handle.write(json.dumps(asdict(result)) + "\n")
                handle.flush()
                completed += 1
                if completed % 25 == 0 or completed == total:
                    print(
                        f"  {completed:>4}/{total}  ${spend.total:.3f} spent",
                        flush=True,
                    )

        for model_key in args.models:
            for condition in args.conditions:
                if stopped:
                    break
                # Warm the cache once, sequentially, before fanning out.
                warm = ask_once(
                    client, model_key, condition, prompts[condition], tools, cases[0], args.effort
                )
                record(warm)
                if not spend.add(warm.cost_usd):
                    print(f"\nSTOPPED: budget ceiling ${args.budget} reached")
                    stopped = True
                    break

                remaining = cases[1:]
                with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
                    futures = {
                        pool.submit(
                            ask_once,
                            client,
                            model_key,
                            condition,
                            prompts[condition],
                            tools,
                            case,
                            args.effort,
                        ): case
                        for case in remaining
                    }
                    for future in as_completed(futures):
                        result = future.result()
                        record(result)
                        if not spend.add(result.cost_usd):
                            print(f"\nSTOPPED: budget ceiling ${args.budget} reached")
                            stopped = True
                            for pending in futures:
                                pending.cancel()
                            break

    print(f"\n{spend.calls} calls, ${spend.total:.4f} spent")
    print(f"raw results -> {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
