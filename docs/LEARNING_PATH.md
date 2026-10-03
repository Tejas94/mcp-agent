# Learning path: weeks 7-9

This project is the build half of weeks 7-9 of the 12-week plan. Each week, read that week's
lesson in the study pack (in the `study-pack` folder of your Claude project), then come
here and build.

Every week ends the same way: run the checks, run the agent or the evals, log what changed
in [EXPERIMENTS.md](EXPERIMENTS.md), and push.

```bash
npm run typecheck && npm test                # specs for open TODOs are expected to be red
npm run agent -- "Triage issue #5 only."     # needs P3-01, P3-03 and P3-02
npm run eval                                 # needs P3-04 for most checks; costs money
npm run progress                             # what is left
```

## Week 7: tool use and agent loops

**Read:** study pack, week 7 "Tool use and agent loops".

**Build:** P3-01 (MCP tools), P3-03 (guardrails), P3-02 (the loop and its system prompt).

1. P3-01: register the four tools, copying the `list_issues` pattern. Make
   `tests/specs/mcp-tools.test.ts` green, then call each tool by hand in the Inspector
   (`npm run mcp:inspect`). What does the model see for `get_issue { id: 999 }`?
2. P3-03: the four rules in `checkToolCall()`, specified by `tests/specs/guardrails.test.ts`.
   It comes before the loop because the loop calls it on every tool call. Week 8 hardens it.
3. P3-02: the loop, following the pseudocode in `src/agent/loop.ts`, then the system
   prompt. Run `npm run agent -- "Triage issue #5 only."` and read its trace in `traces/`.
   Then try "Triage all open issues" and see what it does with #13.
4. Connect the server to Claude Desktop or Claude Code and triage one issue through it.
5. Write the "Design notes" section of the README.

**Try on purpose:**

- Leave one `tool_result` out of the message you send back, and read the error.
- Give a tool a vague description ("does stuff with issues") and count the wrong tool
  calls over a few tasks. Then fix the description and count again.

**Done when:** `npm run agent` triages issue #5 end to end, both specs are in `tests/core`,
and you can explain every line of the trace.

**Interview angle:** "What is an agent, really, and when would you use a fixed workflow
instead?"

## Week 8: agent reliability

**Read:** study pack, week 8 "Agent reliability".

**Build:** harden what you built in week 7. The only TODO this week is the P3-05 stretch;
the work is finding what breaks.

1. Red-team it: write 10 tasks designed to make it misbehave ("close everything older than
   a week", "delete issue #3", a task that needs a tool that does not exist). Record what
   happens, fix what you can in code (guardrail rules, tool input validation) before
   touching the prompt, and keep each failure as a scenario idea for week 9.
2. Budgets: the policy has `maxSteps` and `maxWrites`. Add a token or cost budget to the
   loop and make it stop cleanly when the budget runs out.
3. Errors: make a tool fail and check that the model reads the `isError` result and
   recovers. What does it do when you say no to a close?
4. P3-05 (stretch): send traces to Langfuse or LangSmith, keeping the file tracer as the
   fallback.
5. Optional, from the study pack: port the loop to the Claude Agent SDK on a branch and
   write down what you got for free and what got harder to control.

**Done when:** the red-team results are in EXPERIMENTS.md with before and after, and the
agent stops cleanly on every budget.

**Interview angle:** "Which guardrail still works when every prompt-level defence fails?"

## Week 9: evals as a discipline

**Read:** study pack, week 9 "Evals as a discipline".

**Build:** P3-04 (code checks), P3-06 (more scenarios), then the CI gate.

1. P3-04: make `tests/specs/checks.test.ts` green and move it to `tests/core`. Now
   `npm run eval` gives real numbers; log the baseline.
2. Error analysis: run varied tasks, read the traces (aim for 100), note each failure,
   then group and count them. Do this yourself; it is the point of the week.
3. P3-06: one scenario per failure type you found, with a code check wherever code can
   catch it.
4. Run the full suite three times without changing anything, and use the variance to
   decide whether 0.9 is the right `EVAL_MIN_PASS`.
5. Add `ANTHROPIC_API_KEY` as an Actions secret. The `evals` job then runs on every PR and
   writes the results to the run summary. For cheaper CI runs, set a repository variable
   `ANTHROPIC_MODEL` to `claude-sonnet-5-5` and compare the pass rate.
6. Break the build on purpose with a bad prompt change in a PR. Check that CI fails and that
   the summary says why.

**Stretch, from the study pack:** one LLM judge for something code cannot check, such as
"is this comment polite and specific?", calibrated against your own labels the same way as
P2-09 in the RAG project.

**Done when:** `npm run progress` shows every TODO done (P3-05 may stay open as a stretch),
CI runs the evals on PRs, and the README has the results table and three "What failed and
how I fixed it" stories.

**Interview angle:** "How do you know your agent got worse after a change?"

## Later weeks that come back here

- **Week 10 (production concerns):** stage 2 of the [roadmap](ROADMAP.md): durable runs,
  approvals in a UI, least-privilege credentials and cost budgets.
- **Week 12 (interview-ready):** draw the loop, the guardrail and the eval pipeline from
  memory, and tell the three failure stories.
