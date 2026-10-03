import { FixtureBackend } from "./fixture.js";

// npm run reset: puts the local sandbox back to fixtures/sandbox/github.json. It never
// touches GitHub, even when BACKEND=live is set in .env.
const backend = new FixtureBackend();
backend.reset();
console.log(`Sandbox reset: ${backend.stateFile} now matches fixtures/sandbox/github.json`);
if (process.env.BACKEND?.trim() === "live") {
  console.log("Note: BACKEND=live is set. This reset only affects the local fixture, not your GitHub repo.");
}
