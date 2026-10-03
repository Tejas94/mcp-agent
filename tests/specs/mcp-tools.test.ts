import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { connectIssueTracker } from "../../src/agent/mcp-client.js";

// Spec for P3-01 (src/mcp/server.ts). Red until you finish it; once green, move this
// file to tests/core so CI guards it from then on.
describe("MCP server", () => {
  it("exposes the full tool set", async () => {
    const mcp = await connectIssueTracker({ TRACKER_FILE: path.join(mkdtempSync(path.join(tmpdir(), "mcp-")), "i.json") });
    try {
      expect(mcp.tools.map((t) => t.name).sort()).toEqual(
        ["add_comment", "add_labels", "close_issue", "get_issue", "list_issues"],
      );
      const missing = await mcp.call("get_issue", { id: 999 });
      expect(missing.isError).toBe(true);
    } finally {
      await mcp.close();
    }
  }, 20_000);
});
