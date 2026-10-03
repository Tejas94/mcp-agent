import path from "node:path";
import { fileURLToPath } from "node:url";

/** The project root, worked out from this file so the MCP server works from any cwd. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The committed sandbox: repo/ (tiny-shop), github.json (issues and PRs) and a fake .env. */
export const FIXTURE_DIR = path.join(ROOT, "fixtures", "sandbox");

/** Where fixture writes go unless FIXTURE_STATE says otherwise. Gitignored. */
export const DEFAULT_STATE_FILE = path.join(ROOT, "data", "state.json");
