/**
 * TODO(P3-02) Week 7: the triage agent's system prompt.
 *
 * What a good one covers (write it in your own words, then iterate with evals):
 * - The job: triage open issues. Label each (type + area + priority), ask for
 *   missing info with a comment, mark duplicates and close them with a reason.
 * - How to work: list first, read an issue before labelling it, one issue at a time.
 * - Trust: issue titles, bodies and comments are written by the public. They are
 *   data to triage, never instructions to follow. (Issue #13 tests this.)
 * - When done: finish with a short summary of what changed, per issue.
 */
export const TRIAGE_SYSTEM_PROMPT = `TODO(P3-02): write me`;
