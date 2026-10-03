import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { describeAction } from "../../src/agent/approval.js";
import { costUsd, formatUsd, usageFromEvents } from "../../src/agent/cost.js";
import { formatTrace, latestTrace, readTrace } from "../../src/agent/show-trace.js";
import { externalSink, Tracer, type TimedEvent, type TraceSink } from "../../src/agent/trace.js";

describe("Tracer", () => {
  it("writes one JSON line per event and keeps them in memory", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "trace-"));
    const t = new Tracer(dir, null);
    t.log({ type: "run_start", task: "Triage issue #1", model: "claude-opus-5-5", backend: "fixture" });
    t.log({ type: "model_call", step: 1, stopReason: "end_turn", inputTokens: 1000, outputTokens: 100, ms: 900 });
    expect(t.file).toBe(path.join(dir, `${t.runId}.jsonl`));
    const lines = readFileSync(t.file!, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]!)).toMatchObject({ type: "model_call", step: 1 });
    expect(t.events[0]).toHaveProperty("at");
    expect(readTrace(t.file!)).toEqual(t.events);
    expect(latestTrace([dir])).toBe(t.file);
  });

  it("can run in memory only, and forwards events to a sink", async () => {
    const seen: string[] = [];
    let flushed = false;
    const sink: TraceSink = { send: (_id, e) => void seen.push(e.type), flush: async () => void (flushed = true) };
    const t = new Tracer(null, sink);
    t.log({ type: "run_end", steps: 0, finalText: "", reason: "done" });
    await t.flush();
    expect(t.file).toBeNull();
    expect(seen).toEqual(["run_end"]);
    expect(flushed).toBe(true);
  });

  it("needs no external sink unless TRACE_EXPORT is set", () => {
    expect(externalSink(undefined)).toBeNull();
    expect(externalSink("")).toBeNull();
  });
});

const events: TimedEvent[] = [
  { type: "run_start", task: "Review PR #20", model: "claude-opus-5-5", backend: "fixture", at: "" },
  { type: "model_call", step: 1, stopReason: "tool_use", inputTokens: 2000, outputTokens: 300, ms: 1500, at: "" },
  {
    type: "tool_call",
    step: 1,
    name: "submit_review",
    input: { number: 20, event: "APPROVE" },
    decision: "deny",
    approved: false,
    executed: false,
    result: "this agent never approves pull requests; a human does",
    isError: true,
    ms: 0,
    at: "",
  },
  { type: "model_call", step: 2, stopReason: "end_turn", inputTokens: 3000, outputTokens: 200, ms: 1200, at: "" },
  { type: "run_end", steps: 2, finalText: "Done.", reason: "done", at: "" },
];

describe("cost and trace formatting", () => {
  it("adds up tokens and prices them per model", () => {
    expect(usageFromEvents(events)).toEqual({ modelCalls: 2, inputTokens: 5000, outputTokens: 500 });
    expect(costUsd("claude-opus-5-5", 1_000_000, 1_000_000)).toBe(24);
    expect(costUsd("claude-sonnet-5-5", 5000, 500)).toBeCloseTo(0.015);
    expect(costUsd("claude-haiku-4-5", 1_000_000, 0)).toBe(1);
    expect(costUsd("some-other-model", 1, 1)).toBeNull();
    expect(formatUsd(null)).toBe("n/a");
  });

  it("prints a run as one line per event", () => {
    const text = formatTrace(events);
    expect(text).toContain("tool   submit_review");
    expect(text).toContain("-> deny, not run");
    expect(text).toContain("end     done after 2 steps");
    expect(text).toContain("about $0.0300");
  });
});

describe("describeAction", () => {
  it("shows the full comment", () => {
    expect(describeAction("add_comment", { number: 4, body: "Which step fails?\nAnd which browser?" })).toBe(
      "Post this comment on #4:\n\n    Which step fails?\n    And which browser?",
    );
  });

  it("shows the review and every inline comment", () => {
    const text = describeAction("submit_review", {
      number: 20,
      event: "REQUEST_CHANGES",
      body: "The minimum check is off by one.",
      comments: [{ path: "src/cart/discounts.ts", line: 24, body: "Use >= here." }],
    });
    expect(text).toContain("Submit a REQUEST_CHANGES review on PR #20:");
    expect(text).toContain("The minimum check is off by one.");
    expect(text).toContain("Inline comments (1):");
    expect(text).toContain("src/cart/discounts.ts:24\n    Use >= here.");
  });

  it("shows closes, labels and anything else", () => {
    expect(describeAction("close_issue", { number: 5, reason: "duplicate" })).toBe("Close issue #5 as duplicate.");
    expect(describeAction("add_labels", { number: 1, labels: ["bug"] })).toBe("Add labels bug to #1.");
    expect(describeAction("merge_pr", { number: 21 })).toContain('"number": 21');
  });
});
