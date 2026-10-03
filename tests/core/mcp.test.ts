import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { connectGitHubServer, todoNotices } from "../../src/agent/mcp-client.js";

const sandbox = () => path.join(mkdtempSync(path.join(tmpdir(), "mcp-")), "state.json");

describe("MCP server over stdio", () => {
  it("serves list_issues from the fixture", async () => {
    const mcp = await connectGitHubServer({ BACKEND: "fixture", FIXTURE_STATE: sandbox(), FAIL_TOOLS: "" });
    try {
      const tool = mcp.tools.find((t) => t.name === "list_issues");
      expect(tool?.description).toMatch(/call get_issue/);
      expect(tool?.input_schema).toMatchObject({ type: "object" });
      expect(tool?.input_schema).not.toHaveProperty("$schema");

      const res = await mcp.call("list_issues", {});
      expect(res.isError).toBe(false);
      const issues = JSON.parse(res.text) as { number: number; state: string }[];
      expect(issues[0]).toMatchObject({ number: 1, state: "open" });
      expect(issues.map((i) => i.number)).not.toContain(11);

      const closed = JSON.parse((await mcp.call("list_issues", { state: "closed" })).text) as { number: number }[];
      expect(closed.map((i) => i.number)).toEqual([11]);
    } finally {
      await mcp.close();
    }
  }, 30_000);

  it("turns invalid input and injected failures into isError results", async () => {
    const mcp = await connectGitHubServer({ BACKEND: "fixture", FIXTURE_STATE: sandbox(), FAIL_TOOLS: "list_issues:1" });
    try {
      const failed = await mcp.call("list_issues", {});
      expect(failed).toMatchObject({ isError: true });
      expect(failed.text).toMatch(/502 Bad Gateway/);
      expect((await mcp.call("list_issues", {})).isError).toBe(false);

      const invalid = await mcp.call("list_issues", { state: "sideways" });
      expect(invalid.isError).toBe(true);
      expect(invalid.text).toMatch(/validation/i);
    } finally {
      await mcp.close();
    }
  }, 30_000);

  it("explains a startup failure", async () => {
    await expect(connectGitHubServer({ BACKEND: "live", GITHUB_TOKEN: "", GITHUB_REPO: "a/b" })).rejects.toThrow(
      /failed to start: [\s\S]*GITHUB_TOKEN is not set/,
    );
  }, 30_000);

  it("finds TODO notices in the server log", () => {
    expect(todoNotices("started\nNot implemented yet: P3-01. Register...\n")).toEqual(["Not implemented yet: P3-01. Register..."]);
  });
});
