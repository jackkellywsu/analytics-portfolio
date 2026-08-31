"""Write plain-language notes on the detected anomalies.

    .venv/Scripts/python.exe -m pipeline.build_anomaly_narratives

The detector says a day is unusual. It cannot say why, and neither can a language
model - it has no access to the marketing calendar, the incident log, or
anything else that would actually explain a spike. What it can do is describe
what happened in business language and separate that description from any guess
about the cause.

So the tool schema forces the separation: `what_happened` may only restate the
figures it was given, `calendar_context` may name a widely known date or say it
recognises none, and `hypotheses` are explicitly labelled as untested. A model
that blends these into one confident paragraph is the failure this is designed
to prevent, and it is the failure that makes automated anomaly commentary
untrustworthy in practice.
"""

from __future__ import annotations

import json
from pathlib import Path

from pipeline.llm import MODELS, get_client

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "web" / "public" / "data"
PER_SERIES = 6
MODEL = MODELS["haiku"]

SYSTEM = """You annotate anomalies found in a business time series.

You are given one unusual day: the metric, the date, what was observed, what the
detector expected from trend and weekly seasonality, how many robust standard
deviations away that is, and the surrounding days.

You must call the `annotate` tool. The three fields are kept apart on purpose:

- what_happened: restate the figures in plain business language. Facts only.
  No causes, no speculation. Two sentences at most.
- calendar_context: if the date is a widely known public event - a major
  shopping day, a public holiday - name it plainly. If you do not recognise the
  date as anything in particular, say "none identified". Never guess a local or
  company-specific event.
- hypotheses: up to three possible explanations, each phrased as something that
  could be checked. These are untested guesses and will be shown to the reader
  labelled as such. If nothing plausible comes to mind, return an empty list.

The data is a Brazilian e-commerce marketplace, covering 2016 to 2018. Do not
claim to know anything about this company's marketing calendar or operations,
because you do not."""

ANNOTATE_TOOL = {
    "name": "annotate",
    "description": "Describe an anomalous day, keeping fact and speculation separate.",
    "input_schema": {
        "type": "object",
        "properties": {
            "what_happened": {
                "type": "string",
                "description": "Plain restatement of the figures. Facts only, no causes.",
            },
            "calendar_context": {
                "type": "string",
                "description": "A widely known event on this date, or 'none identified'.",
            },
            "hypotheses": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Up to three checkable guesses, labelled as untested.",
            },
            "worth_investigating": {
                "type": "boolean",
                "description": "Whether an analyst should spend time on this one.",
            },
        },
        "required": [
            "what_happened",
            "calendar_context",
            "hypotheses",
            "worth_investigating",
        ],
        "additionalProperties": False,
    },
    "strict": True,
}


def describe(anomaly: dict, label: str) -> str:
    neighbours = ", ".join(
        f"{n['date']}: {n['observed']:.0f}" for n in anomaly["neighbours"]
    )
    return (
        f"Metric: {label}\n"
        f"Date: {anomaly['date']} ({anomaly['weekday']})\n"
        f"Observed: {anomaly['observed']:.0f}\n"
        f"Expected from trend and weekly seasonality: {anomaly['expected']:.1f}\n"
        f"Difference: {anomaly['difference']:+.1f}\n"
        f"Robust z-score: {anomaly['z']:+.1f} ({anomaly['direction']})\n"
        f"Surrounding days: {neighbours}"
    )


def main() -> int:
    path = DATA / "anomalies.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    client = get_client().with_options(max_retries=5)

    spend = 0.0
    annotated = 0

    for series in payload["series"]:
        for anomaly in series["anomalies"][:PER_SERIES]:
            response = client.messages.create(
                model=MODEL.model_id,
                max_tokens=1500,
                system=[
                    {
                        "type": "text",
                        "text": SYSTEM,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                tools=[ANNOTATE_TOOL],
                tool_choice={"type": "tool", "name": "annotate"},
                messages=[{"role": "user", "content": describe(anomaly, series["label"])}],
            )
            usage = response.usage
            spend += MODEL.cost(
                usage.input_tokens,
                usage.output_tokens,
                cache_read_tokens=usage.cache_read_input_tokens or 0,
                cache_write_tokens=usage.cache_creation_input_tokens or 0,
            )
            call = next((b for b in response.content if b.type == "tool_use"), None)
            if call is None:
                continue
            anomaly["note"] = call.input
            annotated += 1
            print(
                f"  {series['key']:<7}{anomaly['date']}  "
                f"{str(call.input.get('calendar_context', ''))[:40]:<42}"
                f"{len(call.input.get('hypotheses', []))} hypotheses"
            )

    payload["narratives"] = {
        "model": MODEL.model_id,
        "annotated": annotated,
        "per_series": PER_SERIES,
        "cost_usd": round(spend, 4),
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"\n{annotated} annotated, ${spend:.4f} spent -> {path.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
