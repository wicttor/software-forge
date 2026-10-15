# Audit decision log: software-forge

- Date: 2026-10-15
- Scope: whole repo (README, BUILD_PROMPT, `template/forge/*`, role files, templates, skill, dashboard docs, dry-run example)
- Status: decisions made; **no repo files other than this log have been changed**. Code and doc edits below are a checklist.
- Source of truth after this audit: `template/forge/orchestrator.md` (D1).

## Simplified model (one job)

1. `forge run` creates the job. The orchestrator grills the human and writes `spec.md`.
2. The planner writes the plan. The human approves it.
3. A worktree is created and the builder works test-first.
4. Assigned reviewers each write one file. Only the code reviewer proves tests can fail (mutation probe).
5. The approver runs after **every** round and writes `round-<n>/decision.md` and `docs/review/<id>-round-<n>.md`: `APPROVE`, `REWORK` or `ESCALATE`.
6. `REWORK` (round 1): Low/Medium risk goes back to the same builder; High/Critical parks in `rework-approval` until `forge confirm-rework`. Round 2 with CHANGES, or any blocker, means `needs-human` (`approve` or `abandon`; `send-back` only while round < 2).
7. `APPROVE`: Low/Medium risk runs `forge merge`; High/Critical waits for `forge approve`.

Human gates: grill, plan approval, merge approval, plus conditional rework confirmation at High/Critical risk.

## Decisions

### Group 1: Source of truth and scope
- **D1** (1.1, 1.2, 1.4): `orchestrator.md` is the single source of truth.
- **D2** (1.3, 1.6): Keep all roles, stages and commands. State the real size; add a goals/non-goals note; mark ux, ui-design, accessibility as UI-only.
- **D3** (1.5): Move BUILD_PROMPT to `docs/history/` with a "superseded by orchestrator.md" banner; keep it out of the npm package.

### Group 2: Loop and state rules
- **D4** (2.1, 2.2): Approver runs after every completed review round; round 2 with CHANGES means ESCALATE.
- **D5** (2.7, 2.8, 2.9): Verdicts are `APPROVE | REWORK | ESCALATE`; one `round-<n>/decision.md` per round.
- **D6** (2.5, 2.10): Human `forge rework` renamed `forge send-back`; still capped at two rounds.
- **D7** (2.6, 2.12): Exits per stage. `needs-human`: `approve` or `abandon`; `send-back` only while round < 2. `failed`, `committed`, `abandoned` terminal. Add `abandoned` stage.
- **D8** (2.13): Board schema stays version 1, additive only. Replace "frozen" with a compatibility rule.

### Group 3: Roles
- **D9** (3.1): Shared `agents/_reviewer-base.md` plus short role files; `brief` concatenates.
- **D10** (3.2, 3.6): Code reviewer alone owns the mutation probe; others write "covered by code reviewer". `code` stays mandatory.
- **D11** (3.4): Remove the role-to-model table from the adapter; keep the principle, name no models.

### Group 4: Portability
- **D12** (4.1): Ship an `AGENTS.md` pointer for non-Claude runtimes.
- **D13** (4.4, 4.6): Create `AGENTS.md` only if missing; otherwise print the snippet. `--no-skill` skips the Claude skill only (add `--no-agents`, 4.7).
- **D14** (4.2, 4.3): Shorten `claude --forge` to a FAQ; `init` auto-fills the Repository facts table from `package.json` (Node only, keeps existing values).

### Group 5: Dashboard
- **D15** (5.1): `dashboard/dist` built by `prepack`; README says so; add a `npm pack --dry-run` test.
- **D16** (5.3): Keep the shadcn preset as a recorded design choice, not a rule.

### Group 6: Hygiene
- **D17** (6.3): Glossary in `orchestrator.md` (job, round, role, worker, `forge`); drop "loop".
- **D18** (6.1): Regenerate `examples/dry-run/` from current templates.

### Residuals
- **D19** (R1): `forge abandon <id> "<reason>"`, reason required, any non-terminal stage, worktree kept.
- **D20** (R3, R6, R7): High/Critical `REWORK` parks in new stage `rework-approval`; `confirm-rework` or `abandon`; `approve` not allowed.
- **D21** (R4, 3.7): Role file without base marker is used as is; `init --force` migrates and reports overwritten local edits.

## Cut / deferred

| Item | Outcome |
|---|---|
| BUILD_PROMPT as live spec | Moved to `docs/history/` |
| Model table in adapter | Removed |
| 8 copied reviewer files | Shared base + short files |
| Root `decision.md` | Per-round `decision.md` |
| Human `forge rework` | Renamed `send-back` |
| `claude --forge` section | Shortened to FAQ |
| Hardcoded "26 tests" in README | Removed |
| Smaller role set; schema v2 | Not chosen |

## Edit checklist

**Docs / templates**
- `template/forge/orchestrator.md`: goals/non-goals + glossary; routing rules (every round goes to `approval`); step 8/9 rows; stage enum (+`abandoned`, `rework-approval`) and exit table; command table (+`send-back`, `abandon`, `confirm-rework`; `rework` renamed); per-round decision path; compatibility rule replacing "frozen"; fix `board.log` wording (2.3); `job.json` events.
- `template/forge/runtime-adapter.md`: remove model table; add AGENTS.md note; Repository facts auto-filled; state only Claude Code is tested (4.5).
- `template/forge/agents/*`: new `_reviewer-base.md`; shrink 8 reviewer files; approver outputs to `round-<n>/decision.md` with `REWORK`; reviewers' TDD line per D10.
- `template/docs/templates/review-template.md`: `decision` enum adds `REWORK`.
- `template/claude/skills/forge/SKILL.md`: command names, gates, rules.
- `README.md`: intro size claim, loop diagram, commands, init table/options (`--no-agents`), `claude --forge` FAQ, dist wording, drop test count, BUILD_PROMPT references (6.5).
- `BUILD_PROMPT_AGENT_AGNOSTIC.md` -> `docs/history/` with banner.
- `dashboard/SETUP_LOG.md` -> `docs/history/`; fix paths (5.2). Dashboard README: shadcn as design choice.
- `examples/dry-run/`: regenerate (D18).

**Code / tests**
- `src/forge.mjs`: `round` routes to `approval`; `decide` handles REWORK + risk gating; new `send-back`, `abandon`, `confirm-rework`; per-round decision paths with fallback to root `decision.md` (2.11); `verify`; `brief` base concatenation + marker fallback.
- `src/core.mjs`: stage enum, validation.
- `src/init.mjs`: AGENTS.md, `--no-agents`, facts auto-fill, `--force` role-file migration.
- `bin/software-forge.mjs`: command list.
- Dashboard: columns for `abandoned`, `rework-approval`; per-round decisions.
- Tests: update `cli.e2e`, `core`, `init`; add pack test (D15), AGENTS.md and marker tests.

## Old-to-new map

| Old | New |
|---|---|
| `forge/jobs/<id>/decision.md` | `forge/jobs/<id>/round-<n>/decision.md` |
| `forge rework <id> "<note>"` | `forge send-back <id> "<note>"` |
| decision `APPROVE \| ESCALATE` | `APPROVE \| REWORK \| ESCALATE` |
| "loop" | "job" or "round" |
| `board.log` (file wording) | `log` array in `board.json` |

## Remaining checks
- Run `npm test` and the e2e flow after changes (not run during the audit).
- Watch the extra approver run on round 1 (D4) in the regenerated dry run.
- Auto-fill covers Node projects only (4.8).
