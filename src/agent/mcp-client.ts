import type Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { ROOT } from "../paths.js";

/** What one tool call returned: the text the server sent, and whether it was an error. */
export interface ToolOutcome {
  text: string;
  isError: boolean;
}

export interface McpConnection {
  /** The server's tools, already converted to the Messages API tool format. */
  tools: Anthropic.Tool[];
  /** Never throws: transport failures come back as an isError outcome too. */
  call(name: string, input: unknown): Promise<ToolOutcome>;
  /** The end of the server's stderr, where it logs startup notes and open TODOs. */
  serverLog(): string;
  close(): Promise<void>;
}

/** Lines in the server log that point at an unfinished TODO. */
export function todoNotices(log: string): string[] {
  return log.split("\n").filter((l) => l.includes("Not implemented yet"));
}

/**
 * Starts the GitHub MCP server (src/mcp/server.ts) as a child process and connects to it
 * over stdio. `env` is added to this process's environment, so the evals can point each
 * run at its own sandbox: { BACKEND: "fixture", FIXTURE_STATE: "/tmp/...", FAIL_TOOLS: "" }.
 */
export async function connectGitHubServer(env: Record<string, string> = {}): Promise<McpConnection> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", path.join(ROOT, "src", "mcp", "server.ts")],
    cwd: ROOT,
    env: { ...(process.env as Record<string, string>), ...env },
    stderr: "pipe",
  });
  // Keep the end of the server's stderr so a startup failure says why.
  let stderrTail = "";
  transport.stderr?.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000);
  });

  const client = new Client({ name: "github-triage-agent", version: "0.1.0" });
  try {
    await client.connect(transport);
  } catch (err) {
    const why = stderrTail.trim() || (err instanceof Error ? err.message : String(err));
    throw new Error(`The MCP server failed to start: ${why}`);
  }

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
      try {
        const res = await client.callTool({ name, arguments: (input ?? {}) as Record<string, unknown> });
        const content = (res.content ?? []) as { type: string; text?: string }[];
        const text = content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
        return { text, isError: Boolean(res.isError) };
      } catch (err) {
        return { text: `MCP call failed: ${err instanceof Error ? err.message : String(err)}`, isError: true };
      }
    },
    serverLog: () => stderrTail,
    close: () => client.close(),
  };
}
