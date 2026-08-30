import layerJson from "../../public/data/layer.json";

/**
 * Prompt construction.
 *
 * The prompt is generated from semantic/layer.yaml rather than written by hand.
 * A hand-written prompt and a maintained layer drift apart within a week, and
 * the drift is invisible: the model keeps answering, just with a definition
 * nobody agreed to any more.
 *
 * The layer text is deliberately assembled in a fixed order and placed ahead of
 * the question so it can be cached. It is the same several thousand tokens on
 * every request; paying full price for them each time would be the difference
 * between a demo that stays up and one that runs out of credit.
 */

export type Layer = {
  version: number;
  updated: string;
  domains: Record<string, { label: string; nature: string; description: string }>;
  entities: Record<
    string,
    {
      domain: string;
      table: string;
      grain: string;
      description: string;
      caveats?: string[];
    }
  >;
  dimensions: Record<
    string,
    { entity: string; sql: string; description: string }
  >;
  metrics: Record<
    string,
    {
      domain: string;
      sql: string;
      entity: string;
      description: string;
      required_filter?: string;
      reporting_note?: string;
    }
  >;
  joins: Array<{
    from: string;
    to: string;
    on: string;
    cardinality: string;
    note?: string;
  }>;
  forbidden_joins: Array<{ between: string[]; reason: string }>;
  refusals: Array<{
    id: string;
    triggers?: string[];
    response: string;
    does_not_apply_when?: string;
  }>;
  policy: Record<string, unknown>;
};

export const layer = layerJson as unknown as Layer;

export type ColumnIndex = Record<string, string[]>;

/** The layer, rendered for the model. Stable across requests so it caches. */
export function renderLayer(columns: ColumnIndex): string {
  const lines: string[] = [];

  lines.push("# Domains");
  for (const [key, domain] of Object.entries(layer.domains)) {
    lines.push(
      `- ${key} (${domain.label}, ${domain.nature} data): ${collapse(domain.description)}`,
    );
  }

  lines.push("", "# Tables");
  for (const [name, entity] of Object.entries(layer.entities)) {
    lines.push(`## ${entity.table}  [entity: ${name}, domain: ${entity.domain}]`);
    lines.push(`Grain: ${entity.grain}`);
    lines.push(collapse(entity.description));
    const cols = columns[entity.table];
    if (cols) lines.push(`Columns: ${cols.join(", ")}`);
    for (const caveat of entity.caveats ?? []) {
      lines.push(`! ${collapse(caveat)}`);
    }
    lines.push("");
  }

  lines.push("# Metrics — use these definitions exactly");
  for (const [name, metric] of Object.entries(layer.metrics)) {
    lines.push(`## ${name} (${metric.domain})`);
    lines.push(`SQL: ${collapse(metric.sql)}`);
    if (metric.required_filter) {
      lines.push(`REQUIRED FILTER: ${metric.required_filter}`);
    }
    lines.push(collapse(metric.description));
    if (metric.reporting_note) lines.push(`Note: ${collapse(metric.reporting_note)}`);
    lines.push("");
  }

  lines.push("# Dimensions");
  for (const [name, dimension] of Object.entries(layer.dimensions)) {
    lines.push(`- ${name}: ${dimension.sql} — ${collapse(dimension.description)}`);
  }

  lines.push("", "# Permitted joins");
  for (const join of layer.joins) {
    lines.push(
      `- ${join.from} to ${join.to}: ON ${join.on} (${join.cardinality})` +
        (join.note ? ` — ${collapse(join.note)}` : ""),
    );
  }

  lines.push("", "# Forbidden joins — never write these");
  for (const forbidden of layer.forbidden_joins) {
    lines.push(`- ${forbidden.between.join(" + ")}: ${collapse(forbidden.reason)}`);
  }

  lines.push("", "# Questions to refuse");
  for (const refusal of layer.refusals) {
    lines.push(`- ${refusal.id}: ${collapse(refusal.response)}`);
    if (refusal.does_not_apply_when) {
      lines.push(`  DOES NOT APPLY WHEN: ${collapse(refusal.does_not_apply_when)}`);
    }
  }

  return lines.join("\n");
}

export function systemPrompt(columns: ColumnIndex): string {
  return [
    "You translate business questions into DuckDB SQL against a governed semantic layer.",
    "",
    "You have two tools and must call exactly one of them.",
    "",
    "Call `answer` when the layer can support the question. Rules that are not",
    "negotiable:",
    "",
    "- Use only the tables and columns listed below. Never invent one. If the",
    "  question needs a column that does not exist, refuse instead of",
    "  substituting something close.",
    "- When a metric is defined below, use its SQL exactly, including any",
    "  REQUIRED FILTER. These filters are not stylistic. Dropping the",
    "  window_complete filter on attachment_rate changes the answer from 51.4%",
    "  to 45.0% and the difference is an artefact, not a finding.",
    "- Join only along the permitted joins. Never join across the two domains:",
    "  one is a synthetic hardware vendor, the other a real marketplace, and a",
    "  number spanning both describes nothing.",
    "- One SELECT statement. No DDL, no DML, no semicolons, no comments.",
    "- Always aggregate before counting orders when order_items is involved, or",
    "  an order with three lines counts three times.",
    "- Prefer medians to means for durations and revenue; both are skewed.",
    "",
    "Before anything else, work out which domain the question belongs to from",
    "its vocabulary. Most questions sit entirely inside one. Refusing a question",
    "the layer can answer is a real failure, not a safe default.",
    "",
    "Call `refuse` when the layer cannot honestly support the question — no cost",
    "or profit data exists, the question asks for a prediction or a causal claim,",
    "it concerns a period outside the data, it asks to identify a person, or it",
    "spans both domains. Refusing correctly is a success, not a failure. Do not",
    "produce approximate SQL for a question the data cannot answer.",
    "",
    "Your explanation is read by someone non-technical. Say what the query",
    "measures and name any filter that changes the meaning. Do not describe SQL",
    "syntax.",
    "",
    renderLayer(columns),
  ].join("\n");
}

/** Collapse YAML folded scalars into single lines so the prompt stays compact. */
function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The bare-schema condition, used only by the benchmark.
 *
 * This is the honest version of "just point a model at the database": table
 * names, column names, and nothing else. No grain, no metric definitions, no
 * mandatory filters, no note that lost deals carry zero rather than null. It is
 * what a text-to-SQL feature looks like before anyone does the encoding work,
 * and the gap between it and the layer condition is what that work is worth.
 */
export function barePrompt(columns: ColumnIndex): string {
  const tables = Object.entries(columns)
    .map(([table, cols]) => `${table}(${cols.join(", ")})`)
    .join("\n");
  return [
    "You translate business questions into DuckDB SQL.",
    "",
    "You have two tools and must call exactly one of them. Call `answer` with a",
    "single SELECT statement, or `refuse` if the question cannot be answered from",
    "these tables.",
    "",
    "One SELECT statement. No DDL, no DML, no semicolons, no comments.",
    "",
    "# Schema",
    tables,
  ].join("\n");
}

/**
 * Worked examples for the few-shot condition.
 *
 * Deliberately not drawn from the benchmark cases. Reusing a test question as a
 * demonstration would leak the answer and inflate that condition's score - the
 * result would look like better prompting and actually be contamination.
 */
export const FEW_SHOT: Array<{ question: string; sql: string; why: string }> = [
  {
    question: "How many accounts are in each office location?",
    sql: "SELECT office_location, COUNT(*) AS n FROM crm_accounts GROUP BY office_location ORDER BY n DESC",
    why: "A plain group-by needs no metric definition.",
  },
  {
    question: "What share of opportunities engaged in 2017 were eventually won?",
    sql: "SELECT AVG(CASE WHEN is_won THEN 1.0 ELSE 0.0 END) AS win_rate FROM crm_opportunities WHERE is_closed AND engage_date >= DATE '2017-01-01'",
    why: "win_rate carries a required filter on is_closed. Open deals are undecided, not lost.",
  },
  {
    question: "How much revenue did clients from the social channel bill in their first 90 days?",
    sql: "SELECT SUM(revenue_90d) AS revenue FROM deal_outcomes WHERE window_complete AND origin = 'social'",
    why: "Any revenue or attachment figure over deal_outcomes requires window_complete, or the observation window depresses it.",
  },
  {
    question: "How many distinct orders included freight above 50?",
    sql: "SELECT COUNT(DISTINCT order_id) AS n FROM order_items WHERE freight_value > 50",
    why: "order_items is one row per line, so orders must be counted distinctly.",
  },
  {
    question: "What is the average price of an item line on delivered orders?",
    sql: "SELECT AVG(i.price) AS avg_price FROM order_items i JOIN orders o ON o.order_id = i.order_id WHERE o.order_status = 'delivered'",
    why: "Order status has to be filtered explicitly; cancelled orders stay in the table.",
  },
];

export function fewShotBlock(): string {
  return [
    "",
    "# Worked examples",
    ...FEW_SHOT.map(
      (example) =>
        `Q: ${example.question}\nSQL: ${example.sql}\nWhy: ${example.why}`,
    ),
  ].join("\n\n");
}

export const ANSWER_TOOL = {
  name: "answer",
  description:
    "Answer the question with a single SELECT statement against the layer.",
  input_schema: {
    type: "object" as const,
    properties: {
      sql: {
        type: "string",
        description:
          "One DuckDB SELECT statement. No trailing semicolon, no comments.",
      },
      metrics_used: {
        type: "array",
        items: { type: "string" },
        description:
          "Names of layer metrics whose definitions this query applies. Empty if none apply.",
      },
      explanation: {
        type: "string",
        description:
          "Two or three sentences for a non-technical reader: what the query measures, and any filter that changes the meaning.",
      },
      confidence: {
        type: "number",
        description:
          "0 to 1. Your calibrated probability that this query answers the question correctly.",
      },
    },
    required: ["sql", "metrics_used", "explanation", "confidence"],
    additionalProperties: false,
  },
  strict: true,
};

export const REFUSE_TOOL = {
  name: "refuse",
  description:
    "Decline a question the layer cannot honestly answer. This is a correct outcome, not an error.",
  input_schema: {
    type: "object" as const,
    properties: {
      refusal_id: {
        type: "string",
        enum: layer.refusals.map((r) => r.id),
        description: "Which refusal rule applies.",
      },
      explanation: {
        type: "string",
        description:
          "Why the data cannot answer this, and what would be needed to answer it. Plain language.",
      },
      nearest_answerable: {
        type: "string",
        description:
          "A related question the layer CAN answer, or an empty string if there is none.",
      },
    },
    required: ["refusal_id", "explanation", "nearest_answerable"],
    additionalProperties: false,
  },
  strict: true,
};
