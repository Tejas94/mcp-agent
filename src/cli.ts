import { createInterface } from "node:readline/promises";
import { describeAction } from "./agent/approval.js";
import { costUsd, formatUsd, usageFromEvents } from "./agent/cost.js";
import { DEFAULT_POLICY } from "./agent/guardrails.js";
import { MODEL, runAgent, type AgentResult } from "./agent/loop.js";
import { connectGitHubServer, todoNotices } from "./agent/mcp-client.js";
import { Tracer } from "./agent/trace.js";
import { backendKind, createBackend } from "./github/index.js";

// Usage: npm run agent -- "Triage issue #1"
//        npm run agent -- --live "Triage issue #3"   (needs GITHUB_TOKEN and GITHUB_REPO)
const args = process.argv.slice(2);
const live = args.includes("--live");
const task = args.filter((a) => a !== "--live").join(" ").trim() || "Triage issue #1.";
let env: { BACKEND: string };
let tracer: Tracer;
try {
  env = { BACKEND: live ? "live" : backendKind() };
  console.log(`Backend: ${createBackend({ ...process.env, ...env }).describe()}`);
  tracer = new Tracer();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
if (env.BACKEND === "fixture") console.log("Writes go to the sandbox only. npm run reset puts it back.");
console.log(`Model: ${MODEL}\nTask: ${task}\n`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
let stdinClosed = false;
rl.on("close", () => (stdinClosed = true));

const mcp = await connectGitHubServer(env);
for (const notice of todoNotices(mcp.serverLog())) console.error(`MCP server: ${notice}`);
console.log(`Tools: ${mcp.tools.map((t) => t.name).join(", ")}\n`);
tracer.log({ type: "run_start", task, model: MODEL, backend: env.BACKEND });

let result: AgentResult;
try {
  result = await runAgent({
    task,
    mcp,
    policy: DEFAULT_POLICY,
    tracer,
    confirm: async (name, input, reason) => {
      console.log(`\n--- Approval needed: ${reason}\n\n${describeAction(name, input)}\n`);
      if (stdinClosed) {
        console.log("No terminal to ask; treating it as no.");
        return false;
      }
      const answer = await rl.question("Allow this? [y/N] ");
      return answer.trim().toLowerCase() === "y";
    },
  });
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  result = { finalText: message, steps: 0, reason: "error" };
  console.error(message);
  process.exitCode = 1;
} finally {
  rl.close();
  await mcp.close();
}

tracer.log({ type: "run_end", steps: result.steps, finalText: result.finalText, reason: result.reason });
await tracer.flush();
const usage = usageFromEvents(tracer.events);
if (result.reason !== "error") console.log(`\n${result.finalText}`);
console.log(
  `\n(${result.steps} steps, ${result.reason}; ${usage.inputTokens} input and ${usage.outputTokens} output tokens, ` +
    `about ${formatUsd(costUsd(MODEL, usage.inputTokens, usage.outputTokens))})\ntrace: ${tracer.file} (npm run trace)`,
);
