# Runtime adapter

The forge is defined by plain files: `orchestrator.md`, `agents/*.md`, the
job folder, and `docs/`. Any runtime that can run several workers can drive
it: a code-agent product, a shell script, or a person with several terminals.
This file maps the six operations the orchestrator needs onto:

1. **Claude Code**, the runtime this forge was built and dry-run with; and
2. **Manual / CLI fallback**, which uses no vendor-specific features.

Both paths use the **same worker prompt**: the text printed by
`node forge/bin/forge.mjs brief <job-id> <role>`. A worker's prompt never
depends on the runtime.

## Repository facts (inspected 2026-10-09)

| Item | Value |
|---|---|
| Product language | **None yet.** The repo holds only the forge itself (Markdown contracts plus a zero-dependency Node.js ESM CLI) |
| Forge tooling | Node.js >= 20 (verified on v24.20.0), ESM `.mjs`, no dependencies |
| Forge test command | `npm test` (= `node --test forge/test/*.test.mjs`) |
| Forge build | none (plain ESM). Dashboard: `npm run dashboard:build` |
| Dashboard | Vite + React + TS, shadcn preset `b6Xthn9aW9` (Radix base) in `forge/dashboard/` |
| Dry-run feature test command | `node --test "sandbox/**/*.test.mjs"` inside the worktree. Node 24 does not accept a bare directory argument such as `node --test sandbox/`; the dry run found this |
| VCS | git, default branch `main`, remote `origin` (the forge never pushes) |
| Conventions | Markdown docs with YAML front matter (from `docs/templates/`), Conventional Commits 1.0.0, kebab-case file names |

When the product gains a language, the planner reads it from the repository
and records the test and build commands in each plan's *Test Strategy and
Commands* section. Nothing in the forge hardcodes them.

## Operation map

| Operation | Claude Code (native) | Manual / CLI fallback |
|---|---|---|
| **Start a worker** with a role and job context | Agent tool. `prompt` is the output of `forge brief <id> <role>`; `subagent_type: general-purpose`; `model` is optional (see role → model below) | Open a new terminal or agent session, paste the output of `forge brief <id> <role>`, or do the role yourself following `agents/<role>.md` |
| **Resume the same worker** for another review round | `SendMessage` to the agent id returned at launch. The message is the brief for the new round, plus the paths of every review file from the previous round | Paste the round-*n* brief into the **same** session. If that session is gone, start a replacement with the same brief; it reads the prior `build.md` |
| **Wait for completion** | Background agents notify the orchestrator when they finish, so there is no polling. Completion is then confirmed **from files**: `forge round <id>` exits 2 while any required review file is missing | Run `forge round <id>` until it exits 0. Exit code 2 means "still waiting" |
| **Send feedback** from a later round | Same as *resume*. The feedback is the round folder, so the message only points at files | A human writes feedback with `forge rework <id> "<note>"` (saved as `round-<n>/human-note.md`) |
| **Run forge commands** | Bash tool: `node forge/bin/forge.mjs …` | Shell: `node forge/bin/forge.mjs …` or `npm run forge -- …` |
| **Isolated worktree** | `forge worktree <id>` (plain `git worktree`). The Agent tool's own `isolation: "worktree"` is **not** used, so isolation stays portable | Same command. If git is unavailable, the command refuses and the job stops (the spec forbids building without isolation) |
| **Human gates** (grill, plan approval, merge approval) | `AskUserQuestion`; the answers are recorded with `forge event` / `forge approve-plan` | Ask in person or in chat, then run the same commands |

**Continuity rule.** For rework, the orchestrator first tries to resume the
round-1 builder. It records the result with `forge event <id> continuity
'{"mode":"resumed"|"replacement", ...}'` in `job.json`.

### Role → model (this run; the forge itself does not require it)

Roles are logical roles, and any capable agent can fill any of them. The dry
run used the following models, and `job.json` `events[type=worker]` records
each assignment:

| Role | Model used in the dry run |
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
F="node forge/bin/forge.mjs"
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

`forge/test/cli.e2e.test.mjs` runs exactly this path automatically. See
*Fallback evidence* below.

## No-VCS fallback

- Without git, `forge worktree` refuses to run. The spec requires worktree
  isolation and says to stop and report when isolation is impossible.
- `forge merge` has a *commit-equivalent* branch: if there is no git or no
  worktree, it writes `jobs/<id>/commit-equivalent.md` with the intended
  Conventional Commit message. It then moves the card to `committed`, never to
  `merged`, and never claims that a merge happened.

## Dashboard runtime

The dashboard is a Node/Vite app (see `forge/dashboard/README.md`). If Node
or `npx` is unavailable, dashboard setup is a **blocker**: document it, and do
not substitute another UI stack. The forge CLI and workflow still work
without the dashboard.

## Fallback evidence

Verified on 2026-10-09 with dry-run job `001-dry-run-duration-formatter`.

**Native path (Claude Code)**

- Every worker received the verbatim `forge brief` output: planner, builder,
  approver (sonnet) and reviewers (haiku).
- **Resume works.** The round-1 builder was resumed with `SendMessage` and
  received the complete round-1 feedback (paths). `job.json` records
  `{"type":"continuity","mode":"resumed"}`. The round-1 reviewers were resumed
  the same way for round 2.
- The board went through every state in the loop:
  `brainstorm → planning → plan-approval → building → review → building
  (rework) → review → approval → merged`. Every write was validated, and each
  transition was appended to `board.log`.
- The human gates used `AskUserQuestion`: the grill, recorded in `spec.md`
  plus a `grill` event, and plan approval, recorded in the plan front matter.
- The merge produced `feat(duration): add formatDuration compact duration
  formatter`, merged `--no-ff` into the disposable `forge/dry-run-base`.
  `forge verify` confirms that the commit is **not** on `main`.

**Fallback path (no vendor features)**

- `npm test` runs `forge/test/cli.e2e.test.mjs`. It builds a throwaway git
  repo and drives the real CLI with worker outputs written by hand, without
  any agent runtime. It covers the same loop, plus paths the dry run did not
  hit:
  - second `CHANGES` → approver report → `ESCALATE` → `needs-human`;
  - human `rework` → round 3;
  - High risk → `merge-approval` → `forge approve`;
  - a malformed review → `needs-human`;
  - a missing approver report → `needs-human`;
  - the builder blocked before plan approval; and
  - `next` consuming the backlog.

**Dashboard verification (2026-10-09)**

- `vite` dev and `vite preview` both serve `/api/board` (200), the sample board
  (200) and job Markdown via `/api/file` (200), and refuse path traversal and
  `board.json` through `/api/file` (403).
- Rendering was checked with screenshots of the sample board and of the live
  board during and after the dry run. The Playwright MCP browser could not
  start, because there is no system Chrome in WSL and Playwright's bundled
  Chromium lacks system libraries (installing them needs sudo). The
  screenshots were therefore taken with Windows' headless Chrome
  (`chrome.exe --headless=new --screenshot`) pointed at the WSL dev server.
- **Not verified in a browser:** clicking a card to open its file Sheet. The
  headless screenshot mode cannot click, and Chrome's DevTools port on Windows
  was not reachable from WSL (NAT networking). The behavior is implemented in
  `src/App.tsx` and its data path (`/api/file`) is verified above.
