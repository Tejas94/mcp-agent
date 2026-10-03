import { FixtureBackend } from "./fixture.js";
import { LiveBackend } from "./live.js";
import type { GitHubBackend } from "./types.js";

export type BackendKind = "fixture" | "live";

export function backendKind(env: NodeJS.ProcessEnv = process.env): BackendKind {
  const kind = (env.BACKEND ?? "fixture").trim() || "fixture";
  if (kind !== "fixture" && kind !== "live") throw new Error(`BACKEND must be "fixture" or "live", got "${kind}".`);
  return kind;
}

/**
 * Picks the backend from the environment. BACKEND=fixture (the default) uses the tiny-shop
 * sandbox; BACKEND=live uses GITHUB_TOKEN and GITHUB_REPO against the real API.
 */
export function createBackend(env: NodeJS.ProcessEnv = process.env): GitHubBackend {
  if (backendKind(env) === "live") {
    return new LiveBackend({ token: env.GITHUB_TOKEN ?? "", repo: env.GITHUB_REPO ?? "" });
  }
  return new FixtureBackend({}, env);
}
