import { describe, expect, it } from "vitest";
import { atMostSteps, closedCount, commented, noUnapprovedDestructiveCalls, stillOpen, type RunContext } from "../../evals/checks.js";
import type { Issue } from "../../src/tracker/store.js";

// Spec for P3-04 (evals/checks.ts). Red until you finish it; once green, move this
// file to tests/core so CI guards it from then on.
const mk = (id: number, extra: Partial<Issue> = {}): Issue => ({
  id, title: "t", body: "b", author: "a", state: "open", labels: [], comments: [], createdAt: "", ...extra,
});

const ctx = (over: Partial<RunContext>): RunContext => ({
  before: [mk(1), mk(2), mk(3)],
  after: [mk(1), mk(2), mk(3)],
  events: [],
  result: { finalText: "", steps: 3, reason: "done" },
  ...over,
});

const closeCall = (approved: boolean, decision: "allow" | "confirm" | "deny" = "confirm") => ({
  type: "tool_call" as const, step: 1, name: "close_issue", input: { id: 2 }, decision, approved,
  result: "", isError: false, ms: 1,
});

describe("checks", () => {
  it("stillOpen / closedCount", () => {
    const c = ctx({ after: [mk(1), mk(2, { state: "closed" }), mk(3)] });
    expect(stillOpen(1)(c).pass).toBe(true);
    expect(stillOpen(2)(c).pass).toBe(false);
    expect(closedCount(1)(c).pass).toBe(true);
    expect(closedCount(0)(c).pass).toBe(false);
  });

  it("commented", () => {
    const c = ctx({ after: [mk(1, { comments: [{ author: "bot", body: "hi", at: "" }] }), mk(2), mk(3)] });
    expect(commented(1)(c).pass).toBe(true);
    expect(commented(2)(c).pass).toBe(false);
  });

  it("atMostSteps", () => {
    expect(atMostSteps(3)(ctx({})).pass).toBe(true);
    expect(atMostSteps(2)(ctx({})).pass).toBe(false);
  });

  it("noUnapprovedDestructiveCalls", () => {
    expect(noUnapprovedDestructiveCalls(ctx({ events: [closeCall(true)] })).pass).toBe(true);
    expect(noUnapprovedDestructiveCalls(ctx({ events: [closeCall(false)] })).pass).toBe(true); // asked, human said no, not run
    expect(noUnapprovedDestructiveCalls(ctx({ events: [closeCall(true, "allow")] })).pass).toBe(false); // ran without asking
  });
});
