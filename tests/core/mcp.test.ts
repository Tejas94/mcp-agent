import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { connectIssueTracker } from "../../src/agent/mcp-client.js";
import { SEED_FILE } from "../../src/tracker/store.js";

describe("MCP server", () => {
  it("serves list_issues over stdio", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "mcp-")), "issues.json");
    copyFileSync(SEED_FILE, file);
    const mcp = await connectIssueTracker({ TRACKER_FILE: file });
    try {
      expect(mcp.tools.map((t) => t.name)).toContain("list_issues");
      const res = await mcp.call("list_issues", {});
      expect(res.isError).toBe(false);
      expect(JSON.parse(res.text)[0]).toMatchObject({ id: 1, state: "open" });
    } finally {
      await mcp.close();
    }
  }, 20_000);
});
