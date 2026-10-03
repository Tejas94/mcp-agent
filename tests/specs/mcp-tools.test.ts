// Spec for P3-01 (src/mcp/server.ts). Red until you finish it; once green, move this file to tests/core so CI guards it from then on.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectGitHubServer, type McpConnection } from "../../src/agent/mcp-client.js";
import { readState } from "../../src/github/fixture.js";

const ALL_TOOLS = [
  "add_comment",
  "add_labels",
  "close_issue",
  "get_issue",
  "get_pull_request",
  "list_issues",
  "list_pull_requests",
  "read_file",
  "search_code",
  "submit_review",
];

let mcp: McpConnection;
let stateFile: string;

beforeAll(async () => {
  stateFile = path.join(mkdtempSync(path.join(tmpdir(), "mcp-tools-")), "state.json");
  mcp = await connectGitHubServer({ BACKEND: "fixture", FIXTURE_STATE: stateFile, FAIL_TOOLS: "" });
}, 30_000);

afterAll(async () => {
  await mcp?.close();
});

/** Calls a tool and, when it returns an error, fails with the server's own message. */
async function succeed(name: string, args: Record<string, unknown>): Promise<string> {
  const res = await mcp.call(name, args);
  expect(res.isError, `${name} returned an error: ${res.text}`).toBe(false);
  return res.text;
}

const schemaOf = (name: string) => mcp.tools.find((t) => t.name === name)?.input_schema as
  | { properties?: Record<string, { type?: string; enum?: string[]; items?: { enum?: string[] } }>; required?: string[] }
  | undefined;

describe("MCP tools", () => {
  it("exposes the full tool set, each with a description", () => {
    expect(mcp.tools.map((t) => t.name).sort()).toEqual(ALL_TOOLS);
    for (const t of mcp.tools) expect(t.description ?? "", t.name).toMatch(/.{20}/);
  });

  it("uses the agreed input names, with enums for labels, review events and close reasons", () => {
    expect(schemaOf("get_issue")?.required).toEqual(["number"]);
    expect(schemaOf("get_issue")?.properties?.number?.type).toBe("integer");
    expect(Object.keys(schemaOf("read_file")?.properties ?? {}).sort()).toEqual(["end_line", "path", "start_line"]);
    expect(schemaOf("add_labels")?.properties?.labels?.items?.enum).toContain("needs-info");
    expect(schemaOf("submit_review")?.properties?.event?.enum?.sort()).toEqual(["APPROVE", "COMMENT", "REQUEST_CHANGES"]);
    expect(schemaOf("close_issue")?.properties?.reason?.enum).toContain("not_planned");
  });

  it("get_issue returns the body and comments", async () => {
    const text = await succeed("get_issue", { number: 1 });
    expect(text).toContain("SAVE10");
    expect(text).toContain("sam-okafor");
  });

  it("get_issue on a missing issue is an error the model can read", async () => {
    const res = await mcp.call("get_issue", { number: 999 });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/#999 not found/);
  });

  it("read_file returns the requested lines, numbered", async () => {
    const text = await succeed("read_file", { path: "src/cart/totals.ts", start_line: 19, end_line: 22 });
    expect(text).toContain("export function calculateTotals");
    expect(text).toContain("22");
    expect(text).not.toContain("import type { Cart }");
  });

  it("read_file refuses paths outside the repository", async () => {
    const res = await mcp.call("read_file", { path: "../.env" });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/outside the repository/);
    expect(res.text).not.toContain("tinyshop_fake_live");
  });

  it("search_code finds a known symbol", async () => {
    expect(await succeed("search_code", { query: "calculateTotals" })).toContain("src/cart/totals.ts");
  });

  it("lists pull requests and returns one with its diff", async () => {
    expect(await succeed("list_pull_requests", {})).toContain("Fix discount applied twice");
    const pr = await succeed("get_pull_request", { number: 20 });
    expect(pr).toContain("src/cart/discounts.ts");
    expect(pr).toContain("meetsMinimum");
    expect(pr).toContain("@@");
  });

  it("add_labels writes allowed labels and rejects others before they reach the backend", async () => {
    await succeed("add_labels", { number: 1, labels: ["bug"] });
    expect(readState(stateFile).issues.find((i) => i.number === 1)?.labels).toContain("bug");

    const bad = await mcp.call("add_labels", { number: 1, labels: ["urgent"] });
    expect(bad.isError).toBe(true);
    expect(bad.text).not.toMatch(/Tool add_labels not found/);
    expect(bad.text).toMatch(/validation|invalid|expected/i);
    expect(readState(stateFile).issues.find((i) => i.number === 1)?.labels).not.toContain("urgent");
  });

  it("add_comment, submit_review and close_issue write to the sandbox", async () => {
    await succeed("add_comment", { number: 4, body: "Which step fails, and in which browser?" });
    await succeed("submit_review", {
      number: 20,
      event: "REQUEST_CHANGES",
      body: "The minimum-spend check changed from < to >.",
      comments: [{ path: "src/cart/discounts.ts", line: 24, body: "Orders of exactly $50.00 lose SAVE10 here." }],
    });
    await succeed("close_issue", { number: 12, reason: "not_planned" });

    const state = readState(stateFile);
    expect(state.issues.find((i) => i.number === 4)?.comments.at(-1)?.body).toBe("Which step fails, and in which browser?");
    expect(state.pullRequests.find((p) => p.number === 20)?.reviews[0]).toMatchObject({
      event: "REQUEST_CHANGES",
      comments: [{ path: "src/cart/discounts.ts", line: 24 }],
    });
    expect(state.issues.find((i) => i.number === 12)).toMatchObject({ state: "closed", stateReason: "not_planned" });
  });

  it("passes backend errors on writes back as readable errors", async () => {
    const res = await mcp.call("close_issue", { number: 20, reason: "completed" });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/pull request/);
  });
});
