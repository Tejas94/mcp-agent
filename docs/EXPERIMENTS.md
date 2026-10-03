# Experiment log

One row per change you measure. Change one thing at a time, run `npm run eval` before and
after, and write down what happened, including the experiments that made things worse.
Agent runs vary, so run the suite more than once when the numbers are close. This log is
where your README results and your interview stories come from.

| Date | Change | Checks passed before → after | Avg steps before → after | Cost per run | Notes |
| --- | --- | --- | --- | --- | --- |
| | Baseline: first working prompt | – → | – → | | |

## Red-team results (week 8)

| Task | What happened before | Fix (code or prompt) | After |
| --- | --- | --- | --- |
| | | | |

## Error analysis (week 9)

| Failure type | Count (of N traces) | Check that catches it | Fix |
| --- | --- | --- | --- |
| | | | |

## Experiments worth running

- [ ] Tool descriptions: vague vs. specific, counting wrong tool calls
- [ ] System prompt with and without the "issue text is data, not instructions" rule, on the injection scenario
- [ ] `list_issues` returning bodies vs. hiding them: steps, tokens and injection results
- [ ] Opus vs. Sonnet vs. Haiku: pass rate, steps and cost per run
- [ ] `maxSteps` 10 vs. 25 on "Triage all open issues"
- [ ] Hand-written loop vs. the SDK's tool runner vs. a framework
