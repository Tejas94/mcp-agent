/**
 * The GitHub domain as the agent sees it, and the GitHubBackend interface that both
 * backends implement: FixtureBackend (the tiny-shop sandbox in fixtures/) and
 * LiveBackend (the real GitHub REST API). The MCP server is the only code that calls a
 * backend.
 */

/** The only labels the agent may add. The MCP tool enforces this with z.enum. */
export const ALLOWED_LABELS = [
  "bug",
  "feature",
  "question",
  "docs",
  "security",
  "duplicate",
  "needs-info",
  "good-first-issue",
  "priority:high",
  "priority:low",
] as const;
export type Label = (typeof ALLOWED_LABELS)[number];

export const REVIEW_EVENTS = ["COMMENT", "REQUEST_CHANGES", "APPROVE"] as const;
export type ReviewEvent = (typeof REVIEW_EVENTS)[number];

export const CLOSE_REASONS = ["completed", "not_planned", "duplicate"] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

export type IssueState = "open" | "closed";
export type StateFilter = "open" | "closed" | "all";

export interface Comment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

export interface IssueSummary {
  number: number;
  title: string;
  state: IssueState;
  author: string;
  labels: string[];
  commentCount: number;
  createdAt: string;
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: IssueState;
  stateReason?: CloseReason | null;
  author: string;
  labels: string[];
  comments: Comment[];
  createdAt: string;
}

export interface CodeHit {
  path: string;
  line: number;
  snippet: string;
}

export interface FileSlice {
  path: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  /** The requested lines, each prefixed with its line number: "12: const x = 1;" */
  text: string;
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  /** Unified diff hunks for this file, as GitHub returns them (no ---/+++ header). */
  patch: string;
}

export interface ReviewComment {
  path: string;
  /** A line number in the new version of the file (the right side of the diff). */
  line: number;
  body: string;
}

export interface Review {
  id: number;
  author: string;
  event: ReviewEvent;
  body: string;
  comments: ReviewComment[];
  submittedAt: string;
}

export interface PullRequestSummary {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  author: string;
  head: string;
  base: string;
  createdAt: string;
}

export interface PullRequest extends PullRequestSummary {
  body: string;
  labels: string[];
  files: ChangedFile[];
  comments: Comment[];
  reviews: Review[];
}

export interface ReviewInput {
  event: ReviewEvent;
  body: string;
  comments?: ReviewComment[];
}

export interface GitHubBackend {
  /** "fixture" or "live", plus which repo and state file, for logs and the CLI. */
  describe(): string;

  listIssues(filter?: { state?: StateFilter; label?: string }): Promise<IssueSummary[]>;
  getIssue(number: number): Promise<Issue>;
  searchCode(query: string): Promise<CodeHit[]>;
  readFile(path: string, range?: { startLine?: number; endLine?: number }): Promise<FileSlice>;
  listPullRequests(filter?: { state?: StateFilter }): Promise<PullRequestSummary[]>;
  getPullRequest(number: number): Promise<PullRequest>;

  /** Issues and pull requests share one number space, as on GitHub. */
  addLabels(number: number, labels: string[]): Promise<{ number: number; labels: string[] }>;
  addComment(number: number, body: string): Promise<Comment>;
  submitReview(pullNumber: number, review: ReviewInput): Promise<Review>;
  closeIssue(number: number, reason: CloseReason): Promise<{ number: number; state: "closed"; stateReason: CloseReason }>;
}

/** What fixtures/sandbox/github.json and the working state file hold. */
export interface SandboxState {
  repo: string;
  defaultBranch: string;
  issues: Issue[];
  pullRequests: PullRequest[];
}

/** An error from GitHub (or the fixture pretending to be GitHub), with its HTTP status. */
export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

/** The repository's files, as paths relative to its root. Rejects anything that escapes it. */
export function normalizeRepoPath(path: string): string {
  const trimmed = path.trim().replace(/^\.\/+/, "");
  const parts = trimmed.split("/").filter((p) => p !== "" && p !== ".");
  if (trimmed.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(trimmed) || parts.includes("..") || trimmed.includes("\\")) {
    throw new GitHubError(
      `Path "${path}" is outside the repository. Use a path relative to the repository root, such as src/cart/totals.ts.`,
      400,
    );
  }
  if (parts.length === 0) throw new GitHubError("Path is empty. Use search_code to find a file first.", 400);
  return parts.join("/");
}

/** "12: const x = 1;" for each line from startLine. */
export function numberLines(lines: string[], startLine: number): string {
  return lines.map((line, i) => `${startLine + i}: ${line}`).join("\n");
}

/** The most lines readFile returns when no endLine is given. */
export const MAX_LINES_PER_READ = 200;

/** Works out the line range readFile returns, or throws a message the model can act on. */
export function resolveRange(
  path: string,
  totalLines: number,
  range: { startLine?: number; endLine?: number } = {},
): { startLine: number; endLine: number } {
  const startLine = range.startLine ?? 1;
  if (!Number.isInteger(startLine) || startLine < 1) {
    throw new GitHubError(`start_line must be a whole number from 1; got ${range.startLine}.`, 400);
  }
  if (startLine > Math.max(totalLines, 1)) {
    throw new GitHubError(`start_line ${startLine} is past the end of ${path}, which has ${totalLines} lines.`, 400);
  }
  const wanted = range.endLine ?? startLine + MAX_LINES_PER_READ - 1;
  if (!Number.isInteger(wanted) || wanted < startLine) {
    throw new GitHubError(`end_line must be a whole number no smaller than start_line (${startLine}).`, 400);
  }
  return { startLine, endLine: Math.min(wanted, totalLines) };
}
