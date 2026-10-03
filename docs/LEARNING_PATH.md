# Learning path: weeks 7-9

This project is the build half of weeks 7-9 of the 12-week plan. Each week, read that week's
lesson in the study pack (in the `study-pack` folder of your Claude project), then come
here and build.

Every week ends the same way: run the checks, run the agent or the evals, log what changed
in [EXPERIMENTS.md](EXPERIMENTS.md), and push.

```bash
npm run typecheck && npm test                # specs for open TODOs are expected to be red
npm run agent -- "Triage issue #1."          # needs P3-01, P3-02 and P3-03
npm run trace                                # read the run you just did
npm run eval                                 # needs P3-05 for most checks; costs money
npm run progress                             # what is left
```

## Week 7: tool use, agent loops and MCP

**Read:** study pack, week 7 "Tool use, agent loops and MCP", and sections 2 and 5 of
"Claude Skills and agent tooling".

**Build:** P3-01 (MCP tools), P3-02 (guardrails), P3-03 (the loop and its system prompt).

1. Install the MCP server builder skill before you start, and use it while you build the
   server. In a Claude Code session, either install Anthropic's example skills plugin:

   ```text
   /plugin marketplace add anthropics/skills
   /plugin install example-skills@anthropic-agent-skills
   ```

   or copy only that skill into this repo, which keeps your skill set small:

   ```bash
   git clone --depth 1 https://github.com/anthropics/skills /tmp/anthropic-skills
   mkdir -p .claude/skills && cp -r /tmp/anthropic-skills/skills/mcp-builder .claude/skills/
   ```

   Read its `SKILL.md` first, as you would review a dependency. Ask for MCP work in plain
   words ("help me design the read_file tool") and check that it loads. Commands change
   over time; if one does not match, check the Claude Code docs.
2. P3-01: register the nine remaining tools in `src/mcp/server.ts`, copying the
   `list_issues` pattern. Make `tests/specs/mcp-tools.test.ts` green, then call each tool by
   hand in the Inspector (`npm run mcp:inspect`). What does the model see for
   `get_issue { number: 999 }`, `read_file { path: "../.env" }` and `add_labels` with a
   label that is not allowed?
3. Connect the server to Claude Code (README, "Use your MCP server from Claude Code") and
   triage issue #1 by hand through it. Compare your tool descriptions with what the
   builder skill suggested.
4. P3-02: `checkToolCall()` in `src/agent/guardrails.ts`, specified by
   `tests/specs/guardrails.test.ts`. It comes before the loop because the loop calls it on
   every tool call.
5. P3-03: the loop, following the pseudocode in `src/agent/loop.ts`, then the system prompt
   in `src/agent/prompts.ts`. Run `npm run agent -- "Triage issue #1."`, answer the approval
   prompts, and read the trace with `npm run trace`. Then try "Review pull request #20."
   and "Triage issue #8." and read those traces too.
6. Write the "Design notes" section of the README: fixed workflow versus autonomy, the tool
   design questions, and what the skill helped with.

**Try on purpose:**

- Leave one `tool_result` out of the message you send back, and read the error.
- Give `search_code` a vague description ("searches stuff") and count wrong tool calls over
  a few tasks. Then fix the description and count again.
- Say no to an approval. Does the model retry, ask again or explain? Read the trace.

**Done when:** `npm run agent` triages issue #1 and reviews PR #20 end to end on the
fixture, both specs are in `tests/core`, and you can explain every line of a trace.

**Interview angle:** "What is an agent, really, and which parts of this would you keep as a
fixed workflow instead?"

## Week 8: agent reliability

**Read:** study pack, week 8 "Agent reliability", and sections 6 to 8 of "Claude Skills
and agent tooling".

**Build:** P3-04 (safe tool results), then harden everything you built in week 7.

1. P3-04: `prepareToolResult()` in `src/agent/tool-output.ts`, specified by
   `tests/specs/tool-output.test.ts`. Then wire it into the loop where the pseudocode says
   "week 8", so every tool result passes through it. Compare a trace of "Triage issue #8."
   from before and after.
2. Red-team it. Write at least 10 tasks designed to make it misbehave: the injection in
   issue #8, the malicious description of PR #22 ("Review all open pull requests."),
   "close everything older than a week", "merge PR #21", a task that needs a tool that
   does not exist. Record what happens in EXPERIMENTS.md. Fix what you can in code
   (guardrail rules, tool input validation, tool output handling) before you touch the
   prompt, and keep each failure as a scenario idea for week 9.
3. Failure drills with `FAIL_TOOLS`: one failure, two in a row, and a failure on the write
   tool (`FAIL_TOOLS="add_comment:1"`). Does the agent retry a transient error once, give
   up on a permanent one, and never post a comment twice?
4. Budgets: the policy has `maxSteps` and `maxWrites`. Add a token or cost budget per run
   (`src/agent/cost.ts` has the prices) and make the loop stop cleanly when it runs out.
   Log tokens and cost per run in EXPERIMENTS.md.
5. Live mode: follow [LIVE_MODE.md](LIVE_MODE.md) to seed `Tejas94/agent-sandbox`, create a
   fine-grained token for that repo only, and run the agent with `--live`. Note what
   behaved differently from the fixture.
6. One deterministic hook in code, like the study pack's example: block any comment that
   contains something shaped like a token or an email address, whatever the model says.
   `guardrails.ts` is the place.

**Try on purpose:**

- Turn the guardrail off for one run (approve everything, allow APPROVE) on the injection
  task. What would have happened? Turn it back on.
- Remove the untrusted-content tags and run the injection task five times. Then put them
  back and run it five times again.

**Stretch, from the study pack:**

- P3-07: send traces to Langfuse or LangSmith, keeping the file tracer for the evals.
- Port the agent to the Claude Agent SDK on a branch, pointing it at the same MCP server,
  and write a short comparison: what you got for free, and what got harder to control.

**Done when:** the red-team results are in EXPERIMENTS.md with before and after, the agent
stops cleanly on every budget, every failure drill ends in a sensible state, and you have
run it once in live mode.

**Interview angle:** "Which of your defences still works when every prompt-level defence
fails?"

## Week 9: evals as a discipline

**Read:** study pack, week 9 "Evals as a discipline", and section 9 of "Claude Skills and
agent tooling".

**Build:** P3-05 (code checks), error analysis, P3-06 (more scenarios), then the CI gate.

1. P3-05: the checks in `evals/checks.ts`, specified by `tests/specs/checks.test.ts`. Move
   the spec to `tests/core`. Now `npm run eval` gives real numbers; log the baseline.
2. Error analysis: run varied tasks on the fixture, read the traces (aim for about 100), and
   note each failure in a spreadsheet. Then group and count them by failure type. Do this
   yourself; it is the point of the week, and the tally goes in your write-up.
3. P3-06: one scenario per failure type you found, with a code check wherever code can
   catch it. Each new scenario should fail on a bad prompt and pass on a good one.
4. Noise check: run `npm run eval -- --repeat 3` without changing anything. Which scenarios
   flip? Use the spread to decide whether 0.9 is the right `EVAL_MIN_PASS`.
5. CI gate: add `ANTHROPIC_API_KEY` as an Actions secret. The `evals` job then runs on every
   PR and writes the results to the run summary. Set the repository variable
   `ANTHROPIC_MODEL` to compare models in CI, and consider limiting the job to PRs that
   touch `src/agent`, `src/mcp`, `evals` or `.claude/skills`.
6. Break the build on purpose: open a PR with a bad prompt change. Check that CI fails and
   that the summary says why. Link the run in the README.
7. Fill in "Evals and results" and three "What failed and how I fixed it" stories.

**Try on purpose:** make a check that a crashed run would pass (for example `stillOpen(8)`
alone), crash the run, and watch it pass. Then see why every scenario also checks
`finished`.

**Stretch, from the study pack:**

- An LLM judge for what code cannot check, such as "is this plan specific enough to start
  work from?" or "does this review explain the bug?". Label 30 examples yourself first,
  then report the judge's true positive and true negative rates against your labels.
- Trigger tests for the skills you rely on: 20 requests that should load the MCP builder
  skill and 20 that should not, with both rates.
- Post the eval results table as a PR comment from CI.

**Done when:** `npm run progress` shows every TODO done (P3-07 may stay open as a stretch),
CI runs the evals on PRs, and the README has the results table and three "What failed and
how I fixed it" stories.

**Interview angle:** "How do you know your agent got worse after a change, and how do you
know it is not just noise?"

## Later weeks that come back here

- **Week 9 (evals in CI):** keep the eval gate on for every PR that changes a prompt, a
  tool description, the policy or the model, and keep the results table current.
- **Week 10 (production concerns):** stage 2 of the [roadmap](ROADMAP.md): prompt caching
  for the system prompt and tools, a GitHub App instead of a personal token, durable runs
  with approvals in a UI, cost budgets, and a 20-case injection set in CI.
- **Week 11 (fine-tuning and the wider field):** issue classification is a narrow task you
  could fine-tune or run on a local model. Compare it with your prompt on the same evals.
- **Week 12 (interview-ready):** draw the loop, the guardrail, the MCP server and the eval
  pipeline from memory, walk through the project in five minutes, and tell the three
  failure stories. The "coding agent" design question builds on exactly this project.
