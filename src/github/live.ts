import { splitLines } from "./fixture.js";
import {
  ALLOWED_LABELS,
  GitHubError,
  normalizeRepoPath,
  numberLines,
  resolveRange,
  type CloseReason,
  type CodeHit,
  type Comment,
  type FileSlice,
  type GitHubBackend,
  type Issue,
  type IssueSummary,
  type PullRequest,
  type PullRequestSummary,
  type Review,
  type ReviewEvent,
  type ReviewInput,
  type StateFilter,
} from "./types.js";

export interface LiveOptions {
  /** A fine-grained token limited to one sandbox repo (docs/LIVE_MODE.md). */
  token: string;
  /** "owner/name" */
  repo: string;
  apiUrl?: string;
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Retries for 5xx responses, network errors and short rate-limit waits. */
  maxRetries?: number;
  /** Wait for a rate limit to reset if it resets within this many ms; otherwise fail fast. */
  maxRateLimitWaitMs?: number;
}

/** Most pages a list call follows (100 items each). */
const MAX_PAGES = 10;
/** search_code fetches at most this many files to find line numbers. */
const SEARCH_FILES = 5;
const MAX_SEARCH_HITS = 30;

// The parts of GitHub's JSON this backend reads.
interface GhUser {
  login: string;
}
interface GhLabel {
  name: string;
}
interface GhIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  state_reason?: string | null;
  user: GhUser | null;
  labels: (GhLabel | string)[];
  comments: number;
  created_at: string;
  pull_request?: unknown;
}
interface GhComment {
  id: number;
  user: GhUser | null;
  body?: string;
  created_at: string;
}
interface GhPull {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  merged_at: string | null;
  user: GhUser | null;
  head: { ref: string };
  base: { ref: string };
  labels: GhLabel[];
  created_at: string;
}
interface GhFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}
interface GhReview {
  id: number;
  user: GhUser | null;
  state: string;
  body: string | null;
  submitted_at?: string;
}
interface GhContent {
  type: string;
  name: string;
  path: string;
  content?: string;
  encoding?: string;
}

/**
 * The GitHub REST API behind the same interface as the fixture. Every call goes to
 * one repository, the one in GITHUB_REPO. Use a sandbox repo you own and a token
 * scoped to it; see docs/LIVE_MODE.md.
 */
export class LiveBackend implements GitHubBackend {
  readonly repo: string;
  private readonly token: string;
  private readonly apiUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly maxRateLimitWaitMs: number;

  constructor(opts: LiveOptions) {
    if (!opts.token) throw new Error("GITHUB_TOKEN is not set. Live mode needs a token; see docs/LIVE_MODE.md.");
    if (!/^[\w.-]+\/[\w.-]+$/.test(opts.repo ?? "")) {
      throw new Error(`GITHUB_REPO should look like owner/name, got "${opts.repo ?? ""}".`);
    }
    this.token = opts.token;
    this.repo = opts.repo;
    this.apiUrl = (opts.apiUrl ?? "https://api.github.com").replace(/\/$/, "");
    this.fetchFn = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxRetries = opts.maxRetries ?? 2;
    this.maxRateLimitWaitMs = opts.maxRateLimitWaitMs ?? 10_000;
  }

  describe(): string {
    return `live ${this.repo}`;
  }

  async listIssues(filter: { state?: StateFilter; label?: string } = {}): Promise<IssueSummary[]> {
    const query = new URLSearchParams({ state: filter.state ?? "open", per_page: "100" });
    if (filter.label) query.set("labels", filter.label);
    const items = await this.paginate<GhIssue>(`${this.repoPath()}/issues?${query}`);
    // The issues endpoint also returns pull requests; they have a pull_request key.
    return items
      .filter((i) => !i.pull_request)
      .map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        author: login(i.user),
        labels: labelNames(i.labels),
        commentCount: i.comments,
        createdAt: i.created_at,
      }));
  }

  async getIssue(number: number): Promise<Issue> {
    const issue = await this.getRawIssue(number);
    if (issue.pull_request) throw new GitHubError(`#${number} is a pull request, not an issue. Use get_pull_request.`, 404);
    return {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      state: issue.state,
      stateReason: (issue.state_reason as CloseReason | null | undefined) ?? null,
      author: login(issue.user),
      labels: labelNames(issue.labels),
      comments: await this.comments(number),
      createdAt: issue.created_at,
    };
  }

  async searchCode(query: string): Promise<CodeHit[]> {
    const q = query.trim();
    if (!q) throw new GitHubError("The search query is empty.", 422);
    // Code search needs auth, is limited to 10 requests a minute, and only indexes the
    // default branch. It returns files, not lines, so read the top files to find lines.
    const params = new URLSearchParams({ q: `${q} repo:${this.repo}`, per_page: String(SEARCH_FILES) });
    const { data } = await this.request<{ items: { path: string }[] }>("GET", `/search/code?${params}`);
    const paths = [...new Set(data.items.map((i) => i.path))].slice(0, SEARCH_FILES);
    const needles = [q.toLowerCase(), ...q.toLowerCase().split(/\s+/)];
    const hits: CodeHit[] = [];
    for (const p of paths) {
      const lines = splitLines(await this.fileText(p));
      const needle = needles.find((n) => lines.some((l) => l.toLowerCase().includes(n))) ?? needles[0]!;
      lines.forEach((text, i) => {
        if (hits.length < MAX_SEARCH_HITS && text.toLowerCase().includes(needle)) {
          hits.push({ path: p, line: i + 1, snippet: text.trim().slice(0, 200) });
        }
      });
    }
    return hits;
  }

  async readFile(filePath: string, range: { startLine?: number; endLine?: number } = {}): Promise<FileSlice> {
    const rel = normalizeRepoPath(filePath);
    const lines = splitLines(await this.fileText(rel));
    const { startLine, endLine } = resolveRange(rel, lines.length, range);
    return {
      path: rel,
      startLine,
      endLine,
      totalLines: lines.length,
      text: numberLines(lines.slice(startLine - 1, endLine), startLine),
    };
  }

  async listPullRequests(filter: { state?: StateFilter } = {}): Promise<PullRequestSummary[]> {
    const query = new URLSearchParams({ state: filter.state ?? "open", per_page: "100" });
    const pulls = await this.paginate<GhPull>(`${this.repoPath()}/pulls?${query}`);
    return pulls.map(pullSummary);
  }

  async getPullRequest(number: number): Promise<PullRequest> {
    const pull = await this.request<GhPull>("GET", `${this.repoPath()}/pulls/${number}`).then(
      (r) => r.data,
      (err: unknown) => {
        if (err instanceof GitHubError && err.status === 404) {
          throw new GitHubError(`Pull request #${number} not found in ${this.repo}. Use list_pull_requests.`, 404);
        }
        throw err;
      },
    );
    const [files, comments, reviews] = await Promise.all([
      this.paginate<GhFile>(`${this.repoPath()}/pulls/${number}/files?per_page=100`),
      this.comments(number),
      this.paginate<GhReview>(`${this.repoPath()}/pulls/${number}/reviews?per_page=100`),
    ]);
    return {
      ...pullSummary(pull),
      body: pull.body ?? "",
      labels: labelNames(pull.labels),
      files: files.map((f) => ({
        path: f.filename,
        status: (["added", "removed", "renamed"].includes(f.status) ? f.status : "modified") as PullRequest["files"][number]["status"],
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? "(no diff: the file is binary or too large)",
      })),
      comments,
      reviews: reviews
        .filter((r) => r.state !== "PENDING")
        .map((r) => ({
          id: r.id,
          author: login(r.user),
          event: reviewEvent(r.state),
          body: r.body ?? "",
          comments: [],
          submittedAt: r.submitted_at ?? "",
        })),
    };
  }

  async addLabels(number: number, labels: string[]): Promise<{ number: number; labels: string[] }> {
    const unknown = labels.filter((l) => !(ALLOWED_LABELS as readonly string[]).includes(l));
    if (unknown.length) {
      throw new GitHubError(`Unknown label(s): ${unknown.join(", ")}. Allowed labels: ${ALLOWED_LABELS.join(", ")}.`, 422);
    }
    const { data } = await this.request<GhLabel[]>("POST", `${this.repoPath()}/issues/${number}/labels`, { labels });
    return { number, labels: labelNames(data) };
  }

  async addComment(number: number, body: string): Promise<Comment> {
    if (!body.trim()) throw new GitHubError("The comment body is empty.", 422);
    const { data } = await this.request<GhComment>("POST", `${this.repoPath()}/issues/${number}/comments`, { body });
    return { id: data.id, author: login(data.user), body: data.body ?? body, createdAt: data.created_at };
  }

  async submitReview(pullNumber: number, review: ReviewInput): Promise<Review> {
    const comments = review.comments ?? [];
    const { data } = await this.request<GhReview>("POST", `${this.repoPath()}/pulls/${pullNumber}/reviews`, {
      event: review.event,
      body: review.body,
      // `line` and `side` replace the deprecated diff `position`.
      comments: comments.map((c) => ({ path: c.path, line: c.line, side: "RIGHT", body: c.body })),
    });
    return {
      id: data.id,
      author: login(data.user),
      event: review.event,
      body: data.body ?? review.body,
      comments,
      submittedAt: data.submitted_at ?? new Date().toISOString(),
    };
  }

  async closeIssue(number: number, reason: CloseReason): Promise<{ number: number; state: "closed"; stateReason: CloseReason }> {
    const issue = await this.getRawIssue(number);
    if (issue.pull_request) throw new GitHubError(`#${number} is a pull request. close_issue only closes issues.`, 422);
    if (issue.state === "closed") throw new GitHubError(`Issue #${number} is already closed.`, 422);
    await this.request("PATCH", `${this.repoPath()}/issues/${number}`, { state: "closed", state_reason: reason });
    return { number, state: "closed", stateReason: reason };
  }

  private repoPath(): string {
    return `/repos/${this.repo}`;
  }

  private async getRawIssue(number: number): Promise<GhIssue> {
    try {
      return (await this.request<GhIssue>("GET", `${this.repoPath()}/issues/${number}`)).data;
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) {
        throw new GitHubError(`Issue #${number} not found in ${this.repo}. Use list_issues to see which issues exist.`, 404);
      }
      throw err;
    }
  }

  private async comments(number: number): Promise<Comment[]> {
    const raw = await this.paginate<GhComment>(`${this.repoPath()}/issues/${number}/comments?per_page=100`);
    return raw.map((c) => ({ id: c.id, author: login(c.user), body: c.body ?? "", createdAt: c.created_at }));
  }

  private async fileText(rel: string): Promise<string> {
    const encoded = rel.split("/").map(encodeURIComponent).join("/");
    let data: GhContent | GhContent[];
    try {
      data = (await this.request<GhContent | GhContent[]>("GET", `${this.repoPath()}/contents/${encoded}`)).data;
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) {
        throw new GitHubError(`File not found: ${rel}. Use search_code to find the right path.`, 404);
      }
      throw err;
    }
    if (Array.isArray(data)) {
      const entries = data.map((e) => e.name).sort().join(", ");
      throw new GitHubError(`"${rel}" is a directory. Files in it: ${entries}. Call read_file on one of them.`, 400);
    }
    if (data.type !== "file") throw new GitHubError(`"${rel}" is a ${data.type}, not a file.`, 400);
    if (data.encoding !== "base64" || data.content === undefined) {
      throw new GitHubError(`"${rel}" is too large to read through the contents API.`, 413);
    }
    return Buffer.from(data.content, "base64").toString("utf8");
  }

  /** Follows `Link: <...>; rel="next"` headers, up to MAX_PAGES pages. */
  private async paginate<T>(firstPath: string): Promise<T[]> {
    const out: T[] = [];
    let next: string | null = firstPath;
    for (let page = 0; next && page < MAX_PAGES; page++) {
      const { data, headers } = await this.request<T[]>("GET", next);
      out.push(...data);
      next = nextLink(headers.get("link"));
    }
    return out;
  }

  /** One API call with retries for 5xx, network errors and short rate-limit waits. */
  private async request<T>(method: string, pathOrUrl: string, body?: unknown): Promise<{ data: T; headers: Headers }> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${this.apiUrl}${pathOrUrl}`;
    const where = `${method} ${new URL(url).pathname}`;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchFn(url, {
          method,
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${this.token}`,
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "mcp-agent",
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (err) {
        if (attempt < this.maxRetries) {
          await this.sleep(500 * 2 ** attempt);
          continue;
        }
        throw new GitHubError(`Could not reach GitHub for ${where}: ${err instanceof Error ? err.message : String(err)}`, 0);
      }

      if (res.ok) {
        const data = (res.status === 204 ? undefined : await res.json()) as T;
        return { data, headers: res.headers };
      }

      const waitMs = rateLimitWaitMs(res);
      if (waitMs !== null) {
        if (waitMs <= this.maxRateLimitWaitMs && attempt < this.maxRetries) {
          await this.sleep(waitMs);
          continue;
        }
        throw new GitHubError(
          `GitHub rate limit exceeded on ${where}. It resets in about ${Math.ceil(waitMs / 1000)} seconds. Wait, or make fewer calls.`,
          res.status,
        );
      }
      if (res.status >= 500 && attempt < this.maxRetries) {
        await this.sleep(500 * 2 ** attempt);
        continue;
      }
      throw new GitHubError(`GitHub API error ${res.status} on ${where}: ${await errorDetail(res)}`, res.status);
    }
  }
}

/** The next page's URL from a `Link` header, or null on the last page. */
export function nextLink(link: string | null): string | null {
  if (!link) return null;
  const m = /<([^>]+)>;\s*rel="next"/.exec(link);
  return m ? m[1]! : null;
}

/** How long until a rate limit resets, or null when the response is not a rate limit. */
export function rateLimitWaitMs(res: Response, now = Date.now()): number | null {
  if (res.status !== 403 && res.status !== 429) return null;
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000;
  if (res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    return Number.isFinite(reset) && reset > 0 ? Math.max(0, reset * 1000 - now) : 60_000;
  }
  return res.status === 429 ? 60_000 : null;
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; errors?: ({ message?: string } | string)[] };
    const extra = (body.errors ?? []).map((e) => (typeof e === "string" ? e : e.message)).filter(Boolean);
    return [body.message ?? res.statusText, ...extra].join("; ");
  } catch {
    return res.statusText || "no details";
  }
}

function login(user: GhUser | null): string {
  return user?.login ?? "ghost";
}

function labelNames(labels: (GhLabel | string)[]): string[] {
  return labels.map((l) => (typeof l === "string" ? l : l.name));
}

function pullSummary(p: GhPull): PullRequestSummary {
  return {
    number: p.number,
    title: p.title,
    state: p.merged_at ? "merged" : p.state,
    author: login(p.user),
    head: p.head.ref,
    base: p.base.ref,
    createdAt: p.created_at,
  };
}

function reviewEvent(state: string): ReviewEvent {
  if (state === "APPROVED") return "APPROVE";
  if (state === "CHANGES_REQUESTED") return "REQUEST_CHANGES";
  return "COMMENT";
}
