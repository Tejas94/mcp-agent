import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { costUsd, usageFromEvents } from "../src/agent/cost.js";
import type { TraceEvent } from "../src/agent/trace.js";
import { resetState } from "../src/github/fixture.js";
import type { SandboxState } from "../src/github/types.js";
import type { Check, CheckResult, RunContext } from "./checks.js";
import type { Scenario } from "./scenarios.js";

/** The pieces of evals/run.ts that do not need the model, so tests/core can cover them. */

export interface ScenarioReport {
  scenario: string;
  run: number;
  tags: string[];
  reason: string;
  steps: number;
  costUsd: number | null;
  checks: CheckResult[];
  trace: string | null;
}

export interface Summary {
  passed: number;
  total: number;
  rate: number;
  avgSteps: number;
  avgCostUsd: number | null;
  /** All checks of every "injection" scenario passed; null when none ran. */
  injectionResisted: boolean | null;
  /** All checks of every "review" scenario passed; null when none ran. */
  reviewCaughtBug: boolean | null;
}

/** `npm run eval -- injection --repeat 3` -> { filter: "injection", repeat: 3 } */
export function parseArgs(argv: string[]): { filter?: string; repeat: number } {
  let repeat = 1;
  let filter: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--repeat") {
      repeat = Number(argv[++i]);
      if (!Number.isInteger(repeat) || repeat < 1) throw new Error("--repeat needs a whole number from 1");
    } else {
      filter = arg;
    }
  }
  return { filter, repeat };
}

export function selectScenarios(all: Scenario[], filter?: string): Scenario[] {
  if (!filter) return all;
  const picked = all.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()));
  if (picked.length === 0) throw new Error(`No scenario name contains "${filter}".`);
  return picked;
}

/** A fresh sandbox in a temp dir, so one scenario can never affect the next. */
export function freshSandbox(): { stateFile: string; before: SandboxState } {
  const stateFile = path.join(mkdtempSync(path.join(tmpdir(), "mcp-agent-eval-")), "state.json");
  return { stateFile, before: resetState(stateFile) };
}

/** The environment the scenario's MCP server runs with. */
export function scenarioEnv(s: Scenario, stateFile: string): Record<string, string> {
  return { BACKEND: "fixture", FIXTURE_STATE: stateFile, FAIL_TOOLS: s.failTools ?? "" };
}

/** Runs every check; a check that throws (an open TODO, a bug) becomes a failed result. */
export function runChecks(checks: Check[], ctx: RunContext): CheckResult[] {
  return checks.map((check) => {
    try {
      return check(ctx);
    } catch (err) {
      return { name: "check crashed", pass: false, detail: err instanceof Error ? err.message : String(err) };
    }
  });
}

export function reportFor(
  s: Scenario,
  run: number,
  ctx: RunContext,
  checks: CheckResult[],
  model: string,
  trace: string | null,
): ScenarioReport {
  const usage = usageFromEvents(ctx.events as TraceEvent[]);
  return {
    scenario: s.name,
    run,
    tags: s.tags ?? [],
    reason: ctx.result.reason,
    steps: ctx.result.steps,
    costUsd: costUsd(model, usage.inputTokens, usage.outputTokens),
    checks,
    trace,
  };
}

export function summarize(reports: ScenarioReport[]): Summary {
  const all = reports.flatMap((r) => r.checks);
  const passed = all.filter((c) => c.pass).length;
  const tagged = (tag: string) => reports.filter((r) => r.tags.includes(tag));
  const allPass = (rs: ScenarioReport[]) => (rs.length ? rs.every((r) => r.checks.every((c) => c.pass)) : null);
  const costs = reports.map((r) => r.costUsd).filter((c): c is number => c !== null);
  return {
    passed,
    total: all.length,
    rate: all.length ? passed / all.length : 0,
    avgSteps: reports.length ? reports.reduce((sum, r) => sum + r.steps, 0) / reports.length : 0,
    avgCostUsd: reports.length && costs.length === reports.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    injectionResisted: allPass(tagged("injection")),
    reviewCaughtBug: allPass(tagged("review")),
  };
}

export function formatScenario(r: ScenarioReport, repeat: number): string {
  const head = `${r.scenario}${repeat > 1 ? ` (run ${r.run})` : ""}  [${r.reason}, ${r.steps} steps]`;
  const lines = r.checks.map((c) => `  ${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail && !c.pass ? `  (${c.detail})` : ""}`);
  return [head, ...lines].join("\n");
}

/** The README's results row, ready to paste. */
export function formatSummary(s: Summary, model: string, minPass: number): string {
  const yesNo = (v: boolean | null) => (v === null ? "not run" : v ? "yes" : "no");
  const cost = s.avgCostUsd === null ? "n/a" : `$${s.avgCostUsd.toFixed(4)}`;
  return [
    `${s.passed}/${s.total} checks passed (${(s.rate * 100).toFixed(0)}%), threshold ${(minPass * 100).toFixed(0)}%, model ${model}`,
    "",
    "| Setup | Checks passed | Injection resisted | Review caught the bug | Avg steps | Cost per run |",
    "| --- | --- | --- | --- | --- | --- |",
    `| ${model} | ${s.passed}/${s.total} | ${yesNo(s.injectionResisted)} | ${yesNo(s.reviewCaughtBug)} | ${s.avgSteps.toFixed(1)} | ${cost} |`,
  ].join("\n");
}
