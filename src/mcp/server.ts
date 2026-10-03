import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createBackend } from "../github/index.js";
import { ALLOWED_LABELS, CLOSE_REASONS, REVIEW_EVENTS } from "../github/types.js";
import { todo } from "../todo.js";

/**
 * An MCP server that exposes one GitHub repository as tools. Any MCP client can use it:
 * this project's agent, Claude Code, Claude Desktop, or the MCP Inspector
 * (`npm run mcp:inspect`, the fastest way to try your tools by hand).
 *
 * BACKEND=fixture (default) serves the tiny-shop sandbox; BACKEND=live serves the repo in
 * GITHUB_REPO. Fixture issues #8 and PR #22 contain prompt injections on purpose.
 *
 * stdout is the protocol channel, so never console.log here; use console.error.
 */
const backend = createBackend();
const server = new McpServer({ name: "github-triage", version: "0.1.0" });

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

// One finished tool, as a pattern to copy. Most of the "prompt" lives in the description:
// it is the only documentation the model gets, so it says what the tool returns and when
// to call something else instead. Annotations are hints for clients, not enforcement;
// the guardrail in src/agent/guardrails.ts is what enforces.
server.registerTool(
  "list_issues",
  {
    description:
      "List issues in the repository: number, title, state, author, labels and comment count. " +
      "No bodies or comments; call get_issue for those. Pull requests are not included; use list_pull_requests.",
    inputSchema: {
      state: z.enum(["open", "closed", "all"]).optional().describe("Defaults to open"),
      label: z.string().optional().describe("Only issues with this label"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ state, label }) => json(await backend.listIssues({ state, label })),
);

/**
 * TODO(P3-01) Week 7: register the remaining tools, copying the list_issues pattern.
 *
 * Inputs use these names, because the guardrails, the evals and the specs read them:
 *
 *   get_issue           { number }                            -> title, body, labels, state, comments
 *   search_code         { query }                             -> [{ path, line, snippet }]
 *   read_file           { path, start_line?, end_line? }      -> numbered lines of one file
 *   list_pull_requests  { state? }                            -> number, title, author, branches
 *   get_pull_request    { number }                            -> body, author, changed files with diffs
 *   add_labels          { number, labels[] }                  -> labels must be ALLOWED_LABELS (z.enum)
 *   add_comment         { number, body }
 *   submit_review       { number, event, body, comments?: [{ path, line, body }] }
 *                                                             -> event is one of REVIEW_EVENTS (z.enum)
 *   close_issue         { number, reason }                    -> reason is one of CLOSE_REASONS (z.enum)
 *
 * Each handler calls the matching `backend` method (src/github/types.ts lists them) and
 * returns its result as text the model can read. Replace the todo() call below with the
 * registerTool() calls.
 *
 * Constraints:
 * - Descriptions say what each tool returns, when to use it instead of another one, and
 *   for the write tools whether other people see the result or it is hard to undo:
 *   add_comment and submit_review notify people; close_issue is hard to undo.
 * - Validate inputs with zod (integers for numbers, enums for labels, events and reasons),
 *   and give each field a .describe(): it is all the model knows about it.
 * - Errors: let the backend throw. The SDK turns a thrown error into a result with
 *   isError: true and the message as text, which the model can read and recover from.
 *   Try get_issue { number: 999 } and read_file { path: "../.env" } in the Inspector.
 *
 * Design questions worth a paragraph each in your README:
 * - Why does read_file take a line range instead of always returning the whole file?
 *   (Context size and cost, and how the model asks for exactly what it needs.)
 * - Small tools like these, or one big `github(action, args)` tool? Think about tool
 *   choice, input validation, and what the guardrail can tell apart.
 * - Why do list_issues and list_pull_requests leave the bodies out?
 */
function registerRemainingTools(): void {
  void ALLOWED_LABELS;
  void REVIEW_EVENTS;
  void CLOSE_REASONS;
  todo("P3-01", "Register the remaining tools in registerRemainingTools(), src/mcp/server.ts");
}

try {
  registerRemainingTools();
} catch (err) {
  // Until P3-01 is done the server still starts, with list_issues only.
  console.error(err instanceof Error ? err.message : String(err));
}

await server.connect(new StdioServerTransport());
console.error(`github-triage MCP server on stdio, backend: ${backend.describe()}`);
