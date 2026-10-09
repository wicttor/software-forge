# Software Forge

A small, visual, runtime-agnostic software factory, packaged for npm. One
orchestrator (the Claude Code session that starts a run) takes **one feature**
from a grill session to a Conventional Commit merge, using a planner, a builder
in an isolated git worktree, reviewers assigned per job, and an approver. All
state lives in files; a read-only dashboard shows the board.

```text
feature → grill (human) → planner → human plan approval → worktree + builder (TDD)
        → assigned reviewers (wait for all) → approver → commit + merge
             1st CHANGES → same builder fixes      2nd CHANGES / ESCALATE → needs-human
```

## Install into a project

Needs Node >= 20 and a git repository with at least one commit.

```bash
cd /path/to/your-project
npx software-forge init
git add -A && git commit -m "chore: add software-forge"
```

`init` is idempotent. It:

| Step                                        | Result                                                                                                                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copies the contracts                        | `factory/orchestrator.md`, `factory/runtime-adapter.md`, `factory/agents/*`, `docs/templates/*`                                                                                                                         |
| Creates starter state, never overwriting it | `factory/board.json`, `factory/backlog.md`, `factory/jobs/`, `docs/{plans,review,learnings}/`                                                                                                                           |
| Adds the Claude Code project skill          | `.claude/skills/factory/SKILL.md` (`/factory`)                                                                                                                                                                          |
| Updates `.gitignore`                        | `.factory-worktrees/`, `factory/.dashboard.json`                                                                                                                                                                        |
| Updates `package.json`                      | scripts `factory`, `factory:dashboard`, `factory:start`, `factory:verify`; `software-forge` as a devDependency (`^version`). Creates a minimal private `package.json` if there is none |
| Installs                                    | with the detected package manager (npm, pnpm, yarn or bun)                                                                                                                                                              |

Options: `--force` refreshes contracts and the skill (state is still kept),
`--no-install`, `--no-skill`, `--spec <dep spec>`, `--dry-run`, `[dir]`.
Existing scripts with the same name are left alone and reported.

## Use it

```bash
claude                       # then: /factory add CSV export     (also: /factory next, /factory status)
npx software-forge start "add CSV export"   # dashboard in the background + Claude with the factory prompt
npm run factory:dashboard    # just the board, http://localhost:5173  (pnpm factory:dashboard, ...)
```

### `claude --factory`?

Not possible as such: Claude Code has a fixed flag set and no extension point for
new flags. The options, from closest to furthest:

1. **`software-forge start [feature] [--port n] [--keep-dashboard] [-- <claude args>]`**
   (`npm run factory:start`). Starts the dashboard detached, runs `claude` with
   `--append-system-prompt` pointing at the factory skill and, if you give a
   feature, the initial prompt `/factory <feature>`. The dashboard it started
   is stopped when Claude exits. `FACTORY_CLAUDE_BIN` overrides the binary.
2. A shell alias, so it feels like a mode: `alias claude-factory='npx software-forge start'`.
3. A `SessionStart` hook in `.claude/settings.json` running
   `npx software-forge dashboard --detach --quiet`, so plain `claude` also
   starts the board. Not installed by `init`, because it edits settings and the
   dashboard would outlive the session (`software-forge dashboard --stop`).

## Commands

```bash
software-forge init | start | dashboard [--detach|--stop]
software-forge run "<feature>"            # new job (one per loop)
software-forge next                       # first unchecked item in factory/backlog.md
software-forge approve <job-id>           # human merge approval (merge-approval / needs-human)
software-forge rework <job-id> "<note>"   # human sends a job back to the builder
software-forge verify [<job-id>]          # mechanical completion checks
```

In a project use `npm run factory -- <cmd>`, `pnpm factory <cmd>` or `npx software-forge <cmd>`.
Commands find the project by walking up to the nearest `factory/board.json`
(from inside a builder worktree they resolve to the main checkout). Set
`FACTORY_REPO` to point at another project.

## What lives where

| Path                     |                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bin/software-forge.mjs` | The single bin: `init`, `start`, `dashboard`, and the job commands                                                                                                                                                 |
| `src/`                   | `factory.mjs` (job CLI), `core.mjs` (pure logic), `init.mjs`, `start.mjs`, `dashboard-server.mjs`, `pm.mjs`, `project.mjs`                                                                                         |
| `template/`              | Everything `init` copies: `factory/` contracts and starters, `docs/`, `claude/skills/factory/`                                                                                                                     |
| `dashboard/`             | Vite + React + shadcn source; `dashboard/dist` is the prebuilt bundle that ships and is served by plain Node                                                                                                       |
| `examples/dry-run/`      | Evidence of the first full run (job `001-dry-run-duration-formatter`): spec, plan, two review rounds, report, learning, and the original runtime notes. `FACTORY_REPO=examples/dry-run npm run dashboard` shows it |
| `test/`                  | Unit tests, the end-to-end fallback test, `init`/dashboard/`start` tests (`npm test`)                                                                                                                              |

Project contracts are copied (not referenced) so you can edit agents and the
orchestrator per project. `init --force` pulls in newer versions.

## Developing the package

```bash
npm test                          # 26 tests, no network
npm run dashboard:install && npm run dashboard   # Vite dev server, FACTORY_REPO selects the project
npm run dashboard:build           # rebuild dashboard/dist
```
