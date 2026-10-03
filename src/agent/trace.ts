import { appendFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

export type TraceEvent =
  | { type: "run_start"; task: string; model: string }
  | { type: "model_call"; step: number; stopReason: string | null; inputTokens: number; outputTokens: number; ms: number }
  | { type: "tool_call"; step: number; name: string; input: unknown; decision: "allow" | "confirm" | "deny"; approved: boolean; result: string; isError: boolean; ms: number }
  | { type: "run_end"; steps: number; finalText: string; reason: "done" | "max_steps" | "error" | "refusal" };

/**
 * Writes one JSON line per event to traces/<runId>.jsonl and keeps them in memory
 * for evals. Read these files: week 9 starts with reading 100 of them.
 *
 * TODO(P3-05) Week 8 (stretch): also send events to Langfuse or LangSmith so you can
 * browse runs in a UI. Keep this file-based tracer as the fallback.
 */
export class Tracer {
  readonly runId = randomUUID();
  readonly events: (TraceEvent & { at: string })[] = [];
  readonly file: string | null;

  constructor(dir: string | null = "traces") {
    this.file = dir ? `${dir}/${this.runId}.jsonl` : null;
    if (dir) mkdirSync(dir, { recursive: true });
  }

  log(event: TraceEvent) {
    const e = { ...event, at: new Date().toISOString() };
    this.events.push(e);
    if (this.file) appendFileSync(this.file, JSON.stringify(e) + "\n");
  }
}
