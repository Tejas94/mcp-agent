# Live mode: the agent on a real GitHub repository

The fixture sandbox is where you build, test and run evals. Live mode points the same MCP
server at a real repository through the GitHub REST API, so you can show the agent working
on GitHub itself. Do it in week 8, once the agent behaves well on the fixture.

Use a sandbox repository you own, never a real project. The agent can comment, review and
close issues there, and other people get notified.

## 1. Create and seed the sandbox repo

You need the [GitHub CLI](https://cli.github.com) logged in as you (`gh auth status`).

```bash
# From this project: write tiny-shop's code, issues, PR bodies and patches, plus a seed script.
npm run sandbox:export -- ../agent-sandbox-export

# Create the sandbox repo with a first commit, and clone it next to this project.
cd ..
gh repo create Tejas94/agent-sandbox --private --add-readme --clone
cd agent-sandbox

# Labels, the code, 12 issues and 3 pull requests.
../agent-sandbox-export/seed.sh
```

The script prints a mapping such as `fixture #1 -> https://github.com/Tejas94/agent-sandbox/issues/1`.
GitHub numbers issues and pull requests in one sequence, so the fixture's PR #20, #21 and
#22 become #13, #14 and #15 in a fresh repo. Use the GitHub numbers in your tasks.

What the seed does not recreate: comments from other people on the issues (they would all
come from your account) and the closed state's history. Issue #11 is closed as completed.

## 2. Create a token with the least access that works

Create a fine-grained personal access token (GitHub, Settings, Developer settings,
Personal access tokens, Fine-grained tokens):

- Repository access: **Only select repositories**, and pick `agent-sandbox`.
- Repository permissions:
  - **Issues:** Read and write (labels, comments, closing).
  - **Pull requests:** Read and write (reviews).
  - **Contents:** Read-only (read_file and search_code).
  - Metadata: Read-only (GitHub adds it automatically).
- Expiration: 30 days or less.

Nothing else. The token cannot push code, merge, change settings or touch another repo, so
even an agent that went wrong could only label, comment, review and close in the sandbox.
Write down why in your README; it is a good interview answer.

## 3. Run it

```bash
# .env
GITHUB_TOKEN=github_pat_...
GITHUB_REPO=Tejas94/agent-sandbox
```

```bash
npm run agent -- --live "Triage issue #1."
npm run agent -- --live "Review pull request #13."
```

A `GITHUB_TOKEN` already exported in your shell wins over the one in `.env` (Node does
not override variables that are already set). If `gh` or another tool exported a broader
token, run `unset GITHUB_TOKEN` first, or the agent runs with that token instead.

`--live` sets `BACKEND=live` for that run. You can also set `BACKEND=live` in `.env`, but
then every run goes to GitHub; the evals always use the fixture. `npm run mcp:inspect`
uses `.env` too, so the Inspector shows the live repo when `BACKEND=live` is set there.

## Things that behave differently on real GitHub

- **You cannot request changes on your own pull request.** The seed opens the PRs from your
  account, and the token is yours, so `submit_review` with `REQUEST_CHANGES` fails with a
  422. The agent sees the error and can fall back to a `COMMENT` review. To see a real
  REQUEST_CHANGES, open the PRs from a second account (or a friend's), or use a token from
  a second account that you add as a collaborator.
- **Code search lags and is rate limited.** A new repo can take a few minutes before
  `search_code` finds anything, and code search allows about 10 requests a minute. The
  backend fails fast with a clear message instead of waiting a long time. `read_file`
  works right away.
- **Rate limits and outages are real.** The live backend retries 5xx responses twice with
  a short backoff, waits for a rate limit only if it resets within 10 seconds, and
  otherwise returns an error the agent can read. Compare what the agent does with what it
  does under `FAIL_TOOLS` on the fixture.
- **Lists are paginated.** The backend follows GitHub's `Link` header for up to 10 pages.
- **Closing as a duplicate** sets `state_reason: "duplicate"`. GitHub does not link the
  original issue for you through the API, so have the agent name it in a comment first.
- **Pull requests show up in the issues API.** GitHub returns PRs from its issues
  endpoints too. The backend filters them out of `list_issues`, and `get_issue` on a PR
  number tells the agent to use `get_pull_request`.

## Clean up

Delete the token when you are done with it, and archive or delete the sandbox repo. To run
it again from scratch, delete the repo and repeat step 1.
