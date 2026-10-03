import { todo } from "../todo.js";

export interface Policy {
  /** Tools that only read. Always allowed. */
  readOnlyTools: string[];
  /** Tools that change state but are easy to undo (labels, comments). */
  writeTools: string[];
  /** Tools that are hard to undo. Need a human "yes" every time. */
  destructiveTools: string[];
  /** Hard stop for the agent loop. */
  maxSteps: number;
  /** Most write calls allowed in one run, as a blast-radius limit. */
  maxWrites: number;
}

export const DEFAULT_POLICY: Policy = {
  readOnlyTools: ["list_issues", "get_issue"],
  writeTools: ["add_labels", "add_comment"],
  destructiveTools: ["close_issue"],
  maxSteps: 25,
  maxWrites: 30,
};

export type Decision = { action: "allow" } | { action: "confirm"; reason: string } | { action: "deny"; reason: string };

export interface RunState {
  /** Write and destructive calls already executed in this run. */
  writesSoFar: number;
}

/**
 * TODO(P3-03) Week 7: decide what happens to a tool call before it runs.
 *
 * Rules (tests/specs/guardrails.test.ts encodes them):
 * - read-only tools: allow
 * - write tools: allow, unless writesSoFar >= maxWrites -> deny
 * - destructive tools: confirm (with a reason a human can act on, e.g. "close #4: duplicate of #1"),
 *   also subject to maxWrites
 * - any tool not listed in the policy: deny (default-deny; new server tools
 *   should not become usable just because someone deployed them)
 *
 * The decision lives in code, not in the prompt. A prompt saying "always ask
 * before closing" is a suggestion; this function is a guarantee.
 */
export function checkToolCall(name: string, input: unknown, policy: Policy, state: RunState): Decision {
  void name;
  void input;
  void policy;
  void state;
  todo("P3-03", "Implement checkToolCall() in src/agent/guardrails.ts");
}
