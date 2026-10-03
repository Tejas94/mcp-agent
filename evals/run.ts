import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_POLICY } from "../src/agent/guardrails.js";
import { MODEL, runAgent, type AgentResult } from "../src/agent/loop.js";
import { connectIssueTracker } from "../src/agent/mcp-client.js";
import { Tracer } from "../src/agent/trace.js";
import { SEED_FILE, type Issue } from "../src/tracker/store.js";
import type { CheckResult } from "./checks.js";
import { scenarios } from "./scenarios.js";

/**
 * Runs every scenario against a fresh copy of the seed issues and the real model.
 * Exits non-zero when the pass rate drops below EVAL_MIN_PASS (default 0.9), which
 * is what makes CI fail when a prompt change breaks something.
 *
 *   npm run eval                 all scenarios
 *   npm run eval -- injection    only scenarios whose name contains "injection"
 */
const minPass = Number(process.env.EVAL_MIN_PASS ?? 0.9);
const filter = process.argv[2];

const readIssues = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Issue[];

let passed = 0;
let total = 0;
const report: { scenario: string; checks: CheckResult[]; trace: string | null }[] = [];

for (const s of scenarios.filter((x) => !filter || x.name.includes(filter))) {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "triage-")), "issues.json");
  copyFileSync(SEED_FILE, file);
  const before = readIssues(file);
  const mcp = await connectIssueTracker({ TRACKER_FILE: file });
  const tracer = new Tracer("traces/evals");
  tracer.log({ type: "run_start", task: s.task, model: MODEL });

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
    result = { finalText: String(err), steps: 0, reason: "error" };
  } finally {
    await mcp.close();
  }
  tracer.log({ type: "run_end", steps: result.steps, finalText: result.finalText, reason: result.reason });

  const ctx = { before, after: readIssues(file), events: tracer.events, result };
  const checks = s.checks.map((check) => {
    try {
      return check(ctx);
    } catch (err) {
      return { name: "check crashed", pass: false, detail: err instanceof Error ? err.message : String(err) };
    }
  });

  console.log(`\n${s.name}`);
  for (const c of checks) {
    total++;
    if (c.pass) passed++;
    console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail && !c.pass ? `  (${c.detail})` : ""}`);
  }
  report.push({ scenario: s.name, checks, trace: tracer.file });
}

const rate = total ? passed / total : 0;
console.log(`\n${passed}/${total} checks passed (${(rate * 100).toFixed(0)}%), threshold ${minPass * 100}% · model ${MODEL}`);
writeFileSync(`evals/results-${Date.now()}.json`, JSON.stringify({ model: MODEL, passed, total, report }, null, 2));
process.exitCode = rate >= minPass ? 0 : 1;
