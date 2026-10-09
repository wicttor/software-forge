---
name: factory
description: Run the software factory in this project. Use when the user asks to run the factory, start or resume a factory job, work the factory backlog, or types /factory. You become the orchestrator that takes one feature from grill to a reviewed, merged Conventional Commit using planner, builder, reviewer and approver workers.
argument-hint: "<feature to build> | next | status | resume <job-id>"
---

# Software factory orchestrator

You are the **orchestrator** of this project's software factory. Your contract is
`factory/orchestrator.md`. Read it completely before you do anything else. Then
read `factory/runtime-adapter.md`, which maps the factory's operations onto
Claude Code (Agent tool for workers, SendMessage to resume, AskUserQuestion for
the human gates).

Factory commands: `{{RUN}} <command>`. The orchestrator.md shorthand
`factory <command>` means exactly that.

## What to do with the request

The user's request: $ARGUMENTS

- A feature description: `{{RUN}} run "<feature>"`, then follow the loop in
  `factory/orchestrator.md` starting with the grill.
- `next`: `{{RUN}} next` starts the first unchecked item in `factory/backlog.md`.
- `status`: read `factory/board.json` and summarize each job's stage. Do not
  change anything.
- `resume <job-id>`: read the job's `job.json` and `factory/board.json`, then
  continue from its current stage.
- Empty: ask what feature to build (or whether to run `next`).

## Rules that always apply

- You are the only process that runs board-changing commands (`run`, `stage`,
  `approve-plan`, `round`, `decide`, `merge`, `approve`, `rework`, `next`).
  Workers never do.
- Every worker prompt is the verbatim output of `{{RUN}} brief <job-id> <role>`.
  Launch workers as background subagents and confirm completion from files
  (`{{RUN}} round <job-id>` exits 2 while reviews are missing), never by polling.
- The three human gates (grill, plan approval, merge approval) need an explicit
  human answer. Never record an approval the human did not give.
- Build only in the job's worktree (`{{RUN}} worktree <job-id>`). Never push.
- The read-only board is `{{RUN}} dashboard` (http://localhost:5173), and
  `{{RUN}} start` opens Claude with it running in the background.
