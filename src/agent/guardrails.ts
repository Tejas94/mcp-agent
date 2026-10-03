import { todo } from "../todo.js";

export interface Policy {
  /** Tools that only read. Always allowed. */
  readOnlyTools: string[];
  /** Tools that change something but are easy to undo and barely visible (labels). */
  writeTools: string[];
  /** Tools other people see, or that are hard to undo. A human says yes every time. */
  approvalTools: string[];
  /** Hard stop for the agent loop: the most model calls in one run. */
  maxSteps: number;
  /** Most write and approval-tool calls that may run in one run: the blast radius. */
  maxWrites: number;
}

export const DEFAULT_POLICY: Policy = {
  readOnlyTools: ["list_issues", "get_issue", "search_code", "read_file", "list_pull_requests", "get_pull_request"],
  writeTools: ["add_labels"],
  approvalTools: ["add_comment", "submit_review", "close_issue"],
  maxSteps: 25,
  maxWrites: 10,
};

export type Decision =
  | { action: "allow" }
  | { action: "confirm"; reason: string }
  | { action: "deny"; reason: string };

export interface RunState {
  /** Write and approval-tool calls that actually ran so far in this run. */
  writesSoFar: number;
}

/**
 * TODO(P3-02) Week 7: decide what happens to each tool call before it runs.
 *
 * Goal: allow, confirm or deny every call the model asks for, in code. The loop (P3-03)
 * calls this for every tool_use block and does exactly what it says.
 *
 * Rules (tests/specs/guardrails.test.ts encodes them):
 * - Read-only tools: allow.
 * - Write tools: allow while writesSoFar < maxWrites; deny at the limit.
 * - Approval tools: confirm, with a reason a human can act on in one glance, such as
 *   `comment on #12: "<first 80 characters of the body>"`,
 *   `request changes on PR #20 with 2 inline comments`, or `close #7 as not_planned`.
 *   They count toward maxWrites too, so deny them at the limit.
 * - submit_review with event "APPROVE": always deny, with the reason
 *   "this agent never approves pull requests; a human does". No confirm, no exceptions.
 * - Any tool not in the policy: deny. Default-deny means a tool someone adds to the
 *   server later is unusable until someone decides which list it belongs in.
 *
 * Constraints:
 * - `input` comes from the model, so treat it as unknown: check its shape before reading
 *   fields, and never throw on odd input (a missing body is still a comment to confirm).
 * - Tool inputs use these fields: { number } for issues and PRs, { body } for comments,
 *   { event, body, comments: [{ path, line, body }] } for reviews, { reason } for closes.
 *
 * Why this lives in code and not in the prompt: a prompt that says "always ask before
 * commenting" is a request the model usually follows. Text in an issue can argue it out of
 * that (see issue #8). This function runs on every call no matter what the model read, so
 * it is a guarantee. Keep the prompt rule too; it saves wasted calls.
 *
 * Things to learn on the way:
 * - Which is safer: leaving APPROVE out of the tool's enum, or keeping it and denying it
 *   here? What does each protect against? (You could do both.)
 * - A reason like `confirm add_comment?` gets approved without reading. What makes a
 *   reason one you would actually read?
 * - Why does maxWrites count calls that ran, not calls the model asked for?
 */
export function checkToolCall(name: string, input: unknown, policy: Policy, state: RunState): Decision {
  void name;
  void input;
  void policy;
  void state;
  todo("P3-02", "Implement checkToolCall() in src/agent/guardrails.ts");
}
