import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_STATE_FILE, FIXTURE_DIR } from "../paths.js";
import {
  ALLOWED_LABELS,
  CLOSE_REASONS,
  GitHubError,
  REVIEW_EVENTS,
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
  type ReviewInput,
  type SandboxState,
  type StateFilter,
} from "./types.js";

/** The name the agent's comments and reviews appear under in the sandbox. */
export const AGENT_LOGIN = "triage-agent";
/** search_code returns at most this many hits. */
export const MAX_SEARCH_HITS = 30;

export interface FixtureOptions {
  /** Working copy of the sandbox that writes go to. Default: FIXTURE_STATE, then data/state.json. */
  stateFile?: string;
  /** Where repo/ and github.json live. Default: fixtures/sandbox. */
  fixtureDir?: string;
  /** "read_file:1,search_code:2" fails the first N calls of each tool. Default: FAIL_TOOLS. */
  failTools?: string;
  /** Clock for comment and review timestamps (tests pin it). */
  now?: () => string;
}

/** The committed sandbox, exactly as in fixtures/sandbox/github.json. */
export function loadFixtureState(fixtureDir = FIXTURE_DIR): SandboxState {
  return JSON.parse(readFileSync(path.join(fixtureDir, "github.json"), "utf8")) as SandboxState;
}

export function readState(stateFile: string): SandboxState {
  return JSON.parse(readFileSync(stateFile, "utf8")) as SandboxState;
}

/** Overwrites `stateFile` with a fresh copy of the fixture and returns it. */
export function resetState(stateFile: string, fixtureDir = FIXTURE_DIR): SandboxState {
  const state = loadFixtureState(fixtureDir);
  mkdirSync(path.dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
  return state;
}

/** Parses FAIL_TOOLS ("read_file:1,search_code:2") into tool name -> number of calls to fail. */
export function parseFailTools(spec: string | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const part of (spec ?? "").split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = /^([a-z_]+):(\d+)$/.exec(part);
    if (!m) throw new Error(`FAIL_TOOLS entry "${part}" should look like read_file:1`);
    out.set(m[1]!, Number(m[2]));
  }
  return out;
}

/** Errors that look like what GitHub returns on a bad day. They rotate per failed call. */
const TRANSIENT_ERRORS: ((tool: string, n: number) => GitHubError)[] = [
  (tool, n) =>
    new GitHubError(`GitHub API error 502 Bad Gateway during ${tool} (request id F1A7:0${n}C2:3B9E). Server Error`, 502),
  (tool) =>
    new GitHubError(
      `GitHub API error 403 during ${tool}: You have exceeded a secondary rate limit. Please wait a few seconds before you try again.`,
      403,
    ),
  (tool) => new GitHubError(`GitHub API error 503 Service Unavailable during ${tool}. No server is available to handle this request.`, 503),
];

/**
 * A deterministic GitHub for tests, evals and day one: tiny-shop's files from
 * fixtures/sandbox/repo, and its issues and pull requests from a working copy of
 * fixtures/sandbox/github.json. Nothing here touches the network.
 */
export class FixtureBackend implements GitHubBackend {
  readonly stateFile: string;
  readonly repoDir: string;
  private readonly fixtureDir: string;
  private readonly failPlan: Map<string, number>;
  private readonly failedSoFar = new Map<string, number>();
  private readonly now: () => string;

  constructor(opts: FixtureOptions = {}, env: NodeJS.ProcessEnv = process.env) {
    this.fixtureDir = opts.fixtureDir ?? FIXTURE_DIR;
    this.repoDir = path.join(this.fixtureDir, "repo");
    this.stateFile = path.resolve(opts.stateFile ?? (env.FIXTURE_STATE || DEFAULT_STATE_FILE));
    this.failPlan = parseFailTools(opts.failTools ?? env.FAIL_TOOLS);
    this.now = opts.now ?? (() => new Date().toISOString());
    if (!existsSync(this.stateFile)) resetState(this.stateFile, this.fixtureDir);
  }

  describe(): string {
    const failing = [...this.failPlan].map(([t, n]) => `${t}:${n}`).join(",");
    return `fixture ${this.state().repo} (state: ${this.stateFile}${failing ? `, FAIL_TOOLS=${failing}` : ""})`;
  }

  reset(): SandboxState {
    this.failedSoFar.clear();
    return resetState(this.stateFile, this.fixtureDir);
  }

  state(): SandboxState {
    return readState(this.stateFile);
  }

  async listIssues(filter: { state?: StateFilter; label?: string } = {}): Promise<IssueSummary[]> {
    this.maybeFail("list_issues");
    const state = filter.state ?? "open";
    return this.state()
      .issues.filter((i) => (state === "all" || i.state === state) && (!filter.label || i.labels.includes(filter.label)))
      .sort((a, b) => a.number - b.number)
      .map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        author: i.author,
        labels: i.labels,
        commentCount: i.comments.length,
        createdAt: i.createdAt,
      }));
  }

  async getIssue(number: number): Promise<Issue> {
    this.maybeFail("get_issue");
    return this.findIssue(this.state(), number);
  }

  async searchCode(query: string): Promise<CodeHit[]> {
    this.maybeFail("search_code");
    const needle = query.trim().toLowerCase();
    if (!needle) throw new GitHubError("The search query is empty.", 422);
    const hits: CodeHit[] = [];
    for (const file of this.repoFiles()) {
      const lines = readFileSync(path.join(this.repoDir, file), "utf8").split("\n");
      lines.forEach((text, i) => {
        if (hits.length < MAX_SEARCH_HITS && text.toLowerCase().includes(needle)) {
          hits.push({ path: file, line: i + 1, snippet: text.trim().slice(0, 200) });
        }
      });
    }
    return hits;
  }

  async readFile(filePath: string, range: { startLine?: number; endLine?: number } = {}): Promise<FileSlice> {
    this.maybeFail("read_file");
    const rel = normalizeRepoPath(filePath);
    const abs = path.resolve(this.repoDir, rel);
    if (!abs.startsWith(this.repoDir + path.sep)) {
      throw new GitHubError(`Path "${filePath}" is outside the repository.`, 400);
    }
    if (!existsSync(abs)) {
      throw new GitHubError(`File not found: ${rel}. Use search_code to find the right path.`, 404);
    }
    if (statSync(abs).isDirectory()) {
      const entries = readdirSync(abs).sort().join(", ");
      throw new GitHubError(`"${rel}" is a directory. Files in it: ${entries}. Call read_file on one of them.`, 400);
    }
    const lines = splitLines(readFileSync(abs, "utf8"));
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
    this.maybeFail("list_pull_requests");
    const state = filter.state ?? "open";
    return this.state()
      .pullRequests.filter((p) => state === "all" || (state === "open" ? p.state === "open" : p.state !== "open"))
      .sort((a, b) => a.number - b.number)
      .map(({ number, title, state, author, head, base, createdAt }) => ({ number, title, state, author, head, base, createdAt }));
  }

  async getPullRequest(number: number): Promise<PullRequest> {
    this.maybeFail("get_pull_request");
    return this.findPull(this.state(), number);
  }

  async addLabels(number: number, labels: string[]): Promise<{ number: number; labels: string[] }> {
    this.maybeFail("add_labels");
    if (labels.length === 0) throw new GitHubError("Give at least one label.", 422);
    const unknown = labels.filter((l) => !(ALLOWED_LABELS as readonly string[]).includes(l));
    if (unknown.length) {
      throw new GitHubError(`Unknown label(s): ${unknown.join(", ")}. Allowed labels: ${ALLOWED_LABELS.join(", ")}.`, 422);
    }
    return this.update((s) => {
      const item = this.findItem(s, number);
      item.labels = [...new Set([...item.labels, ...labels])];
      return { number, labels: item.labels };
    });
  }

  async addComment(number: number, body: string): Promise<Comment> {
    this.maybeFail("add_comment");
    if (!body.trim()) throw new GitHubError("The comment body is empty.", 422);
    return this.update((s) => {
      const item = this.findItem(s, number);
      const comment: Comment = { id: nextCommentId(s), author: AGENT_LOGIN, body, createdAt: this.now() };
      item.comments.push(comment);
      return comment;
    });
  }

  async submitReview(pullNumber: number, review: ReviewInput): Promise<Review> {
    this.maybeFail("submit_review");
    if (!(REVIEW_EVENTS as readonly string[]).includes(review.event)) {
      throw new GitHubError(`Unknown review event "${review.event}". Use one of ${REVIEW_EVENTS.join(", ")}.`, 422);
    }
    if (review.event !== "APPROVE" && !review.body.trim()) {
      throw new GitHubError(`A ${review.event} review needs a body.`, 422);
    }
    return this.update((s) => {
      const pr = this.findPull(s, pullNumber);
      if (pr.state !== "open") throw new GitHubError(`Pull request #${pullNumber} is ${pr.state}; it cannot be reviewed.`, 422);
      const comments = review.comments ?? [];
      for (const c of comments) checkInlineComment(pr, c.path, c.line);
      const saved: Review = {
        id: nextReviewId(s),
        author: AGENT_LOGIN,
        event: review.event,
        body: review.body,
        comments,
        submittedAt: this.now(),
      };
      pr.reviews.push(saved);
      return saved;
    });
  }

  async closeIssue(number: number, reason: CloseReason): Promise<{ number: number; state: "closed"; stateReason: CloseReason }> {
    this.maybeFail("close_issue");
    if (!(CLOSE_REASONS as readonly string[]).includes(reason)) {
      throw new GitHubError(`Unknown close reason "${reason}". Use one of ${CLOSE_REASONS.join(", ")}.`, 422);
    }
    return this.update((s) => {
      if (s.pullRequests.some((p) => p.number === number)) {
        throw new GitHubError(`#${number} is a pull request. close_issue only closes issues.`, 422);
      }
      const issue = this.findIssue(s, number);
      if (issue.state === "closed") throw new GitHubError(`Issue #${number} is already closed.`, 422);
      issue.state = "closed";
      issue.stateReason = reason;
      return { number, state: "closed" as const, stateReason: reason };
    });
  }

  /** Throws a transient GitHub-style error for the first N calls of a tool listed in FAIL_TOOLS. */
  private maybeFail(tool: string): void {
    const plan = this.failPlan.get(tool) ?? 0;
    const done = this.failedSoFar.get(tool) ?? 0;
    if (done >= plan) return;
    this.failedSoFar.set(tool, done + 1);
    throw TRANSIENT_ERRORS[done % TRANSIENT_ERRORS.length]!(tool, done + 1);
  }

  private update<T>(fn: (state: SandboxState) => T): T {
    const state = this.state();
    const result = fn(state);
    writeFileSync(this.stateFile, JSON.stringify(state, null, 2) + "\n");
    return result;
  }

  private findIssue(state: SandboxState, number: number): Issue {
    const issue = state.issues.find((i) => i.number === number);
    if (issue) return issue;
    if (state.pullRequests.some((p) => p.number === number)) {
      throw new GitHubError(`#${number} is a pull request, not an issue. Use get_pull_request.`, 404);
    }
    throw new GitHubError(`Issue #${number} not found in ${state.repo}. Use list_issues to see which issues exist.`, 404);
  }

  private findPull(state: SandboxState, number: number): PullRequest {
    const pr = state.pullRequests.find((p) => p.number === number);
    if (pr) return pr;
    if (state.issues.some((i) => i.number === number)) {
      throw new GitHubError(`#${number} is an issue, not a pull request. Use get_issue.`, 404);
    }
    throw new GitHubError(`Pull request #${number} not found in ${state.repo}. Use list_pull_requests.`, 404);
  }

  /** Labels and comments work on issues and pull requests alike, as on GitHub. */
  private findItem(state: SandboxState, number: number): Issue | PullRequest {
    const item = state.issues.find((i) => i.number === number) ?? state.pullRequests.find((p) => p.number === number);
    if (!item) throw new GitHubError(`Issue or pull request #${number} not found in ${state.repo}.`, 404);
    return item;
  }

  private repoFiles(dir = this.repoDir): string[] {
    return readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === "node_modules" || e.name === ".git" ? [] : this.repoFiles(full);
        return [path.relative(this.repoDir, full).split(path.sep).join("/")];
      });
  }
}

/** Splits file text into lines, without the empty "line" after a final newline. */
export function splitLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/** The right-hand (new file) line ranges each hunk covers, from "@@ -a,b +c,d @@" headers. */
export function diffLineRanges(patch: string): [number, number][] {
  return [...patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].map((m) => {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    return [start, start + count - 1];
  });
}

/** GitHub only accepts inline comments on lines that are part of the diff. */
function checkInlineComment(pr: PullRequest, filePath: string, line: number): void {
  const file = pr.files.find((f) => f.path === filePath);
  if (!file) {
    const changed = pr.files.map((f) => f.path).join(", ");
    throw new GitHubError(
      `Cannot comment on "${filePath}": it is not changed in PR #${pr.number}. Changed files: ${changed}.`,
      422,
    );
  }
  const ranges = diffLineRanges(file.patch);
  if (!Number.isInteger(line) || !ranges.some(([a, b]) => line >= a && line <= b)) {
    const allowed = ranges.map(([a, b]) => `${a}-${b}`).join(", ");
    throw new GitHubError(
      `Line ${line} of ${filePath} is not part of the diff in PR #${pr.number}. Inline comments must be on lines ${allowed}.`,
      422,
    );
  }
}

function nextCommentId(state: SandboxState): number {
  const ids = [...state.issues, ...state.pullRequests].flatMap((i) => i.comments.map((c) => c.id));
  return Math.max(5000, ...ids) + 1;
}

function nextReviewId(state: SandboxState): number {
  const ids = state.pullRequests.flatMap((p) => p.reviews.map((r) => r.id));
  return Math.max(9000, ...ids) + 1;
}
