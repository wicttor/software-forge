# Runtime adapter

The forge is defined by plain files: `orchestrator.md`, `agents/*.md`, the
job folder, and `docs/`. Any runtime that can run several workers can drive
it: a code-agent product, a shell script, or a person with several terminals.
This file maps the six operations the orchestrator needs onto:

1. **Claude Code**, the runtime this forge was built with; and
2. **Manual / CLI fallback**, which uses no vendor-specific features.

Both paths use the **same worker prompt**: the text printed by
`software-forge brief <job-id> <role>`. A worker's prompt never
depends on the runtime.

## Repository facts

The forge does not hardcode a language, test command or build command. The
planner reads them from the repository and records them in each plan's *Test
Strategy and Commands* section. Add durable, project-specific facts here (test
command, build command, conventions) so every worker starts from the same
picture:

| Item | Value |
|---|---|
| Product language | _fill in_ |
| Test command | _fill in_ |
| Build command | _fill in_ |
| VCS | git; the forge never pushes |
| Conventions | Conventional Commits 1.0.0 |

## Operation map

| Operation | Claude Code (native) | Manual / CLI fallback |
|---|---|---|
| **Start a worker** with a role and job context | Agent tool. `prompt` is the output of `forge brief <id> <role>`; `subagent_type: general-purpose`; `model` is optional (see role → model below) | Open a new terminal or agent session, paste the output of `forge brief <id> <role>`, or do the role yourself following `agents/<role>.md` |
| **Resume the same worker** for another review round | `SendMessage` to the agent id returned at launch. The message is the brief for the new round, plus the paths of every review file from the previous round | Paste the round-*n* brief into the **same** session. If that session is gone, start a replacement with the same brief; it reads the prior `build.md` |
| **Wait for completion** | Background agents notify the orchestrator when they finish, so there is no polling. Completion is then confirmed **from files**: `forge round <id>` exits 2 while any required review file is missing | Run `forge round <id>` until it exits 0. Exit code 2 means "still waiting" |
| **Send feedback** from a later round | Same as *resume*. The feedback is the round folder, so the message only points at files | A human writes feedback with `forge rework <id> "<note>"` (saved as `round-<n>/human-note.md`) |
| **Run forge commands** | Bash tool: `software-forge …` (via `npx`/`pnpm exec`, or the `forge` script) | Shell: the same |
| **Isolated worktree** | `forge worktree <id>` (plain `git worktree`). The Agent tool's own `isolation: "worktree"` is **not** used, so isolation stays portable | Same command. If git is unavailable, the command refuses and the job stops (the spec forbids building without isolation) |
| **Human gates** (grill, plan approval, merge approval) | `AskUserQuestion`; the answers are recorded with `forge event` / `forge approve-plan` | Ask in person or in chat, then run the same commands |

**Continuity rule.** For rework, the orchestrator first tries to resume the
round-1 builder. It records the result with `forge event <id> continuity
'{"mode":"resumed"|"replacement", ...}'` in `job.json`.

### Role → model (a suggestion; the forge does not require it)

Roles are logical roles, and any capable agent can fill any of them. A reasonable split is the following, and `job.json` `events[type=worker]` records
each assignment:

| Role | Suggested model |
|---|---|
| orchestrator | claude-opus-5-5 (the session that starts the run) |
| planner, builder, approver | sonnet |
| reviewers (code, security, …) | haiku |

Set `FORGE_RUNTIME="<runtime name / identity>"` before `forge run` to record
the runtime identity in `job.json`. It is optional.

## Claude Code specifics and assumptions

- Workers are launched as **background** subagents. The orchestrator is
  notified when each one finishes, so it never polls with sleep loops.
- `SendMessage` is a deferred tool in Claude Code. Load it with `ToolSearch`
  (`select:SendMessage`) before the first resume.
- No registration files (`.claude/agents/*.md`) are needed, because every
  worker is a `general-purpose` agent whose behavior comes entirely from the
  brief. **This is deliberate.** Registration would duplicate the portable role
  files and drift from them. If a team wants named agents, each one should
  contain only the line "Follow `forge/agents/<role>.md`".
- Subagents inherit the session's permission mode. Workers need Read, Write and
  Bash in the repo and the worktree.
- The orchestrator session is the only process that runs board-changing
  commands (`run`, `stage`, `approve-plan`, `round`, `decide`, `merge`,
  `approve`, `rework`, `next`). Workers are told never to run them.

## Manual fallback walkthrough (no vendor features)

```bash
F="npx software-forge"
ID=$($F run "My feature")                         # card appears in "brainstorm"
$EDITOR forge/jobs/$ID/spec.md                  # record the grill Q&A
$F stage $ID planning --risk Low --complexity LOW
$F brief $ID planner   # paste into any agent, or plan by hand
$F stage $ID plan-approval
$F approve-plan $ID --by "Your Name"              # only after reading the plan
$F worktree $ID
$F brief $ID builder   # build in .forge-worktrees/$ID
$F stage $ID review
$F brief $ID code      # repeat for every role in "Assigned reviewers:"
$F round $ID           # exit 2 = waiting; 0 = round evaluated
# if the round went back to building: brief the builder again (round 2), then stage review, round
$F brief $ID approver
$F decide $ID          # routes APPROVE/ESCALATE by risk
$F merge $ID           # Low/Medium risk; High/Critical: a human runs `$F approve $ID`
$F verify $ID
```

The package's own end-to-end test runs exactly this path automatically.

## No-VCS fallback

- Without git, `forge worktree` refuses to run. The spec requires worktree
  isolation and says to stop and report when isolation is impossible.
- `forge merge` has a *commit-equivalent* branch: if there is no git or no
  worktree, it writes `jobs/<id>/commit-equivalent.md` with the intended
  Conventional Commit message. It then moves the card to `committed`, never to
  `merged`, and never claims that a merge happened.

## Dashboard runtime

`software-forge dashboard` serves a prebuilt, read-only board from the
package (plain Node, no extra dependencies). If Node is unavailable, the
dashboard is a **blocker**: document it, and do not substitute another UI
stack. The forge CLI and workflow still work without the dashboard.
