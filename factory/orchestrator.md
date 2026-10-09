# Orchestrator contract

This contract does not depend on any provider. The code-agent session that starts a run **is** the
orchestrator. It runs the loop below, launches every worker, waits for every
required result, and is the **only** writer of `factory/board.json`. It writes
the board only through `node factory/bin/factory.mjs`, which validates the JSON
after every write and appends one entry to `board.log` for each transition.

How the active runtime starts, resumes, waits on and messages workers is
described in [`runtime-adapter.md`](runtime-adapter.md). Files are the source of
truth. Runtime messages are only a convenience.

## The loop (one job per invocation)

```text
feature ─▶ brainstorm/grill (human) ─▶ planner ─▶ human plan approval
        ─▶ isolated worktree + builder ─▶ assigned reviewers (wait for ALL)
        ─▶ approver ─┬─ APPROVE  ─▶ commit + merge            (Low/Medium risk)
                     │            ─▶ merge-approval (human)   (High/Critical risk)
                     ├─ round 1 CHANGES ─▶ same builder fixes ─▶ round 2 reviews
                     └─ round 2 CHANGES / blocker / ESCALATE ─▶ needs-human
```

| # | Step | Who | Output (source of truth) | Board stage after |
|---|------|-----|--------------------------|-------------------|
| 1 | `factory run "<feature>"` creates the job | orchestrator | `jobs/<id>/job.json` | `brainstorm` |
| 2 | Grill the human about scope, constraints, acceptance criteria, complexity, risk and reviewer needs | orchestrator + human | `jobs/<id>/spec.md` | `planning` |
| 3 | Planner writes the plan from `docs/templates/plan-template.md` | planner | `docs/plans/<id>.md` | `plan-approval` |
| 4 | Human approves the plan. The orchestrator records `plan-approval: approved`, `plan-approved-by` and `plan-approved-at` in the plan front matter | human | plan front matter | `building` |
| 5 | `factory worktree <id>` creates an isolated worktree on branch `factory/<id>` | orchestrator | git worktree | `building` |
| 6 | Builder works test-first in the worktree | builder | `jobs/<id>/build.md` + code in worktree | `review` |
| 7 | Reviewers assigned by the plan each write one file | reviewers | `jobs/<id>/round-<n>/review-<role>.md` | `review` |
| 8 | `factory round <id>` confirms that every required review file exists and parses | orchestrator | n/a | `approval` or `building` (rework) |
| 9 | Approver decides and writes the report (plus a learning when warranted) | approver | `jobs/<id>/decision.md`, `docs/review/<id>-round-<n>.md`, `docs/learnings/…` | `merged`, `merge-approval`, `needs-human`, `failed` |
| 10 | `factory merge <id>` creates a Conventional Commit and merges it | orchestrator | git history | `merged` (or `committed` if there is no VCS) |

### Routing rules

- Round 1 has any `VERDICT: CHANGES`: the orchestrator sends the **complete**
  round feedback (every review file path) to the **same** builder if the runtime
  can resume one. Otherwise it starts a replacement builder that receives the
  prior builder's `build.md`. The choice is recorded in the `job.json` `events`
  array as `{"type":"continuity","mode":"resumed"|"replacement"}`. Round 2
  starts.
- Round 2 (or later) has any `VERDICT: CHANGES`: the approver still writes its
  report, and the stage becomes `needs-human`. At most **two** builder/review
  rounds are allowed.
- If every review passes, the approver writes `APPROVE`, or `ESCALATE` when it
  sees a blocker.
- `APPROVE` with Low or Medium risk: the orchestrator runs `factory merge`.
- `APPROVE` with High or Critical risk: the stage becomes `merge-approval`. A
  human runs `factory approve <id>` to merge.
- A blocker, or malformed or contradictory reviewer output (the review value is
  `error`): `factory round` routes the job to `approval` with `blocker` set. The
  approver **must** write its report and `ESCALATE`. `factory decide` then
  moves the job to `needs-human`, and the loop pauses for human input. If
  `decide` finds the report or `decision.md` missing or malformed, or finds
  `APPROVE` while some review is not `PASS`, it also routes to `needs-human`
  and records the reason as `blocker`. A setup error, such as a missing plan
  template, ends in `failed`.
- The dashboard is a Vite project in `factory/dashboard/`. It replaces the
  spec's single `factory/dashboard.html`, which the spec explicitly allows.
- The builder is never resumed while a review round is incomplete.
- A worker never overwrites another worker's output file.

## Commands

All commands are run as `node factory/bin/factory.mjs <command>`. `npm run
factory -- <command>` from the repository root does the same thing.

| Command | Purpose |
|---------|---------|
| `run "<feature>" [--dry-run]` | Allocate a job id, create `jobs/<id>/job.json` and a board card in stage `brainstorm` |
| `next` | Run the first unchecked `- [ ]` item in `backlog.md` (it calls `run` and checks the item off) |
| `approve <id>` | Human approval for a `merge-approval` or `needs-human` job: commit and merge |
| `rework <id> "<note>"` | Human sends a job back to the builder. The note is saved as `jobs/<id>/round-<n>/human-note.md` |
| `stage <id> <stage> [--note ...]` | Orchestrator-only board transition (validated) |
| `brief <id> <role>` | Print the exact worker prompt. Native and fallback runtimes both use this text |
| `worktree <id> [--base <branch>]` | Create the isolated worktree and feature branch |
| `round <id>` | Check whether the current round is complete and record its verdicts on the board |
| `merge <id>` | Create a Conventional Commit on the feature branch and merge it into the base branch |
| `verify [<id>]` | Check required files, board JSON, the learnings index, matrix-to-test mapping and the commit message |

## `board.json` schema (frozen, version 1)

```jsonc
{
  "version": 1,
  "updatedAt": "ISO-8601",
  "jobs": [
    {
      "id": "003-rate-limiting",            // NNN-kebab-slug
      "title": "Rate limiting for public API",
      "branch": "factory/003-rate-limiting",
      "stage": "review",                    // see stage enum
      "round": 2,                           // 0 before the first build
      "risk": "High",                       // Low | Medium | High | Critical | null
      "complexity": "HIGH",                 // TRIVIAL | LOW | MEDIUM | HIGH | VERY_HIGH | null
      "reviews": { "security": "CHANGES", "code": "PASS", "ux": "skipped", "performance": "pending" },
      "rounds": [ { "round": 1, "reviews": { "...": "PASS" } } ],   // history, oldest first
      "files": ["factory/jobs/003-rate-limiting/spec.md", "docs/plans/003-rate-limiting.md"],
      "blocker": "optional human-readable reason when stage is needs-human/failed",
      "runtime": "documented in factory/runtime-adapter.md",
      "dryRun": false,
      "updatedAt": "ISO-8601"
    }
  ],
  "log": [ { "at": "ISO-8601", "job": "003-rate-limiting", "from": "building", "to": "review", "note": "…" } ]
}
```

**Stage enum:** `brainstorm`, `planning`, `plan-approval`, `building`,
`review`, `approval`, `merge-approval`, `needs-human`, `merged`, `committed`,
`failed`.

**Review value enum:** `pending`, `PASS`, `CHANGES`, `skipped`, `error`.

**Reviewer role keys:** `security`, `ux`, `ui-design`, `code`,
`accessibility`, `data`, `infrastructure`, `performance`. Each key maps to
`agents/<key>-reviewer.md` and to the output file `review-<key>.md`.

`files` paths are relative to the repository root. The dashboard renders them
read-only.

## `job.json`

`job.json` has **write-once** core fields: `id`, `title`, `feature`,
`createdAt`, `branch`, `baseBranch`, `dryRun`, `worktreePath`, `runtime`. It
also has one **append-only** array, `events`. The spec calls `job.json`
"immutable" but also requires it to record the continuity choice and runtime
identity. These two rules reconcile the conflict: core fields never change, and
events (`grill`, `plan-approval`, `worker` with role and agent identity,
`continuity`, `round-complete`, `decision`, `merge`) are only ever added.
`node factory/bin/factory.mjs` writes these events for the orchestrator.

## Output contracts

- Review files start with exactly `VERDICT: PASS` or `VERDICT: CHANGES` on
  line 1.
- `decision.md` starts with exactly `APPROVE` or `ESCALATE` on line 1.
- The plan follows `docs/templates/plan-template.md` and keeps its sections in
  order. The template's matrix columns (`ID`, `Result`) are a superset of the
  spec's columns and are kept. The matrix has **exactly one row per acceptance
  criterion**. The builder may add extra tests, but they are not mapped.
- Reports use `docs/templates/review-template.md`. Learnings use
  `docs/templates/learnings-template.md`. Each learning is indexed in
  `docs/learnings/index.md` with one sentence of 100 words or fewer.
- Commits follow Conventional Commits 1.0.0, e.g. `feat(slugify): add slugify
  utility`.

## Dry run

`factory run "<synthetic feature>" --dry-run` marks the job `dryRun: true`.
`factory worktree` then:

1. branches a disposable base `factory/dry-run-base` from `HEAD`;
2. creates the worktree under `.factory-worktrees/<id>` on `factory/<id>`; and
3. `factory merge` merges into `factory/dry-run-base`. It never merges into
   `main` and never pushes.

The synthetic code exists only on those disposable branches. The job
documents (spec, plan, reviews, report, learning) stay in the main checkout as
evidence. `job.json` may contain `"dryRunOptions": {"forceChanges": {"round": 1,
"role": "code"}}`. The named reviewer must then return `VERDICT: CHANGES` in
round 1 with a concrete, verifiable change request, and confirm that change in
round 2. This exercises the rework path on purpose.
