# Spec: 001-dry-run-duration-formatter

> Record of the brainstorm/grill session between the orchestrator and the human
> (2026-10-09). This is a **dry run**: the feature is synthetic and its code may
> exist only on the disposable branches `factory/001-dry-run-duration-formatter`
> and `factory/dry-run-base` — never on `main`.

## Feature

A pure JavaScript (ESM, Node >= 20, zero dependencies) function
`formatDuration(ms)` that turns a millisecond count into a compact,
human-readable string. Location in the worktree: `sandbox/duration/`
(`format-duration.mjs` + `format-duration.test.mjs`), tested with `node --test`.

## Decisions from the grill (human answers)

| Question | Human answer |
|---|---|
| Output format | **Compact units**: `3723000` → `"1h 2m 3s"`; zero-valued units omitted; `0` → `"0s"`; sub-second values → `"450ms"` |
| Invalid input | **Throw**: `TypeError` for non-numbers and `NaN`; `RangeError` for negative or non-finite values |
| Risk | **Low** — pure function, no I/O, disposable branch; approver may merge after approval |
| Reviewers expected | **Security** in addition to the always-on code reviewer; no UI → UX / UI design not applicable |

## Constraints

- No production code changes; no dependencies; no I/O.
- Units: days (`d`), hours (`h`), minutes (`m`), seconds (`s`); milliseconds (`ms`) only when the total is under one second. Fractional milliseconds are floored.
- TDD is mandatory; exactly one mapped test per acceptance criterion.

## Complexity

LOW — single pure function, a handful of branches.

## Dry-run instrumentation

`job.json` sets `dryRunOptions.forceChanges = {round: 1, role: "code"}`: the
code reviewer must return `VERDICT: CHANGES` in round 1 with a concrete,
verifiable change request, to exercise the rework path.
