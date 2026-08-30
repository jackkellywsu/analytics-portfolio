"""Record real answers and refusals for the pre-run gallery.

    .venv/Scripts/python.exe -m pipeline.build_ask_gallery

The gallery is what the /ask page serves when the live translator is
unavailable - no key configured, rate limit hit, budget spent, or the API down.
Every entry is the recorded output of actually asking that question through the
same route a visitor uses, so the fallback shows real behaviour rather than a
hand-written mock-up of it.

Requires the dev server running on :3000 and a key in .env. Respects the route's
own rate limiter by pausing between questions, which is slower but avoids
special-casing the guardrail for the tool that is meant to exercise it.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "data" / "ask-gallery.json"
URL = "http://localhost:3000/api/ask"

# Chosen to cover the range: a simple aggregate, a join, a metric with a
# mandatory filter, and one of each refusal category the layer defines.
QUESTIONS = [
    "Which acquisition channel produced the most revenue per lead?",
    "What is the win rate by client sector?",
    "How many qualified leads became signed clients?",
    "Which states have the worst on-time delivery rate?",
    "What share of signed clients ever generated revenue?",
    "Which product series takes longest to close?",
    "Which acquisition channel has the best ROI?",
    "Will paid search convert better next quarter?",
    "Did the email campaign cause the increase in signed clients?",
    "Compare the CRM win rate to the marketplace conversion rate.",
    "What is the name of our largest customer?",
]

PAUSE_SECONDS = 14


def ask(question: str) -> dict:
    body = json.dumps({"question": question}).encode()
    request = urllib.request.Request(
        URL, data=body, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        return json.loads(error.read())


def main() -> int:
    examples: list[dict] = []
    spend = 0.0

    for i, question in enumerate(QUESTIONS, start=1):
        if i > 1:
            time.sleep(PAUSE_SECONDS)
        result = ask(question)
        kind = result.get("kind")
        meta = result.get("meta", {})
        spend += meta.get("costUsd", 0.0)

        if kind not in {"answer", "refusal"}:
            print(f"  [{i:>2}] SKIPPED ({kind}): {question}")
            continue

        examples.append({"question": question, **result})
        marker = "refused" if kind == "refusal" else "answered"
        detail = (
            result.get("refusal_id", "")
            if kind == "refusal"
            else f"conf {result.get('confidence', 0):.2f}"
        )
        print(
            f"  [{i:>2}] {marker:<9} {detail:<18} "
            f"{meta.get('latencyMs', 0) / 1000:>5.1f}s  ${meta.get('costUsd', 0):.4f}  {question}"
        )

    answered = sum(1 for e in examples if e["kind"] == "answer")
    refused = len(examples) - answered

    OUT.write_text(
        json.dumps(
            {
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "note": (
                    "Recorded output from the live /api/ask route. Served when the "
                    "live translator is unavailable, and labelled as pre-run when it is."
                ),
                "examples": examples,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        f"\n{len(examples)} examples ({answered} answered, {refused} refused) "
        f"-> {OUT.name}, ${spend:.4f} spent"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
