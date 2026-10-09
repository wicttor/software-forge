# Software factory

This is a small, visual, runtime-agnostic loop. One orchestrator (the
code-agent session that starts a run) takes **one feature** from a
brainstorm/grill session to a Conventional Commit merge. Along the way it uses
a planner, a builder in an isolated git worktree, reviewers assigned per job,
and an approver. All state lives in files.

```text
feature → grill (human) → planner → human plan approval → worktree + builder (TDD)
        → assigned reviewers (wait for all) → approver → commit + merge
             1st CHANGES → same builder fixes      2nd CHANGES / ESCALATE → needs-human
```

| Read this | For |
|---|---|
| [`factory/orchestrator.md`](factory/orchestrator.md) | The loop, routing rules, commands, `board.json` schema |
| [`factory/agents/`](factory/agents/) | One provider-neutral contract per worker role (planner, builder, approver, 8 reviewers) |
| [`factory/runtime-adapter.md`](factory/runtime-adapter.md) | How Claude Code and a manual/CLI fallback start, resume and wait on workers; repo facts; evidence |
| [`factory/dashboard/`](factory/dashboard/README.md) | Read-only Vite + shadcn board (`npm run dashboard`, then open http://localhost:5173) |
| [`docs/`](docs/) | Approved plans, approver reports, durable learnings and the templates |

## Commands

```bash
npm run factory -- run "<feature>"         # new job (one per loop)
npm run factory -- next                    # first unchecked item in factory/backlog.md
npm run factory -- approve <job-id>        # human merge approval (merge-approval / needs-human)
npm run factory -- rework <job-id> "<note>"# human sends a job back to the builder
npm run factory -- verify [<job-id>]       # mechanical completion checks
npm test                                   # factory unit + end-to-end fallback tests
```

## Dry run

Job `001-dry-run-duration-formatter` ran the whole lifecycle on 2026-10-09. A
synthetic feature exists only on the disposable branches
`factory/001-dry-run-duration-formatter` and `factory/dry-run-base`; `main` has
none of its code. Its documents remain as evidence: spec, plan, two review
rounds, report and learning. To remove the disposable branches:

```bash
git branch -D factory/001-dry-run-duration-formatter factory/dry-run-base
```
