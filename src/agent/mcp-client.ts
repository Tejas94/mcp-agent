import type Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface ToolOutcome {
  text: string;
  isError: boolean;
}

export interface McpConnection {
  /** The server's tools, already converted to the Messages API tool format. */
  tools: Anthropic.Tool[];
  call(name: string, input: unknown): Promise<ToolOutcome>;
  close(): Promise<void>;
}

/** Starts the issue-tracker MCP server as a child process and connects to it over stdio. */
export async function connectIssueTracker(env: Record<string, string> = {}): Promise<McpConnection> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/mcp/server.ts"],
    env: { ...(process.env as Record<string, string>), ...env },
    stderr: "ignore",
  });
  const client = new Client({ name: "triage-agent", version: "0.1.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  return {
    tools: tools.map((t) => {
      // MCP schemas carry a "$schema" key the Messages API does not need.
      const { $schema: _ignored, ...schema } = t.inputSchema as Record<string, unknown>;
      return {
        name: t.name,
        description: t.description ?? "",
        input_schema: schema as Anthropic.Tool.InputSchema,
      };
    }),
    async call(name, input) {
      const res = await client.callTool({ name, arguments: input as Record<string, unknown> });
      const content = (res.content ?? []) as { type: string; text?: string }[];
      const text = content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
      return { text, isError: Boolean(res.isError) };
    },
    close: () => client.close(),
  };
}
