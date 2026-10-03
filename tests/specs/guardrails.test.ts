import { describe, expect, it } from "vitest";
import { checkToolCall, DEFAULT_POLICY } from "../../src/agent/guardrails.js";

// Spec for P3-03 (src/agent/guardrails.ts). Red until you finish it; once green, move
// this file to tests/core so CI guards it from then on.
const fresh = { writesSoFar: 0 };

describe("checkToolCall", () => {
  it("allows read-only tools", () => {
    expect(checkToolCall("list_issues", {}, DEFAULT_POLICY, fresh).action).toBe("allow");
  });

  it("allows writes under the limit and denies them over it", () => {
    expect(checkToolCall("add_labels", { id: 1, labels: ["bug"] }, DEFAULT_POLICY, fresh).action).toBe("allow");
    const full = { writesSoFar: DEFAULT_POLICY.maxWrites };
    expect(checkToolCall("add_labels", { id: 1, labels: ["bug"] }, DEFAULT_POLICY, full).action).toBe("deny");
  });

  it("asks a human before destructive tools, with a reason", () => {
    const d = checkToolCall("close_issue", { id: 7, reason: "duplicate of #1" }, DEFAULT_POLICY, fresh);
    expect(d.action).toBe("confirm");
    expect(d.action === "confirm" && d.reason).toMatch(/7/);
  });

  it("denies unknown tools by default", () => {
    expect(checkToolCall("delete_repository", {}, DEFAULT_POLICY, fresh).action).toBe("deny");
  });
});
