import { createInterface } from "node:readline/promises";
import { DEFAULT_POLICY } from "./agent/guardrails.js";
import { runAgent, MODEL } from "./agent/loop.js";
import { connectIssueTracker } from "./agent/mcp-client.js";
import { Tracer } from "./agent/trace.js";

// Usage: npm run agent -- "Triage all open issues"
const task = process.argv.slice(2).join(" ") || "Triage all open issues.";
const rl = createInterface({ input: process.stdin, output: process.stdout });
const mcp = await connectIssueTracker();
const tracer = new Tracer();
tracer.log({ type: "run_start", task, model: MODEL });

try {
  const result = await runAgent({
    task,
    mcp,
    policy: DEFAULT_POLICY,
    tracer,
    confirm: async (name, input, reason) => {
      const answer = await rl.question(`\nAllow ${name} ${JSON.stringify(input)}?\n  ${reason}\n  [y/N] `);
      return answer.trim().toLowerCase() === "y";
    },
  });
  tracer.log({ type: "run_end", steps: result.steps, finalText: result.finalText, reason: result.reason });
  console.log(`\n${result.finalText}\n\n(${result.steps} steps, ${result.reason}) trace: ${tracer.file}`);
} catch (err) {
  tracer.log({ type: "run_end", steps: 0, finalText: String(err), reason: "error" });
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  rl.close();
  await mcp.close();
}
