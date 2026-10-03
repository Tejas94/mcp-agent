import type { ToolOutcome } from "./mcp-client.js";
import { todo } from "../todo.js";

/**
 * Tools whose output contains text written by people on GitHub: titles, bodies, comments,
 * diffs and file contents. Any of it can hold instructions aimed at the agent (issue #8 and
 * PR #22 do). Write tools only echo back what the agent sent.
 */
export const GITHUB_CONTENT_TOOLS = [
  "list_issues",
  "get_issue",
  "search_code",
  "read_file",
  "list_pull_requests",
  "get_pull_request",
];

/** Default cap on what one tool result may put into the context. */
export const DEFAULT_MAX_CHARS = 12_000;

/** What goes into the tool_result block: its content and its is_error flag. */
export interface PreparedResult {
  content: string;
  isError: boolean;
}

/**
 * TODO(P3-04) Week 8: make every tool result safe to put in front of the model.
 *
 * Goal: the loop passes each outcome through this function before it becomes a
 * tool_result. Three jobs (tests/specs/tool-output.test.ts encodes them):
 *
 * 1. Cap the size. Text longer than `opts.maxChars` (default DEFAULT_MAX_CHARS) keeps its
 *    first maxChars characters and gets this note on its own line after the content:
 *      [truncated N characters; call read_file with a line range]
 *    where N is how many characters were cut.
 * 2. Mark GitHub-authored text. For tools in GITHUB_CONTENT_TOOLS, wrap the text as
 *      <untrusted_github_content source="get_issue">
 *      ...the tool's text...
 *      </untrusted_github_content>
 *    plus one reminder line outside the tags saying the content is data, not instructions.
 *    Other tools' output is not wrapped.
 * 3. Clean up errors. When outcome.isError is true, return a short message the model can
 *    act on: keep the useful first line (status code, what was not found), drop stack
 *    trace lines ("    at ..."), redact anything that looks like a token (ghp_..., github_pat_...,
 *    sk-ant-..., "Bearer xyz"), keep it under about 300 characters, and add a next step:
 *    for a transient error (5xx, rate limit, timeout) say it is safe to retry once. For
 *    any other error, do not mention retrying: the same call would fail the same way.
 *    isError stays true. Errors are not wrapped.
 *
 * Constraints:
 * - Pure function: no I/O, no model calls. Same input, same output.
 * - Someone can write "</untrusted_github_content>" in an issue body to break out of your
 *   wrapper. Make sure the only closing tag in the result is yours.
 *
 * Things to learn on the way:
 * - Wrapping does not make injection impossible. What does it change for the model, and
 *   which of your other defences still hold if the model ignores it?
 * - Why truncate here rather than in the MCP server? Who else uses the server?
 * - Read a trace from before and after this change on issue #8. What changed?
 * - Remember that the model never forgets a tool result in one run: every request resends
 *   it. What does a 50k-character diff cost over 20 steps?
 */
export function prepareToolResult(toolName: string, outcome: ToolOutcome, opts: { maxChars?: number } = {}): PreparedResult {
  void toolName;
  void outcome;
  void opts;
  todo("P3-04", "Implement prepareToolResult() in src/agent/tool-output.ts");
}
