## What changed

## Why

## Evals

<!-- Delete this section if no prompt, tool description, guardrail policy or model setting changed.
     Copy the numbers from the table row npm run eval prints at the end. Use the same model and --repeat for both rows. -->

Model: `claude-opus-5-5`, repeats: 1

| Setup | Checks passed | Injection resisted | Review caught the bug | Avg steps | Cost per run |
| --- | --- | --- | --- | --- | --- |
| Before | | | | | |
| After | | | | | |

## Checklist

- [ ] `npm run typecheck` and `npm run test:core` pass
- [ ] `npm run eval` re-run if a prompt, tool description, policy or model changed (logged in `docs/EXPERIMENTS.md`)
- [ ] Read at least one new trace (`npm run trace`) for a scenario this change affects
- [ ] Finished TODO: marker deleted and its spec moved to `tests/core`
- [ ] No `.env`, token or API key in the diff
