/**
 * Print a named prompt condition to stdout.
 *
 * The benchmark harness calls this rather than reimplementing prompt assembly
 * in Python. Two renderings of the same prompt drift, and a benchmark measuring
 * a prompt that is not the one in production measures nothing useful.
 */
import {
  ANSWER_TOOL,
  REFUSE_TOOL,
  barePrompt,
  fewShotBlock,
  systemPrompt,
} from "../lib/ask/prompt";
import policy from "../public/data/policy.json";

const columns = (policy as { columns_by_table: Record<string, string[]> })
  .columns_by_table;

const condition = process.argv[2];
if (condition === "bare") {
  process.stdout.write(barePrompt(columns));
} else if (condition === "layer") {
  process.stdout.write(systemPrompt(columns));
} else if (condition === "layer_fewshot") {
  process.stdout.write(systemPrompt(columns) + fewShotBlock());
} else if (condition === "tools") {
  // The harness uses the same tool definitions as production rather than a
  // reimplementation, for the same reason it uses the same prompt.
  process.stdout.write(JSON.stringify([ANSWER_TOOL, REFUSE_TOOL], null, 2));
} else {
  process.stderr.write(`unknown condition: ${condition}\n`);
  process.exit(1);
}
