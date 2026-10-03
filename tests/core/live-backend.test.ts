import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBackend } from "../../src/github/index.js";
import { LiveBackend, nextLink, rateLimitWaitMs } from "../../src/github/live.js";

const TOKEN = "ghp_testtoken0123456789abcdefghijklmnop";
type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };

/** A fake fetch: `routes` maps "METHOD path?query" (or "METHOD path") to responses, used in order. */
function fakeFetch(routes: Record<string, Response | Response[]>) {
  const calls: Call[] = [];
  const queues = new Map(Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({
      url: String(input),
      method,
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const queue = queues.get(`${method} ${url.pathname}${url.search}`) ?? queues.get(`${method} ${url.pathname}`);
    const res = queue?.length ? (queue.length > 1 ? queue.shift() : queue[0]) : undefined;
    if (!res) throw new Error(`unexpected ${method} ${url.pathname}${url.search}`);
    return res.clone();
  }) as typeof fetch;
  return { fn, calls };
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });

const backend = (routes: Record<string, Response | Response[]>) => {
  const f = fakeFetch(routes);
  const sleeps: number[] = [];
  const b = new LiveBackend({
    token: TOKEN,
    repo: "tejas/agent-sandbox",
    fetch: f.fn,
    sleep: async (ms) => void sleeps.push(ms),
  });
  return { b, calls: f.calls, sleeps };
};

const ghIssue = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  title: `Issue ${number}`,
  body: "body",
  state: "open",
  user: { login: "someone" },
  labels: [{ name: "bug" }],
  comments: 0,
  created_at: "2026-09-01T00:00:00Z",
  ...extra,
});

describe("LiveBackend", () => {
  it("lists issues across pages, without pull requests, with auth headers", async () => {
    const page2 = "https://api.github.com/repositories/1/issues?state=open&per_page=100&page=2";
    const { b, calls } = backend({
      "GET /repos/tejas/agent-sandbox/issues": json([ghIssue(1), ghIssue(2, { pull_request: {} })], 200, {
        link: `<${page2}>; rel="next", <${page2}>; rel="last"`,
      }),
      "GET /repositories/1/issues": json([ghIssue(3, { labels: ["question"] })]),
    });
    const issues = await b.listIssues({ label: "bug" });
    expect(issues.map((i) => i.number)).toEqual([1, 3]);
    expect(issues[1]?.labels).toEqual(["question"]);
    expect(calls[0]?.url).toContain("labels=bug");
    expect(calls[0]?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    expect(calls).toHaveLength(2);
  });

  it("gets an issue with comments, and refuses pull requests", async () => {
    const { b } = backend({
      "GET /repos/tejas/agent-sandbox/issues/1": json(ghIssue(1)),
      "GET /repos/tejas/agent-sandbox/issues/1/comments": json([
        { id: 7, user: { login: "sam" }, body: "+1", created_at: "2026-09-02T00:00:00Z" },
      ]),
      "GET /repos/tejas/agent-sandbox/issues/2": json(ghIssue(2, { pull_request: {} })),
      "GET /repos/tejas/agent-sandbox/issues/9": json({ message: "Not Found" }, 404),
    });
    expect((await b.getIssue(1)).comments).toEqual([{ id: 7, author: "sam", body: "+1", createdAt: "2026-09-02T00:00:00Z" }]);
    await expect(b.getIssue(2)).rejects.toThrow(/is a pull request/);
    await expect(b.getIssue(9)).rejects.toThrow(/Issue #9 not found in tejas\/agent-sandbox/);
  });

  it("reads files through the contents API as numbered lines", async () => {
    const content = Buffer.from("line one\nline two\nline three\n").toString("base64");
    const { b, calls } = backend({
      "GET /repos/tejas/agent-sandbox/contents/src/a.ts": json({ type: "file", name: "a.ts", path: "src/a.ts", content, encoding: "base64" }),
    });
    const slice = await b.readFile("./src/a.ts", { startLine: 2 });
    expect(slice).toMatchObject({ startLine: 2, endLine: 3, totalLines: 3, text: "2: line two\n3: line three" });
    await expect(b.readFile("../secrets")).rejects.toThrow(/outside the repository/);
    expect(calls).toHaveLength(1);
  });

  it("finds line numbers for code search hits", async () => {
    const content = Buffer.from("import x\nexport function calculateTotals() {}\n").toString("base64");
    const { b, calls } = backend({
      "GET /search/code": json({ total_count: 1, items: [{ path: "src/cart/totals.ts" }] }),
      "GET /repos/tejas/agent-sandbox/contents/src/cart/totals.ts": json({
        type: "file",
        name: "totals.ts",
        path: "src/cart/totals.ts",
        content,
        encoding: "base64",
      }),
    });
    expect(await b.searchCode("calculateTotals")).toEqual([
      { path: "src/cart/totals.ts", line: 2, snippet: "export function calculateTotals() {}" },
    ]);
    expect(new URL(calls[0]!.url).searchParams.get("q")).toBe("calculateTotals repo:tejas/agent-sandbox");
  });

  it("returns pull requests with files, diffs and reviews", async () => {
    const { b } = backend({
      "GET /repos/tejas/agent-sandbox/pulls/20": json({
        number: 20,
        title: "Fix",
        body: null,
        state: "open",
        merged_at: null,
        user: { login: "jordan" },
        head: { ref: "fix" },
        base: { ref: "main" },
        labels: [],
        created_at: "2026-09-09T00:00:00Z",
      }),
      "GET /repos/tejas/agent-sandbox/pulls/20/files": json([
        { filename: "src/a.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b" },
      ]),
      "GET /repos/tejas/agent-sandbox/issues/20/comments": json([]),
      "GET /repos/tejas/agent-sandbox/pulls/20/reviews": json([
        { id: 1, user: { login: "lee" }, state: "CHANGES_REQUESTED", body: "no", submitted_at: "2026-09-10T00:00:00Z" },
      ]),
    });
    const pr = await b.getPullRequest(20);
    expect(pr).toMatchObject({ number: 20, author: "jordan", head: "fix", body: "" });
    expect(pr.files[0]).toMatchObject({ path: "src/a.ts", patch: "@@ -1 +1 @@\n-a\n+b" });
    expect(pr.reviews[0]?.event).toBe("REQUEST_CHANGES");
  });

  it("sends writes with the right bodies", async () => {
    const { b, calls } = backend({
      "POST /repos/tejas/agent-sandbox/issues/1/labels": json([{ name: "bug" }, { name: "priority:high" }]),
      "POST /repos/tejas/agent-sandbox/issues/1/comments": json({ id: 9, user: { login: "me" }, body: "hi", created_at: "t" }, 201),
      "POST /repos/tejas/agent-sandbox/pulls/20/reviews": json({ id: 3, user: { login: "me" }, body: "fix it", state: "CHANGES_REQUESTED" }),
      "GET /repos/tejas/agent-sandbox/issues/4": json(ghIssue(4)),
      "PATCH /repos/tejas/agent-sandbox/issues/4": json(ghIssue(4, { state: "closed" })),
    });
    expect(await b.addLabels(1, ["priority:high"])).toEqual({ number: 1, labels: ["bug", "priority:high"] });
    await expect(b.addLabels(1, ["urgent"])).rejects.toThrow(/Unknown label/);
    await b.addComment(1, "hi");
    await b.submitReview(20, { event: "REQUEST_CHANGES", body: "fix it", comments: [{ path: "src/a.ts", line: 3, body: ">=" }] });
    await b.closeIssue(4, "duplicate");
    expect(calls.map((c) => c.body)).toEqual([
      { labels: ["priority:high"] },
      { body: "hi" },
      { event: "REQUEST_CHANGES", body: "fix it", comments: [{ path: "src/a.ts", line: 3, side: "RIGHT", body: ">=" }] },
      undefined,
      { state: "closed", state_reason: "duplicate" },
    ]);
  });

  it("retries a 502, then succeeds", async () => {
    const { b, sleeps } = backend({
      "GET /repos/tejas/agent-sandbox/issues": [json({ message: "Server Error" }, 502), json([ghIssue(1)])],
    });
    expect(await b.listIssues()).toHaveLength(1);
    expect(sleeps).toEqual([500]);
  });

  it("fails fast on a long rate limit, with a clear message and no token", async () => {
    const reset = String(Math.floor(Date.now() / 1000) + 3600);
    const { b } = backend({
      "GET /repos/tejas/agent-sandbox/issues": json({ message: "API rate limit exceeded" }, 403, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": reset,
      }),
    });
    const err = await b.listIssues().catch((e: Error) => e);
    expect(String(err)).toMatch(/rate limit exceeded on GET \/repos\/tejas\/agent-sandbox\/issues/);
    expect(String(err)).not.toContain(TOKEN);
  });

  it("waits out a short rate limit", async () => {
    const { b, sleeps } = backend({
      "GET /repos/tejas/agent-sandbox/issues": [
        json({ message: "secondary rate limit" }, 403, { "retry-after": "2" }),
        json([]),
      ],
    });
    expect(await b.listIssues()).toEqual([]);
    expect(sleeps).toEqual([2000]);
  });

  it("reports other errors with GitHub's message", async () => {
    const { b } = backend({
      "POST /repos/tejas/agent-sandbox/pulls/20/reviews": json(
        { message: "Unprocessable Entity", errors: ["Can not request changes on your own pull request"] },
        422,
      ),
    });
    await expect(b.submitReview(20, { event: "REQUEST_CHANGES", body: "x" })).rejects.toThrow(
      /422 on POST .*own pull request/,
    );
  });
});

describe("helpers", () => {
  it("reads the next page from a Link header", () => {
    expect(nextLink('<https://x/a?page=2>; rel="next", <https://x/a?page=5>; rel="last"')).toBe("https://x/a?page=2");
    expect(nextLink('<https://x/a?page=1>; rel="prev"')).toBeNull();
    expect(nextLink(null)).toBeNull();
  });

  it("recognises rate-limit responses", () => {
    expect(rateLimitWaitMs(new Response("", { status: 429, headers: { "retry-after": "5" } }))).toBe(5000);
    expect(rateLimitWaitMs(new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "110" } }), 100_000)).toBe(10_000);
    expect(rateLimitWaitMs(new Response("", { status: 403 }))).toBeNull();
    expect(rateLimitWaitMs(new Response("", { status: 500 }))).toBeNull();
  });
});

describe("createBackend", () => {
  it("uses the fixture by default and checks live settings", () => {
    expect(createBackend({ FIXTURE_STATE: path.join(mkdtempSync(path.join(tmpdir(), "live-")), "s.json") }).describe()).toMatch(/^fixture example\/tiny-shop/);
    expect(() => createBackend({ BACKEND: "live", GITHUB_REPO: "a/b" })).toThrow(/GITHUB_TOKEN is not set/);
    expect(() => createBackend({ BACKEND: "live", GITHUB_TOKEN: "x", GITHUB_REPO: "nope" })).toThrow(/owner\/name/);
    expect(() => createBackend({ BACKEND: "github" })).toThrow(/fixture" or "live/);
    expect(createBackend({ BACKEND: "live", GITHUB_TOKEN: "x", GITHUB_REPO: "a/b" }).describe()).toBe("live a/b");
  });
});
