import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";

/**
 * A tiny issue tracker stored in a JSON file, so the agent can take real actions
 * without touching GitHub. Swap it for the GitHub API in week 9 if you like; the
 * MCP server is the only thing that talks to it.
 */
export interface Comment {
  author: string;
  body: string;
  at: string;
}

export interface Issue {
  id: number;
  title: string;
  body: string;
  author: string;
  state: "open" | "closed";
  labels: string[];
  comments: Comment[];
  createdAt: string;
  closedReason?: string;
}

export const ALLOWED_LABELS = [
  "bug",
  "feature",
  "question",
  "docs",
  "billing",
  "duplicate",
  "needs-info",
  "priority:high",
  "priority:low",
] as const;

export const SEED_FILE = "data/issues.seed.json";

export class IssueStore {
  constructor(readonly file = process.env.TRACKER_FILE ?? "data/issues.json") {
    if (!existsSync(file)) copyFileSync(SEED_FILE, file);
  }

  all(): Issue[] {
    return JSON.parse(readFileSync(this.file, "utf8")) as Issue[];
  }

  private save(issues: Issue[]) {
    writeFileSync(this.file, JSON.stringify(issues, null, 2));
  }

  private update(id: number, fn: (issue: Issue) => void): Issue {
    const issues = this.all();
    const issue = issues.find((i) => i.id === id);
    if (!issue) throw new Error(`Issue #${id} does not exist`);
    fn(issue);
    this.save(issues);
    return issue;
  }

  list(filter: { state?: "open" | "closed" | "all"; label?: string } = {}): Issue[] {
    const state = filter.state ?? "open";
    return this.all().filter(
      (i) => (state === "all" || i.state === state) && (!filter.label || i.labels.includes(filter.label)),
    );
  }

  get(id: number): Issue {
    const issue = this.all().find((i) => i.id === id);
    if (!issue) throw new Error(`Issue #${id} does not exist`);
    return issue;
  }

  addLabels(id: number, labels: string[]): Issue {
    const bad = labels.filter((l) => !(ALLOWED_LABELS as readonly string[]).includes(l));
    if (bad.length) throw new Error(`Unknown label(s): ${bad.join(", ")}. Allowed: ${ALLOWED_LABELS.join(", ")}`);
    return this.update(id, (i) => {
      i.labels = [...new Set([...i.labels, ...labels])];
    });
  }

  comment(id: number, body: string, author = "triage-bot"): Issue {
    return this.update(id, (i) => {
      i.comments.push({ author, body, at: new Date().toISOString() });
    });
  }

  close(id: number, reason: string): Issue {
    return this.update(id, (i) => {
      if (i.state === "closed") throw new Error(`Issue #${id} is already closed`);
      i.state = "closed";
      i.closedReason = reason;
    });
  }

  reset(): void {
    copyFileSync(SEED_FILE, this.file);
  }
}
