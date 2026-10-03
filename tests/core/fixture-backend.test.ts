import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FixtureBackend, diffLineRanges, parseFailTools, readState } from "../../src/github/fixture.js";
import { FIXTURE_DIR } from "../../src/paths.js";

let stateFile: string;
const make = (failTools = "") =>
  new FixtureBackend({ stateFile, failTools, now: () => "2026-10-01T00:00:00.000Z" }, {});

beforeEach(() => {
  stateFile = path.join(mkdtempSync(path.join(tmpdir(), "fixture-")), "state.json");
});

describe("FixtureBackend reads", () => {
  it("creates the state file from the fixture on first use", () => {
    make();
    expect(existsSync(stateFile)).toBe(true);
    expect(readState(stateFile).repo).toBe("example/tiny-shop");
  });

  it("lists open issues by default, and filters by state and label", async () => {
    const b = make();
    const open = await b.listIssues();
    expect(open.map((i) => i.number)).not.toContain(11);
    expect(open[0]).toMatchObject({ number: 1, state: "open", commentCount: 1 });
    expect((await b.listIssues({ state: "closed" })).map((i) => i.number)).toEqual([11]);
    expect((await b.listIssues({ label: "feature" })).map((i) => i.number)).toEqual([9]);
  });

  it("gets an issue with its body and comments", async () => {
    const issue = await make().getIssue(1);
    expect(issue.body).toContain("SAVE10");
    expect(issue.comments[0]?.author).toBe("sam-okafor");
  });

  it("explains missing issues and pull requests asked for as issues", async () => {
    const b = make();
    await expect(b.getIssue(999)).rejects.toThrow(/Issue #999 not found/);
    await expect(b.getIssue(20)).rejects.toThrow(/is a pull request/);
    await expect(b.getPullRequest(1)).rejects.toThrow(/is an issue/);
  });

  it("searches the code case-insensitively, with line numbers", async () => {
    const hits = await make().searchCode("calculatetotals");
    expect(hits).toContainEqual(expect.objectContaining({ path: "src/cart/totals.ts", line: 19 }));
    await expect(make().searchCode("  ")).rejects.toThrow(/empty/);
  });

  it("reads numbered line ranges", async () => {
    const slice = await make().readFile("src/cart/totals.ts", { startLine: 19, endLine: 21 });
    expect(slice).toMatchObject({ path: "src/cart/totals.ts", startLine: 19, endLine: 21, totalLines: 29 });
    expect(slice.text.split("\n")).toHaveLength(3);
    expect(slice.text).toMatch(/^19: export function calculateTotals/);
    expect(slice.text).toContain("21: ");
  });

  it("explains bad ranges, missing files and directories", async () => {
    const b = make();
    await expect(b.readFile("src/cart/totals.ts", { startLine: 500 })).rejects.toThrow(/past the end/);
    await expect(b.readFile("src/nope.ts")).rejects.toThrow(/File not found/);
    await expect(b.readFile("src/cart")).rejects.toThrow(/is a directory.*totals\.ts/);
  });

  it("confines paths to the repo, though a .env sits right next to it", async () => {
    expect(existsSync(path.join(FIXTURE_DIR, ".env"))).toBe(true);
    const b = make();
    for (const p of ["../.env", "src/../../.env", "/etc/passwd", "..\\.env"]) {
      await expect(b.readFile(p)).rejects.toThrow(/outside the repository/);
    }
  });

  it("lists pull requests and returns their diffs", async () => {
    const b = make();
    expect((await b.listPullRequests()).map((p) => p.number)).toEqual([20, 21, 22]);
    const pr = await b.getPullRequest(20);
    expect(pr.files.map((f) => f.path)).toEqual(["src/cart/discounts.ts", "src/cart/totals.ts", "test/totals.test.ts"]);
    expect(pr.files[0]?.patch).toContain("+  return subtotal > rule.minSubtotal;");
  });
});

describe("FixtureBackend writes", () => {
  it("adds allowed labels without duplicates, and refuses others", async () => {
    const b = make();
    await b.addLabels(1, ["bug", "priority:high"]);
    expect((await b.addLabels(1, ["bug"])).labels).toEqual(["bug", "priority:high"]);
    await expect(b.addLabels(1, ["urgent"])).rejects.toThrow(/Unknown label/);
    expect(readState(stateFile).issues[0]?.labels).toEqual(["bug", "priority:high"]);
  });

  it("comments on issues and pull requests as the agent", async () => {
    const b = make();
    const c = await b.addComment(4, "Which step fails?");
    expect(c).toMatchObject({ author: "triage-agent", body: "Which step fails?", createdAt: "2026-10-01T00:00:00.000Z" });
    await b.addComment(20, "Thanks!");
    const state = readState(stateFile);
    expect(state.issues.find((i) => i.number === 4)?.comments.at(-1)?.body).toBe("Which step fails?");
    expect(state.pullRequests[0]?.comments).toHaveLength(1);
    await expect(b.addComment(4, "  ")).rejects.toThrow(/empty/);
  });

  it("submits reviews with inline comments only on lines in the diff", async () => {
    const b = make();
    const review = await b.submitReview(20, {
      event: "REQUEST_CHANGES",
      body: "Off by one",
      comments: [{ path: "src/cart/discounts.ts", line: 24, body: "Should be >=" }],
    });
    expect(review).toMatchObject({ author: "triage-agent", event: "REQUEST_CHANGES" });
    expect(readState(stateFile).pullRequests[0]?.reviews).toHaveLength(1);
    await expect(
      b.submitReview(20, { event: "COMMENT", body: "x", comments: [{ path: "src/cart/discounts.ts", line: 2, body: "?" }] }),
    ).rejects.toThrow(/not part of the diff/);
    await expect(
      b.submitReview(20, { event: "COMMENT", body: "x", comments: [{ path: "README.md", line: 1, body: "?" }] }),
    ).rejects.toThrow(/not changed in PR #20/);
    await expect(b.submitReview(20, { event: "REQUEST_CHANGES", body: "" })).rejects.toThrow(/needs a body/);
  });

  it("closes open issues once, and never pull requests", async () => {
    const b = make();
    expect(await b.closeIssue(12, "not_planned")).toEqual({ number: 12, state: "closed", stateReason: "not_planned" });
    await expect(b.closeIssue(12, "completed")).rejects.toThrow(/already closed/);
    await expect(b.closeIssue(20, "completed")).rejects.toThrow(/is a pull request/);
  });

  it("resets to the fixture", async () => {
    const b = make();
    await b.closeIssue(1, "completed");
    b.reset();
    expect((await b.getIssue(1)).state).toBe("open");
  });
});

describe("FAIL_TOOLS", () => {
  it("parses tool:count pairs and rejects nonsense", () => {
    expect([...parseFailTools("read_file:1, search_code:2")]).toEqual([
      ["read_file", 1],
      ["search_code", 2],
    ]);
    expect(parseFailTools(undefined).size).toBe(0);
    expect(() => parseFailTools("read_file")).toThrow(/should look like/);
  });

  it("fails the first N calls of a tool with transient GitHub errors, then works", async () => {
    const b = make("read_file:2");
    await expect(b.readFile("README.md")).rejects.toThrow(/502 Bad Gateway/);
    await expect(b.readFile("README.md")).rejects.toThrow(/rate limit/);
    await expect(b.readFile("README.md")).resolves.toMatchObject({ path: "README.md" });
    await expect(b.searchCode("cart")).resolves.not.toHaveLength(0);
  });

  it("reads FAIL_TOOLS and FIXTURE_STATE from the environment", async () => {
    const b = new FixtureBackend({}, { FIXTURE_STATE: stateFile, FAIL_TOOLS: "get_issue:1" });
    expect(b.stateFile).toBe(stateFile);
    await expect(b.getIssue(1)).rejects.toThrow(/502/);
    expect(b.describe()).toContain("FAIL_TOOLS=get_issue:1");
  });
});

describe("diffLineRanges", () => {
  it("reads the new-file ranges from hunk headers", () => {
    expect(diffLineRanges("@@ -14,8 +14,12 @@ x\n a\n@@ -40 +44 @@\n")).toEqual([
      [14, 25],
      [44, 44],
    ]);
  });
});
