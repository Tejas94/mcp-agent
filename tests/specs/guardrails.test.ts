// Spec for P3-02 (src/agent/guardrails.ts). Red until you finish it; once green, move this file to tests/core so CI guards it from then on.
import { describe, expect, it } from "vitest";
import { checkToolCall, DEFAULT_POLICY, type Decision } from "../../src/agent/guardrails.js";

const fresh = { writesSoFar: 0 };
const full = { writesSoFar: DEFAULT_POLICY.maxWrites };
const reasonOf = (d: Decision) => (d.action === "allow" ? "" : d.reason);

describe("checkToolCall", () => {
  it("allows every read-only tool", () => {
    for (const name of DEFAULT_POLICY.readOnlyTools) {
      expect(checkToolCall(name, { number: 1 }, DEFAULT_POLICY, fresh)).toEqual({ action: "allow" });
    }
  });

  it("allows labels under the write limit and denies them at it", () => {
    expect(checkToolCall("add_labels", { number: 1, labels: ["bug"] }, DEFAULT_POLICY, fresh).action).toBe("allow");
    const d = checkToolCall("add_labels", { number: 1, labels: ["bug"] }, DEFAULT_POLICY, full);
    expect(d.action).toBe("deny");
    expect(reasonOf(d)).toMatch(/limit|maxWrites|too many/i);
  });

  it("asks before a comment, showing the issue and the start of the text", () => {
    const body = "Thanks for the report. The discount is subtracted twice in calculateTotals. ".repeat(10);
    const d = checkToolCall("add_comment", { number: 12, body }, DEFAULT_POLICY, fresh);
    expect(d.action).toBe("confirm");
    expect(reasonOf(d)).toContain("#12");
    expect(reasonOf(d)).toContain("Thanks for the report. The discount is subtracted twice");
    expect(reasonOf(d).length).toBeLessThan(200);
  });

  it("asks before a review, saying what kind and how many inline comments", () => {
    const d = checkToolCall(
      "submit_review",
      {
        number: 20,
        event: "REQUEST_CHANGES",
        body: "See inline.",
        comments: [
          { path: "src/cart/discounts.ts", line: 24, body: "Use >=." },
          { path: "test/totals.test.ts", line: 30, body: "Add a $50.00 case." },
        ],
      },
      DEFAULT_POLICY,
      fresh,
    );
    expect(d.action).toBe("confirm");
    expect(reasonOf(d)).toMatch(/request changes/i);
    expect(reasonOf(d)).toContain("#20");
    expect(reasonOf(d)).toMatch(/2 inline comments/);
  });

  it("asks before closing an issue, with the reason", () => {
    const d = checkToolCall("close_issue", { number: 7, reason: "not_planned" }, DEFAULT_POLICY, fresh);
    expect(d.action).toBe("confirm");
    expect(reasonOf(d)).toMatch(/close/i);
    expect(reasonOf(d)).toContain("#7");
    expect(reasonOf(d)).toContain("not_planned");
  });

  it("never approves a pull request, not even on the first call", () => {
    const d = checkToolCall("submit_review", { number: 20, event: "APPROVE", body: "LGTM" }, DEFAULT_POLICY, fresh);
    expect(d.action).toBe("deny");
    expect(reasonOf(d)).toMatch(/never approves pull requests/);
  });

  it("counts approval tools toward the write limit", () => {
    const d = checkToolCall("add_comment", { number: 1, body: "hi" }, DEFAULT_POLICY, full);
    expect(d.action).toBe("deny");
  });

  it("denies tools the policy does not know", () => {
    for (const name of ["merge_pull_request", "delete_repository", ""]) {
      const d = checkToolCall(name, {}, DEFAULT_POLICY, fresh);
      expect(d.action).toBe("deny");
      expect(reasonOf(d).length).toBeGreaterThan(0);
    }
  });

  it("does not throw on odd input from the model", () => {
    expect(checkToolCall("add_comment", null, DEFAULT_POLICY, fresh).action).toBe("confirm");
    expect(checkToolCall("submit_review", { number: 20 }, DEFAULT_POLICY, fresh).action).toBe("confirm");
  });

  it("follows the policy it is given, not a fixed list", () => {
    const strict = { ...DEFAULT_POLICY, writeTools: [], approvalTools: [...DEFAULT_POLICY.approvalTools, "add_labels"] };
    expect(checkToolCall("add_labels", { number: 1, labels: ["bug"] }, strict, fresh).action).toBe("confirm");
  });
});
