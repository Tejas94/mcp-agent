import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ALLOWED_LABELS, IssueStore } from "../tracker/store.js";

/**
 * An MCP server exposing the issue tracker. Any MCP client can use it: this
 * project's agent, Claude Desktop, Claude Code, or the MCP Inspector
 * (`npm run mcp:inspect`, the fastest way to poke at your tools by hand).
 *
 * stdout is the protocol channel, so never console.log here; use console.error.
 */
const store = new IssueStore();
const server = new McpServer({ name: "issue-tracker", version: "0.1.0" });

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

// One finished tool, as a pattern to copy. Note how much of the "prompt" lives in
// the description: it is the only documentation the model gets.
server.registerTool(
  "list_issues",
  {
    description:
      "List issues in the tracker. Returns id, title, state and labels only; call get_issue for the body and comments.",
    inputSchema: {
      state: z.enum(["open", "closed", "all"]).optional().describe("Defaults to open"),
      label: z.string().optional().describe("Only issues with this label"),
    },
  },
  async ({ state, label }) =>
    json(store.list({ state, label }).map(({ id, title, state, labels }) => ({ id, title, state, labels }))),
);

/**
 * TODO(P3-01) Week 7: register the remaining tools.
 *
 *   get_issue    { id }                 -> full issue incl. body and comments
 *   add_labels   { id, labels[] }       -> labels must be from ALLOWED_LABELS (use z.enum)
 *   add_comment  { id, body }
 *   close_issue  { id, reason }         -> destructive: say so in the description
 *
 * Errors: let the store throw. The SDK turns a thrown error into a tool result
 * with isError: true, which the model can read and recover from. Check that
 * with the Inspector: what does the model see for get_issue { id: 999 }?
 *
 * Design questions worth a paragraph in your README:
 * - Why does list_issues hide the body? (Context size, and prompt injection exposure.)
 * - Would one "update_issue" tool be better or worse than these small ones?
 */
void ALLOWED_LABELS;

await server.connect(new StdioServerTransport());
console.error("issue-tracker MCP server running on stdio");
