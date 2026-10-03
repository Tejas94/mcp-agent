import { mkdirSync, writeFileSync } from "node:fs";
import { DEFAULT_POLICY } from "../src/agent/guardrails.js";
import { MODEL, runAgent, type AgentResult } from "../src/agent/loop.js";
import { connectGitHubServer, todoNotices } from "../src/agent/mcp-client.js";
import { Tracer } from "../src/agent/trace.js";
import { readState } from "../src/github/fixture.js";
import {
  formatScenario,
  formatSummary,
  freshSandbox,
  parseArgs,
  reportFor,
  runChecks,
  scenarioEnv,
  selectScenarios,
  summarize,
  type ScenarioReport,
} from "./harness.js";
import { scenarios } from "./scenarios.js";

/**
 * Runs the scenarios against the real model, each on a fresh copy of the tiny-shop
 * sandbox with its own MCP server. Exits 1 when the pass rate is below EVAL_MIN_PASS
 * (default 0.9), which is what makes CI fail when a change breaks something.
 *
 *   npm run eval                       every scenario once
 *   npm run eval -- injection          only scenarios whose name contains "injection"
 *   npm run eval -- --repeat 3         every scenario three times (the week 9 noise check)
 */
const minPass = Number(process.env.EVAL_MIN_PASS ?? 0.9);
const { filter, repeat } = parseArgs(process.argv.slice(2));
const reports: ScenarioReport[] = [];
let notified = false;

for (const s of selectScenarios(scenarios, filter)) {
  for (let run = 1; run <= repeat; run++) {
    const { stateFile, before } = freshSandbox();
    const tracer = new Tracer("traces/evals");
    tracer.log({ type: "run_start", task: s.task, model: MODEL, backend: "fixture" });
    const mcp = await connectGitHubServer(scenarioEnv(s, stateFile));
    if (!notified) {
      for (const notice of todoNotices(mcp.serverLog())) console.error(`MCP server: ${notice}`);
      notified = true;
    }

    let result: AgentResult;
    try {
      result = await runAgent({
        task: s.task,
        mcp,
        policy: DEFAULT_POLICY,
        tracer,
        confirm: async () => s.confirm === "approve",
      });
    } catch (err) {
      result = { finalText: err instanceof Error ? err.message : String(err), steps: 0, reason: "error" };
    } finally {
      await mcp.close();
    }
    tracer.log({ type: "run_end", steps: result.steps, finalText: result.finalText, reason: result.reason });
    await tracer.flush();

    const ctx = { before, after: readState(stateFile), events: tracer.events, result };
    const report = reportFor(s, run, ctx, runChecks(s.checks, ctx), MODEL, tracer.file);
    reports.push(report);
    console.log(`\n${formatScenario(report, repeat)}`);
    if (result.reason === "error") console.log(`  error: ${result.finalText}`);
  }
}

const summary = summarize(reports);
console.log(`\n${formatSummary(summary, MODEL, minPass)}`);
mkdirSync("evals", { recursive: true });
const out = `evals/results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(out, JSON.stringify({ model: MODEL, minPass, repeat, summary, reports }, null, 2));
console.log(`\nResults: ${out}`);
process.exitCode = summary.rate >= minPass ? 0 : 1;
