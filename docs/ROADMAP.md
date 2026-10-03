# Roadmap: from learning project to production

The project grows in three stages. Stage 1 is the weeks 7-9 build. Stage 2 is week 10 of
the plan. Stage 3 is for after week 12, when you want it to be a product rather than a
portfolio piece. Pick from stage 3; you do not need all of it.

## Stage 1: a tested agent (weeks 7-9)

- [ ] Week 7: P3-01, P3-02 and P3-03 done; the MCP builder skill installed and used
- [ ] Week 7: the agent triages #1 and reviews PR #20 on the fixture; design notes in the README
- [ ] Week 8: P3-04 done and wired into the loop; red-team results in `docs/EXPERIMENTS.md`
- [ ] Week 8: `FAIL_TOOLS` drills, a cost budget per run, and one run in live mode
- [ ] Week 9: P3-05 and P3-06 done; the error analysis tally in `docs/EXPERIMENTS.md`
- [ ] Week 9: CI runs the evals on every PR, with the `ANTHROPIC_API_KEY` secret set
- [ ] README with the results table, three "What failed" stories and a demo video
- [ ] P3-07 if you take the stretch

## Stage 2: production-ready (week 10)

| Item | Why it matters |
| --- | --- |
| A GitHub App instead of a personal token: installed per repo, with only Issues, Pull requests and Contents read | Least privilege that an organisation can grant and revoke, and actions that show as the app, not as you |
| Webhooks into a queue: triage each new issue and PR as it arrives | The agent works when the work appears, not when you remember to run it |
| Durable runs: store runs, steps and pending approvals (Postgres), and resume after a restart | An approval can take hours; the run has to survive that |
| Approvals in a web UI, or as a `/approve` comment from a maintainer | People approve where they already work, and the approval is on record |
| Idempotency: never post the same comment or review twice, even after a retry or a restart | A retry that double-posts is the bug people notice first |
| Rate-limit handling across runs, and a token and cost budget per run and per day | A looping agent is a billing incident, and GitHub limits are shared |
| Prompt caching for the system prompt and tool definitions, with the cache hit rate logged | The stable prefix is resent on every step; caching cuts cost and latency |
| A 20-case injection set (issues, PR descriptions, code comments, diffs) in CI | Indirect injection is the main risk for an agent that reads other people's text |

## Stage 3: scale (after week 12)

| Item | What you learn |
| --- | --- |
| A policy file per repository: allowed labels, which tools need approval, budgets | Configuration as code, and a blast radius per tenant |
| A remote MCP server over Streamable HTTP with OAuth | MCP across a network, and auth for tools |
| Semantic code search using Project 2's retrieval, as a tool | Combining RAG and agents, and when grep is not enough |
| Running it in GitHub Actions on issue and PR events | Agents inside the developer workflow, with CI's permissions model |
| Online evals: sample real runs, judge them, alert when quality drops | Evals after launch, not only before |
| The same tasks with the Claude Agent SDK and Claude Code GitHub Actions, compared on pass rate, steps and cost | Build vs. buy, with numbers |
| Duplicate detection across hundreds of issues with embeddings | Scaling a task that does not fit in one context window |

## Before you share the repo

- [ ] No real secrets in the history: `git log -p | grep -iE "sk-ant-|ghp_|github_pat_"` shows only the fake examples in `tests/`, `evals/checks.ts` and the docs
- [ ] `npm run progress` shows every TODO done (or only the P3-07 stretch); `tests/specs` is empty
- [ ] README: diagram matches the code, design notes, results table, failure stories, demo video
- [ ] The live sandbox repo is public or linked with screenshots, and its token is revoked
- [ ] Decide whether `docs/LEARNING_PATH.md` and the tutor-mode `CLAUDE.md` stay public
- [ ] Pin the repo on your GitHub profile
