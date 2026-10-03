# Roadmap: from learning project to production

The project grows in three stages. Stage 1 is the weeks 7-9 build. Stage 2 is week 10 of
the plan. Stage 3 is for after week 12, when you want it to be a product rather than a
portfolio piece. Pick from stage 3; you do not need all of it.

## Stage 1: a tested agent (weeks 7-9)

- [ ] P3-01 to P3-04 and P3-06 done (`npm run progress`); P3-05 if you take the stretch
- [ ] Red-team results and the error analysis tally in `docs/EXPERIMENTS.md`
- [ ] CI runs the evals on every PR, with the `ANTHROPIC_API_KEY` secret set
- [ ] README with design notes, the results table, three "What failed" stories and a demo video

## Stage 2: production-ready (week 10)

| Item | Why it matters |
| --- | --- |
| Least-privilege credentials once the tracker is real: a token that cannot delete or administer | The guardrail that still works when every prompt-level defence fails |
| Durable runs: store runs, steps and pending approvals in Postgres, and resume after a restart | An approval can take hours; the run has to survive that |
| Approvals in a web UI instead of the terminal (a Next.js page, reuse Project 1) | People approve where they already work |
| Token and cost budget per run, logged with the trace | A looping agent is a billing incident |
| Cap tool output size: truncate long bodies and comment threads | Context size, cost, and less room for injected text |
| Run the CI evals only on PRs that touch prompts, tools, policy or the model | CI evals cost money; spend it where regressions happen |
| A real GitHub sandbox repo behind the same MCP tools | Proves the tool design holds up against a real API |

## Stage 3: scale (after week 12)

| Item | What you learn |
| --- | --- |
| Triage each new issue as it arrives, from a GitHub webhook through a queue | Event-driven agents, retries, idempotency |
| One agent for many repos, with a policy file per repo | Configuration as code; limiting the blast radius per tenant |
| A remote MCP server over Streamable HTTP with OAuth | MCP across a network, and auth for tools |
| A duplicate finder using embeddings (reuse Project 2's retrieval) as a tool or subagent | Combining RAG and agents |
| Online evals: sample production runs, judge them, alert when quality drops | Evals after launch, not only before |
| The same agent on a framework (Claude Agent SDK, Mastra or LangGraph), compared on pass rate, steps and cost | Build vs. buy, with numbers |
| Prompt caching for the system prompt and tool definitions | Cost and latency at volume |

## Before you share the repo

- [ ] No secrets in the history (`git log -p | grep -i "sk-ant"` returns nothing)
- [ ] `npm run progress` shows every TODO done (or only the P3-05 stretch); `tests/specs` is empty
- [ ] README: diagram matches the code, design notes, results table, failure stories, demo video
- [ ] Decide whether `docs/LEARNING_PATH.md` and the tutor-mode `CLAUDE.md` stay public
- [ ] Pin the repo on your GitHub profile
