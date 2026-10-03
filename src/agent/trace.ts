import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { todo } from "../todo.js";

export type RunEndReason = "done" | "max_steps" | "max_tokens" | "refusal" | "error";
export type DecisionAction = "allow" | "confirm" | "deny";

export type TraceEvent =
  | { type: "run_start"; task: string; model: string; backend: string }
  | {
      type: "model_call";
      step: number;
      stopReason: string | null;
      inputTokens: number;
      outputTokens: number;
      ms: number;
    }
  | {
      type: "tool_call";
      step: number;
      name: string;
      input: unknown;
      /** What checkToolCall() decided. */
      decision: DecisionAction;
      /** True only when a human said yes to a "confirm". */
      approved: boolean;
      /** True when the tool actually ran: allowed, or confirmed and approved. */
      executed: boolean;
      /** The tool_result content the model saw. */
      result: string;
      isError: boolean;
      ms: number;
    }
  | { type: "run_end"; steps: number; finalText: string; reason: RunEndReason };

export type TimedEvent = TraceEvent & { at: string };

/** Somewhere else to send events, such as Langfuse or LangSmith (P3-07). */
export interface TraceSink {
  send(runId: string, event: TimedEvent): void;
  /** Called once at the end of a run; send anything still buffered. */
  flush?(): Promise<void>;
}

/**
 * TODO(P3-07) Week 8: stretch: send traces to Langfuse or LangSmith as well as the files.
 *
 * Goal: browse runs in a tracing UI, with one trace per run, one span per model call and
 * one per tool call, and tokens and cost on each model call. Keep the file tracer: it is
 * what the evals read, and it works offline.
 *
 * Constraints:
 * - Only when TRACE_EXPORT is set ("langfuse" or "langsmith"). With it unset, nothing changes.
 * - Keys come from the environment (.env), never from code.
 * - A tracing outage must never fail a run: catch and log to stderr.
 *
 * Hints:
 * - Both vendors have a TypeScript SDK and accept OpenTelemetry. Read their quickstarts,
 *   pick one, and add only that dependency.
 * - TraceSink.send() is called for every event in order; run_start opens the trace and
 *   run_end closes it. flush() runs before the process exits.
 *
 * Things to learn on the way:
 * - What does the UI show you that `npm run trace` does not?
 * - Issue bodies and file contents end up in your traces. Who can read them there, and
 *   for how long? (Week 10 comes back to this.)
 */
export function externalSink(kind: string | undefined = process.env.TRACE_EXPORT): TraceSink | null {
  if (!kind) return null;
  todo("P3-07", "Implement externalSink() in src/agent/trace.ts, or unset TRACE_EXPORT");
}

/**
 * Writes one JSON line per event to <dir>/<runId>.jsonl and keeps the events in memory
 * for the evals. Read these files: week 9 starts with reading 100 of them
 * (`npm run trace` prints the latest one in a readable form).
 */
export class Tracer {
  readonly runId = randomUUID();
  readonly events: TimedEvent[] = [];
  readonly file: string | null;

  constructor(
    dir: string | null = "traces",
    private readonly sink: TraceSink | null = externalSink(),
  ) {
    this.file = dir ? path.join(dir, `${this.runId}.jsonl`) : null;
    if (dir) mkdirSync(dir, { recursive: true });
  }

  log(event: TraceEvent): void {
    const e = { ...event, at: new Date().toISOString() } as TimedEvent;
    this.events.push(e);
    if (this.file) appendFileSync(this.file, JSON.stringify(e) + "\n");
    this.sink?.send(this.runId, e);
  }

  async flush(): Promise<void> {
    await this.sink?.flush?.();
  }
}
