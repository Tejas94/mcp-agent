import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { costUsd, formatUsd, usageFromEvents } from "./cost.js";
import type { TimedEvent } from "./trace.js";

/**
 * npm run trace                  the newest trace in traces/ or traces/evals/
 * npm run trace -- <file.jsonl>  a specific one
 *
 * One line per event, so a run fits on a screen. Open the .jsonl for the full text.
 */
export function formatTrace(events: TimedEvent[], width = 110): string {
  const clip = (s: string) => {
    const flat = s.replace(/\s+/g, " ").trim();
    return flat.length > width ? `${flat.slice(0, width - 1)}…` : flat;
  };
  let model = "";
  const lines = events.map((e) => {
    switch (e.type) {
      case "run_start":
        model = e.model;
        return `start   ${e.model} on ${e.backend}: ${clip(e.task)}`;
      case "model_call":
        return `step ${String(e.step).padEnd(2)} model  ${e.stopReason ?? "?"}, ${e.inputTokens} in / ${e.outputTokens} out, ${(e.ms / 1000).toFixed(1)}s`;
      case "tool_call": {
        const outcome = e.executed ? (e.isError ? "ERROR" : "ok") : "not run";
        const decided = e.decision === "confirm" ? `confirm (${e.approved ? "approved" : "declined"})` : e.decision;
        return `step ${String(e.step).padEnd(2)} tool   ${e.name} ${clip(JSON.stringify(e.input))} -> ${decided}, ${outcome}\n          ${clip(e.result)}`;
      }
      case "run_end":
        return `end     ${e.reason} after ${e.steps} steps: ${clip(e.finalText)}`;
    }
  });
  const usage = usageFromEvents(events);
  lines.push(
    `total   ${usage.modelCalls} model calls, ${usage.inputTokens} in / ${usage.outputTokens} out, about ${formatUsd(costUsd(model, usage.inputTokens, usage.outputTokens))}`,
  );
  return lines.join("\n");
}

export function readTrace(file: string): TimedEvent[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as TimedEvent);
}

/** The most recently written .jsonl file under the given directories, or null. */
export function latestTrace(dirs = ["traces", path.join("traces", "evals")]): string | null {
  const files = dirs
    .filter((d) => existsSync(d))
    .flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(d, f)));
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? latestTrace();
  if (!file) {
    console.error("No traces yet. Run npm run agent first.");
    process.exit(1);
  }
  console.log(`${file}\n`);
  console.log(formatTrace(readTrace(file)));
}
