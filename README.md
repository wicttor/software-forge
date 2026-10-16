# Software Forge

A runtime-agnostic software forge for git projects, packaged for npm. An
orchestrator (the Claude Code session that runs the `/forge` skill) takes **one
feature at a time** from a grill session to a Conventional Commit merge, using a
planner, a builder in an isolated git worktree, reviewers assigned per job, and
an approver. All state lives in files, and a read-only dashboard shows the board.

```text
feature → grill (human) → planner → human plan approval → worktree + builder (TDD)
        → assigned reviewers (wait for all) → approver → commit + merge
             1st CHANGES → same builder fixes      2nd CHANGES / ESCALATE → needs-human
```

## Requirements

- Node >= 20
- A git repository with at least one commit (the builder works in git worktrees)
- [Claude Code](https://claude.com/claude-code) to act as the orchestrator

## Install into a project

```bash
cd /path/to/your-project
npx software-forge init
git add -A && git commit -m "chore: add software-forge"
```

`init` must run at the repository root and is idempotent. It:

| Step                                        | Result                                                                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Copies the contracts                        | `forge/orchestrator.md`, `forge/runtime-adapter.md`, `forge/agents/*`, `docs/templates/*`                                     |
| Creates starter state, never overwriting it | `forge/board.json`, `forge/backlog.md`, `forge/jobs/`, `docs/{plans,review,learnings}/`                                       |
| Adds the Claude Code project skill          | `.claude/skills/forge/SKILL.md` (`/forge`)                                                                                    |
| Updates `.gitignore`                        | `.forge-worktrees/`, `forge/.dashboard.json`                                                                                  |
| Updates `package.json`                      | scripts `sforge`, `sforge:dashboard`, `sforge:start`, `sforge:verify` and `software-forge` as a devDependency (creates a minimal private `package.json` if there is none) |
| Installs                                    | with the detected package manager (npm, pnpm, yarn or bun)                                                                    |

Options: `--force` (refresh contracts and the skill; state is still kept, and
existing scripts with the same name are replaced), `--no-install`, `--no-skill`,
`--spec <dep spec>`, `--dry-run`, `[dir]`. Existing scripts with the same name
are otherwise left alone and reported.

After installing, edit `forge/runtime-adapter.md` ("Repository facts") to describe your project.

## Use it

From a Claude Code session in the project:

```text
/forge add CSV export     # new job
/forge next               # first unchecked item in forge/backlog.md
/forge status             # summarize every job's stage
/forge resume <job-id>    # continue a job from its current stage
```

Or start the dashboard and Claude together:

```bash
npx software-forge start "add CSV export"
```

`start` launches the dashboard in the background, then runs `claude` with
`--append-system-prompt` pointing at the forge skill and, if you give a feature,
the initial prompt `/forge <feature>`. A dashboard that `start` launched is
stopped when Claude exits.

## Commands

Run as `npx software-forge <cmd>`, `npm run sforge -- <cmd>` or `pnpm sforge <cmd>`.

### Setup and run

| Command                                                                   | Purpose                                                                                                          |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `init [dir] [--force] [--no-install] [--no-skill] [--spec <spec>] [--dry-run]` | Install the forge into the current git project                                                              |
| `start [feature] [--port n] [--no-dashboard] [--keep-dashboard] [-- <claude args>]` | Dashboard in the background plus Claude Code with the forge skill. `FORGE_CLAUDE_BIN` overrides the `claude` binary |
| `dashboard [--port n] [--detach] [--stop]`                                | Read-only board, default `http://localhost:5173` (tries the next ports if busy)                                  |
| `--version`, `--help`                                                     | Print the package version or the command list                                                                    |

### Jobs

Used by the orchestrator (see `forge/orchestrator.md`), except where marked as human commands.

| Command                                | Purpose                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `run "<feature>" [--dry-run]`          | Create a job and a board card in stage `brainstorm`                                      |
| `next`                                 | Run the first unchecked `- [ ]` item in `forge/backlog.md`                               |
| `stage <id> <stage> [--note ...]`      | Validated board transition                                                               |
| `approve-plan <id> --by "<human>"`     | Record an explicit human plan approval                                                   |
| `worktree <id> [--base <branch>]`      | Create the isolated worktree and feature branch                                          |
| `brief <id> <role>`                    | Print the exact worker prompt for a role                                                 |
| `round <id>`                           | Check whether the current review round is complete and record its verdicts               |
| `decide <id>`                          | Record the approver's decision                                                           |
| `merge <id> [--message "<commit>"]`    | Create a Conventional Commit on the feature branch and merge it into the base branch     |
| `event <id> <type> [json]`             | Append an event to the job                                                               |
| `approve <id>`                         | **Human:** approve a `merge-approval` or `needs-human` job (commit and merge)            |
| `rework <id> "<note>"`                 | **Human:** send a job back to the builder; the note is saved under `round-<n>/human-note.md` |
| `verify [<id>]`                        | Mechanical completion checks on files, board JSON, learnings index and commit message    |

Commands find the project by walking up to the nearest `forge/board.json` (from
inside a builder worktree they resolve to the main checkout). Set `FORGE_REPO`
to point at another project.

## Repository layout

| Path                     | Contents                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `bin/software-forge.mjs` | The single bin: `init`, `start`, `dashboard` and the job commands                                                         |
| `src/`                   | `forge.mjs` (job CLI), `core.mjs` (pure logic), `init.mjs`, `start.mjs`, `dashboard-server.mjs`, `pm.mjs`, `project.mjs` |
| `template/`              | Everything `init` copies: `forge/` contracts and starters, `docs/`, `claude/skills/forge/`                                |
| `dashboard/`             | Vite + React + shadcn source. The prebuilt `dashboard/dist` is generated on `npm pack` and served by plain Node           |
| `examples/dry-run/`      | Evidence of a full dry run (job `001-dry-run-duration-formatter`): spec, plan, two review rounds, learning                |
| `test/`                  | Unit, `init`, dashboard, `start` and end-to-end tests                                                                     |

Project contracts are copied, not referenced, so you can edit agents and the
orchestrator per project. `init --force` pulls in newer versions.

## Developing the package

```bash
npm test                          # node --test, no network
npm run dashboard:install         # install dashboard dependencies
npm run dashboard                 # Vite dev server; FORGE_REPO selects the project (default: examples/dry-run)
npm run dashboard:build           # build dashboard/dist (needed by `software-forge dashboard`)
```

The scripts work with npm, pnpm, yarn or bun.

## License

MIT
