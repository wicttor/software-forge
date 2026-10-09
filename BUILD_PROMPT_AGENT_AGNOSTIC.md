Build a small, visual “software factory” in this repository using the code-agent
runtime available to you. Keep it small enough that a viewer can understand the
whole system in a few minutes. Inspect the repository first so the factory knows
its language, test command, build command, and local conventions.

The implementation must be portable across code-agent products. Do not assume a
particular vendor, model family, hidden configuration directory, slash command,
agent front matter format, or inter-agent messaging API. Where the active
runtime has native support for those capabilities, use it through a thin,
documented adapter. Where it does not, provide a simple CLI or manual fallback
with the same behavior.

## The orchestrator

The factory has one orchestrator. The code-agent session that starts a run is
the orchestrator: it executes the loop below, launches or delegates every
worker, waits for all required results, and is the only process allowed to write
`factory/board.json`.

Keep runtime-specific integration in `factory/runtime-adapter.md` and, if
needed, `factory/runtime/`. The adapter should document equivalents for:

- starting a worker with a role and job context;
- resuming the same worker for another review round;
- waiting for worker completion;
- sending a worker feedback from a later round; and
- running the factory commands described below.

Workers must communicate through files as the portable source of truth. Runtime
messages are only a convenience for dispatch and notification.

## The loop

```text
feature / human prompt
   |
   v
brainstorm / grill session
   |
   v
planner
   |
   v
human plan approval
   |
   v
isolated worktree + builder
   |
   +--> dynamically assigned reviews --> wait for every review --> approver
                                         |                         |
                         first CHANGES -+--> builder fixes        +--> commit + merge
                         second+ CHANGES ------------------------+--> needs-human
```

The factory runs exactly one job per loop. After approval and merge, the loop
ends and the next job requires a new loop invocation. The detailed data flow is:

```text
Feature → Brainstorm/Grill → Plan → Human Plan Approval → Building Loop
→ Worker Agent → Assigned Reviewers → Approver
→ Approved: Commit/Merge
→ First refactor: Fixes → Worker Agent
→ Second or later refactor: Needs Human → Human Input
```

The approver may escalate directly to human input at any time.

The roles are logical roles, not specific models or products. The runtime may
assign any suitable agent or model to a role. Record the selected runtime and
agent identity in the job metadata when available, but do not require either
one for the workflow to function.

## Target file system

```text
factory/
  orchestrator.md             # provider-neutral orchestration contract
  runtime-adapter.md          # integration instructions for the active runtime
  agents/                     # one provider-neutral role file per worker
    planner.md
    builder.md
    security-reviewer.md
    ux-reviewer.md
    ui-design-reviewer.md
    code-reviewer.md
    approver.md
  board.json                  # durable state; only the orchestrator writes it
  dashboard.html              # self-contained visual board; polls board.json
  backlog.md                  # queue of features for the next run
  jobs/
    003-rate-limiting/
      job.json                # immutable job metadata and runtime-neutral IDs
      spec.md
      build.md
      round-1/
        review-security.md
        review-ux.md
        review-ui-design.md
        review-code.md
      decision.md
docs/
  plans/                         # approved implementation plans
  review/                        # one approver report per completed loop
  learnings/                     # durable lessons and important decisions
    index.md                     # one index sentence per learning entry
  templates/
    plan-template.md             # approved plan template
    review-template.md
    learnings-template.md
```

If the active code-agent runtime requires its own registration files, generate
them as an optional adapter layer. The portable role definitions and job files
must remain usable without that runtime-specific layer.

## Portable worker contract

Each worker role file must specify:

- the role and its objective;
- the files it must read;
- the files it may write;
- the expected output format;
- the acceptance criteria it must check; and
- how it reports a failure or missing information.

Workers get context from repository files and the job folder, not from hidden
conversation history. A worker writes only its assigned output file and any
explicitly authorized implementation files. The builder works on the job's
feature branch (or the closest equivalent supported by the repository) and
tests against the specification's acceptance criteria.

## Planning and test-driven development

The planner is the first worker after a feature enters the factory. The
orchestrator must first conduct a brainstorm/grill session with the human to
clarify the feature, constraints, acceptance criteria, complexity, risk, and
reviewer needs. It must record the result in the job context.

The planner must
create the implementation plan at the repository root under
`docs/plans/<job-id>.md`. The plan must follow the project-provided
`plan-template.md` exactly. Before the first run, copy that template into
`docs/templates/plan-template.md` or document its canonical repository path.
If the template is unavailable, stop the job with a clear setup error instead
of inventing a replacement format.

The planner must turn every acceptance criterion into at least one explicit
test, with exactly one test mapped to each criterion. The plan must include an
acceptance-criterion-to-test matrix containing:

| Acceptance criterion | Test file or test name | Test level | Expected initial state |
|---|---|---|---|
| ... | ... | unit/integration/system | failing or not yet implemented |

The plan must also include a reviewer-assignment section. Reviewer assignment
is based on a combination of task type, affected files, complexity, and risk.
Available logical reviewer roles are security, UX, UI design, code,
accessibility, data, infrastructure, and performance. UX and UI design may be
skipped when the task has no meaningful user interface; skipped roles must be
recorded as not applicable in the plan and review report.

Complexity and risk must affect both the number and depth of tests and the
reviewer set. Higher complexity requires broader test coverage (including
additional unit, integration, or system coverage where appropriate), while the
one-criterion/one-test mapping remains mandatory.

Test-driven development is a factory-wide rule:

1. The planner defines the acceptance criteria and their corresponding tests.
2. The builder writes or updates the tests before, or in the same change as,
   the production implementation and demonstrates the expected red-to-green
   progression whenever the repository tooling supports it.
3. Reviewers verify that every acceptance criterion has exactly one meaningful
   automated test and that the test fails when the criterion is absent. If an
   acceptance criterion cannot be automated, the plan must document the reason
   and define manual evidence for reviewer approval.
4. The approver blocks approval when a criterion has no test, a test is only a
   placeholder, or the test does not exercise the stated behavior.

The builder may add additional tests, but it may not remove or weaken a test
mapped to an acceptance criterion without recording the reason in the plan and
having the approver explicitly review the change.

## Reports and durable learnings

After every completed loop, including an escalation or a failed run, the
approver must create a clear report at `docs/review/<job-id>-round-<n>.md` using
`docs/templates/review-template.md`. The report must summarize the plan,
implementation, test evidence, review verdicts, approval or escalation reason,
and any follow-up action. A report is required even when the loop does not
merge code.

If the loop reveals an important architectural decision, changed behavior,
reusable technique, recurring failure mode, or future constraint, the approver
must also create a durable entry at
`docs/learnings/<job-id>-<short-topic>.md` using
`docs/templates/learnings-template.md`. Do not create a learning entry for
routine status or duplicate information already captured elsewhere. Link each
learning entry from the approver report.

The approver owns the reports and learning entries. It may not modify the
planner’s plan or a reviewer’s original verdict; corrections must be recorded
as amendments in the approver report.

Every review file must begin with exactly one of:

```text
VERDICT: PASS
```

or

```text
VERDICT: CHANGES
```

Every decision file must begin with exactly one of:

```text
APPROVE
```

or

```text
ESCALATE
```

## Rules

- The orchestrator is the only writer of `factory/board.json`.
- The factory runs one job per loop.
- A plan must receive explicit human approval, recorded inside the plan, before
  a builder starts.
- Builders must use isolated worktrees. If the runtime cannot provide worktree
  isolation, stop and report the limitation.
- A worker must not overwrite another worker’s output.
- A review round is complete only when every required review file exists.
- Never resume the builder while a review round is incomplete.
- If any completed review says `VERDICT: CHANGES`, send the complete round
  feedback to the same builder when the runtime supports resumption; otherwise
  start a replacement builder with the prior builder’s job context. In either
  case, record the continuity choice in `job.json`.
- Allow at most two builder/review rounds. After the limit, route the job to
  `needs-human`.
- The approver may approve only after all required reviews pass.
- Reviewers never modify production code; only builders implement fixes.
- Reviewer roles are assigned from task type, affected files, complexity, and
  risk. Non-applicable UX/UI reviews must be explicitly recorded as skipped.
- A first review return sends the job back to the builder for fixes. A second or
  later return escalates to `needs-human`.
- High- and critical-risk jobs require human approval after the approver’s
  report and before commit/merge. Low- and medium-risk jobs may be merged by
  the approver after approval.
- Any blocker produces the approver report and pauses for human input.
- The approver must verify the acceptance-criterion-to-test matrix and test
  evidence before deciding.
- The approver must write the required report after every loop and record
  important durable learnings when applicable.
- Approval merges the feature branch through the repository’s normal merge
  mechanism after creating a commit. Do not assume a particular hosting service
  or VCS command. If no VCS is available, create the closest commit-equivalent
  artifact and stop; do not claim that a merge occurred.
- Commit messages must follow Conventional Commits 1.0.0:
  `<type>[optional scope]: <description>`, with `feat` for features, `fix` for
  bug fixes, and `!` or a `BREAKING CHANGE:` footer for breaking changes.
  Reference: https://www.conventionalcommits.org/en/v1.0.0/#specification
- The orchestrator updates the board after each durable state transition.
- Missing, malformed, or contradictory worker output is an error state, not an
  implicit pass.
- A loop report is written only after the reviewer phase has completed, except
  that blockers must also produce a report before waiting for human input.

## Board state

Use stable, runtime-neutral values for `stage`:

```json
{
  "jobs": [
    {
      "id": "003-rate-limiting",
      "branch": "factory/003-rate-limiting",
      "stage": "review",
      "round": 2,
      "reviews": {
        "security": "CHANGES",
        "ux": "PASS",
        "ui-design": "pending",
        "code": "PASS"
      },
      "runtime": "documented in factory/runtime-adapter.md"
    }
  ]
}
```

The dashboard must tolerate jobs being added, removed, or having new review
rounds. It must not depend on a particular agent vendor or model name.

## Commands

Provide equivalent commands through the active runtime’s preferred interface
(CLI, task runner, script, or documented manual procedure):

```text
factory run <feature>               run a new job through the loop
factory next                         run the first unchecked item in backlog.md
factory approve <job-id>             merge a needs-human job after human approval
factory rework <job-id> <note>       send a job back to the builder with feedback
```

The command names are a stable conceptual interface. They do not require a
slash-command implementation.

## Review and learning index

Each learning entry is an individual Markdown file under `docs/learnings/`.
Maintain `docs/learnings/index.md` with one sentence of no more than 100 words
per entry, linking to the entry and summarizing why it matters. The approver
decides whether a learning is warranted based on the result of the loop.

## Dry run

The factory must support a disposable dry run using a synthetic feature in a
temporary isolated worktree. The dry run must exercise the complete lifecycle:
brainstorm/grill, plan creation, human plan approval, red/green/refactor,
reviewer assignment, one intentional first-round `CHANGES` result, builder
rework, approver report, learning entry, Conventional Commit creation, and
merge or the documented commit-equivalent fallback. It must not modify
production code.

## Dashboard

Build the dashboard as a Vite frontend initialized with this shadcn preset:

```text
npx shadcn@latest init --preset b6Xthn9aW9 --base radix --template vite --pointer
```

Preserve the preset’s generated conventions and use its Radix-based component
system for the dashboard UI. The dashboard must still remain a lightweight
read-only view of the factory state unless an action is explicitly implemented
and documented. Jobs appear as cards moving through the loop’s stages. Each
review round appears as a row of reviewer chips that fill in as verdicts land.
`needs-human` jobs stand out. Clicking a card opens or displays its Markdown
files when the environment permits it.

The dashboard may be built as a Vite project under `factory/dashboard/` rather
than a single HTML file. It must read the durable `factory/board.json` state
through an appropriate local development/static-serving mechanism and document
the build and preview commands. Keep the visual design clean and minimal.
If the active environment cannot run Node.js or `npx`, stop the dashboard setup
as a blocker and document the missing capability; do not silently substitute a
different UI stack.

## Completion checklist

Before declaring the factory complete:

1. Inspect and document the repository language, test command, and conventions.
2. Confirm that the workflow can run with the active runtime’s native features.
3. Confirm that the documented fallback works without vendor-specific features.
4. Run the approved disposable dry run described above.
5. Validate that all required files are created and that `board.json` remains
   valid JSON after each state transition.
6. Start the dashboard and verify that it renders the sample board.
7. Document every runtime-specific assumption in `factory/runtime-adapter.md`.
8. Confirm that the project plan template is available and that the sample plan
   is stored under `docs/plans/`.
9. Confirm that every sample acceptance criterion maps to a real automated test.
10. Confirm that the approver produced a report and, when warranted, a learning
    entry in the required `docs/` directories.
11. Confirm that `docs/learnings/index.md` contains a sentence of no more than
    100 words for every learning entry.
12. Confirm that the sample commit follows Conventional Commits 1.0.0.
