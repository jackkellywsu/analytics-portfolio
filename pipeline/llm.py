"""Anthropic client construction and cost accounting.

The key is read from the environment (or a gitignored .env) and never logged,
printed, or written to any artefact. Every benchmark result records token counts
and computed cost so the spend behind a published number is auditable.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import anthropic
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent

# Prices in USD per million tokens, from the Anthropic pricing page.
# Batch requests bill at 50%; cache reads at 0.1x input, cache writes at 1.25x.
@dataclass(frozen=True)
class ModelPricing:
    model_id: str
    label: str
    input_per_mtok: float
    output_per_mtok: float

    def cost(
        self,
        input_tokens: int,
        output_tokens: int,
        cache_read_tokens: int = 0,
        cache_write_tokens: int = 0,
        batch: bool = False,
    ) -> float:
        dollars = (
            input_tokens * self.input_per_mtok
            + output_tokens * self.output_per_mtok
            + cache_read_tokens * self.input_per_mtok * 0.1
            + cache_write_tokens * self.input_per_mtok * 1.25
        ) / 1_000_000
        return dollars * (0.5 if batch else 1.0)


MODELS: dict[str, ModelPricing] = {
    "opus": ModelPricing("claude-opus-5", "Claude Opus 5", 5.00, 25.00),
    "sonnet": ModelPricing("claude-sonnet-5", "Claude Sonnet 5", 2.00, 10.00),
    "haiku": ModelPricing("claude-haiku-4-5", "Claude Haiku 4.5", 1.00, 5.00),
}


def get_client() -> anthropic.Anthropic:
    """Build a client from ANTHROPIC_API_KEY, loading .env if present."""
    load_dotenv(ROOT / ".env")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        msg = (
            "ANTHROPIC_API_KEY is not set. Put it in a .env file at the repository "
            "root (the file is gitignored) or export it in your shell."
        )
        raise RuntimeError(msg)
    return anthropic.Anthropic()


def check() -> int:
    """Prove the credential works without printing any part of it.

    Two probes: token counting, which is free and authenticates, and one
    minimal completion, which proves the account can actually be billed.
    """
    try:
        client = get_client()
    except RuntimeError as error:
        print(f"FAIL  {error}")
        return 1

    probe = [{"role": "user", "content": "ping"}]

    try:
        counted = client.messages.count_tokens(
            model=MODELS["haiku"].model_id, messages=probe
        )
        print(f"ok    authenticated (token counting returned {counted.input_tokens} tokens)")
    except anthropic.AuthenticationError:
        print("FAIL  the key was rejected as invalid")
        return 1
    except anthropic.APIError as error:
        print(f"FAIL  {type(error).__name__} during token counting")
        return 1

    try:
        response = client.messages.create(
            model=MODELS["haiku"].model_id, max_tokens=1, messages=probe
        )
    except anthropic.APIStatusError as error:
        print(f"FAIL  {type(error).__name__} ({error.status_code}) on a billed call")
        return 1

    usage = response.usage
    spent = MODELS["haiku"].cost(usage.input_tokens, usage.output_tokens)
    print(
        f"ok    billed call succeeded on {MODELS['haiku'].label}: "
        f"{usage.input_tokens} in / {usage.output_tokens} out, cost ${spent:.8f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(check())
