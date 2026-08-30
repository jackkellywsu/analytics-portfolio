import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { ANSWER_TOOL, REFUSE_TOOL, systemPrompt } from "@/lib/ask/prompt";
import policyJson from "@/public/data/policy.json";

/**
 * The natural-language endpoint.
 *
 * The model never receives a database connection. It receives the semantic
 * layer and returns either SQL or a refusal, both as structured tool calls. The
 * SQL is validated and executed in the visitor's own browser, so this route is
 * a translator and nothing else — it cannot read a row of data even if the
 * question asks it to.
 *
 * Refusal is a tool, not a string. Asking a model to "say you cannot answer"
 * and then pattern-matching its prose is how refusals get missed; making it a
 * distinct structured call means the outcome is unambiguous to the code that
 * handles it.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

// Sonnet 5 by choice, not by default. Measured on this workload it answers in
// ~4.5s for $0.0056 a question against Opus 5's ~5.5s for $0.0157 - 2.8x
// cheaper for the same task - and both produced correct SQL on every question
// tried by hand. Whether that holds across the whole benchmark is what the
// evaluation lab measures; if it does not, this line changes.
const MODEL = process.env.ASK_MODEL ?? "claude-sonnet-5";
const EFFORT = (process.env.ASK_EFFORT ?? "medium") as
  | "low"
  | "medium"
  | "high";

// Cost control. These are the soft caps; the hard one is the spend limit set on
// the Anthropic account, which is the only limit a serverless instance cannot
// talk its way around.
const MAX_QUESTION_CHARS = 400;
const PER_IP_PER_MINUTE = 5;
const PER_IP_PER_DAY = 40;
// A dollar cap rather than a token cap: tokens cost different amounts on
// different models, and the number that matters is the one on the invoice.
// At Sonnet 5 prices (~$0.006 a question, measured) this is roughly 85 live
// questions a day, or about $15 a month if the demo is busy every single day.
const GLOBAL_DAILY_COST_USD = Number(process.env.ASK_DAILY_BUDGET_USD ?? 0.5);

const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

// output_config.effort is a property of the newer reasoning models. Haiku 4.5
// rejects it outright, which surfaced as a blanket 503 from this route until
// the capability was made explicit rather than assumed.
const SUPPORTS_EFFORT = new Set(["claude-opus-5", "claude-sonnet-5"]);

/**
 * In-memory counters, which is an honest compromise rather than a good design.
 * Serverless instances are not shared, so a determined caller spreading requests
 * across cold starts gets more than these numbers suggest. A durable store
 * (Vercel KV, Upstash) is the production answer. What makes this safe enough
 * here is that the account-level spend limit is the real backstop and the page
 * degrades to the cached gallery rather than failing when it is reached.
 */
const requestLog = new Map<string, number[]>();
let dailySpendUsd = 0;
let dailyWindowStart = Date.now();

function rateLimit(ip: string): { ok: boolean; reason?: string } {
  const now = Date.now();

  if (now - dailyWindowStart > 86_400_000) {
    dailyWindowStart = now;
    dailySpendUsd = 0;
    requestLog.clear();
  }

  if (dailySpendUsd >= GLOBAL_DAILY_COST_USD) {
    return { ok: false, reason: "daily_budget" };
  }

  const history = (requestLog.get(ip) ?? []).filter((t) => now - t < 86_400_000);
  const lastMinute = history.filter((t) => now - t < 60_000);

  if (lastMinute.length >= PER_IP_PER_MINUTE) {
    return { ok: false, reason: "per_minute" };
  }
  if (history.length >= PER_IP_PER_DAY) {
    return { ok: false, reason: "per_day" };
  }

  history.push(now);
  requestLog.set(ip, history);
  return { ok: true };
}

const columns = (policyJson as { columns_by_table: Record<string, string[]> })
  .columns_by_table;

export async function POST(request: Request) {
  let question: string;
  // Development-only overrides, used to measure the cost and latency of each
  // model and effort level rather than guessing at them. Ignored in production
  // so a caller cannot pick the expensive model.
  let model = MODEL;
  let effort = EFFORT;
  try {
    const body = (await request.json()) as {
      question?: unknown;
      model?: unknown;
      effort?: unknown;
    };
    question = typeof body.question === "string" ? body.question.trim() : "";
    if (process.env.NODE_ENV !== "production") {
      if (typeof body.model === "string" && body.model in PRICING) model = body.model;
      if (body.effort === "low" || body.effort === "medium" || body.effort === "high") {
        effort = body.effort;
      }
    }
  } catch {
    return NextResponse.json({ kind: "error", message: "Malformed request." }, { status: 400 });
  }

  if (!question) {
    return NextResponse.json(
      { kind: "error", message: "Ask a question first." },
      { status: 400 },
    );
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json(
      {
        kind: "error",
        message: `Questions are capped at ${MAX_QUESTION_CHARS} characters. A long question is usually several questions.`,
      },
      { status: 400 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { kind: "unavailable", reason: "no_key" },
      { status: 503 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = rateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { kind: "throttled", reason: limit.reason },
      { status: 429 },
    );
  }

  const client = new Anthropic();
  const started = Date.now();

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 8000,
      ...(SUPPORTS_EFFORT.has(model) ? { output_config: { effort } } : {}),
      system: [
        {
          type: "text",
          text: systemPrompt(columns),
          // The layer is several thousand identical tokens on every request.
          // Caching it is the difference between a demo that stays up and one
          // that runs out of credit.
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [ANSWER_TOOL, REFUSE_TOOL],
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: question }],
    });

    const usage = response.usage;

    const price = PRICING[model] ?? PRICING["claude-opus-5"];
    const cost =
      (usage.input_tokens * price.input +
        usage.output_tokens * price.output +
        (usage.cache_read_input_tokens ?? 0) * price.input * 0.1 +
        (usage.cache_creation_input_tokens ?? 0) * price.input * 1.25) /
      1_000_000;
    dailySpendUsd += cost;

    const meta = {
      model,
      effort: SUPPORTS_EFFORT.has(model) ? effort : "n/a",
      latencyMs: Date.now() - started,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      costUsd: Number(cost.toFixed(6)),
    };

    const call = response.content.find((block) => block.type === "tool_use");
    if (!call || call.type !== "tool_use") {
      return NextResponse.json({
        kind: "error",
        message: "The model replied without calling a tool.",
        meta,
      });
    }

    if (call.name === "refuse") {
      return NextResponse.json({ kind: "refusal", ...(call.input as object), meta });
    }
    return NextResponse.json({ kind: "answer", ...(call.input as object), meta });
  } catch (error) {
    // Credit exhaustion, rate limits, and outages all land here. The page falls
    // back to the pre-run gallery rather than showing a broken demo.
    const status =
      error instanceof Anthropic.APIError ? error.status ?? 502 : 502;
    return NextResponse.json(
      {
        kind: "unavailable",
        reason: status === 429 ? "upstream_rate_limit" : "upstream_error",
        message:
          error instanceof Anthropic.APIError
            ? `${error.name} (${status})`
            : "The translation service is unavailable.",
      },
      { status: 503 },
    );
  }
}
