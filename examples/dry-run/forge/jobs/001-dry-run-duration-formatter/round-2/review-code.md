VERDICT: PASS

## Scope reviewed

- Worktree: `/home/wicttor/Projects/factory/.forge-worktrees/001-dry-run-duration-formatter` (branch `forge/001-dry-run-duration-formatter`, base `forge/dry-run-base`).
- Diff: `git diff HEAD` is empty; the implementation is untracked under `sandbox/duration/`. Files reviewed in full: `sandbox/duration/format-duration.mjs`, `sandbox/duration/format-duration.test.mjs`.
- Forge inputs read: `docs/plans/001-dry-run-duration-formatter.md`, `forge/jobs/001-dry-run-duration-formatter/spec.md`, `job.json`, `build.md` (Round 1 and Round 2 sections), `round-1/review-code.md`, `round-1/review-security.md`.
- Plan sections covered: Scope, High-Level Technical Design, AC-001..AC-005, AC-to-test matrix, Implementation Units U1/U2, Test Strategy and Commands, Definition of Done, Plan Amendments.
- Dry-run forced change: applied to round 1 only (`dryRunOptions.forceChanges.round` = 1). Round 2 verdict is given on merit.

## Round 1 changes: status

| Round 1 finding | Status | Evidence |
|---|---|---|
| 1 (forced): `0 < ms < 1` returned `"0s"`, untested | Landed. Code: `if (ms === 0) return "0s";` then `if (total < SECOND) return \`${total}ms\``. AC-002 test asserts `formatDuration(0.5) === "0ms"`. | Tests pass; `formatDuration(0.5)` and `formatDuration(0.9999)` return `"0ms"`; `formatDuration(0)` still `"0s"`. Mutation probe below. |
| 2: `Number.MAX_VALUE` gave exponential `d` notation | Landed. Inputs above `Number.MAX_SAFE_INTEGER` throw `RangeError`; AC-005 test asserts `MAX_SAFE_INTEGER + 1` and `MAX_VALUE`; JSDoc documents the bound. | Tests pass. `formatDuration(Number.MAX_SAFE_INTEGER)` returns `"104249991d 8h 59m"`, exact and not exponential. |
| 3 (planner-owned): plan full-suite command `node --test sandbox/` fails on Node 24 | Not landed; planner-owned, outside builder scope. The plan's Plan Amendments table is still empty, so the documented command is still broken. Carried over as a non-blocking note. | `node --test sandbox/` still reports `ℹ fail 1`. The glob form passes 5/5. |
| 4 (nit): no doc comment | Landed. JSDoc covers units, zero handling, flooring, and error types. | Read in `format-duration.mjs`. |

## TDD verification

| AC | Mapped test (exactly one) | Meaningful and can fail | Result |
|---|---|---|---|
| AC-001 | `formats compact units and omits zero-valued units` | Yes: `"1h 2m 3s"` and `"1h"` | Verified |
| AC-002 | `formats zero as 0s and sub-second values as floored milliseconds` | Yes: `0 -> "0s"`, `450 -> "450ms"`, `450.9 -> "450ms"`, `0.5 -> "0ms"`. Round-2 probe shows the `0.5` assertion fails when the fix is reverted. | Verified |
| AC-003 | `formats durations that include days` | Yes: `90061000 -> "1d 1h 1m 1s"` | Verified |
| AC-004 | `throws TypeError for non-number and NaN input` | Yes: `"1000"`, `null`, `undefined`, `NaN` must throw `TypeError`. Round-1 probe showed this test fails when the guard is removed. | Verified |
| AC-005 | `throws RangeError for negative and non-finite input` | Yes: `-1`, `Infinity`, `-Infinity`, `MAX_SAFE_INTEGER + 1`, `MAX_VALUE` must throw `RangeError` | Verified |

Mutation probe (round 2), run in a disposable copy at `<scratchpad>/probe2-001-dry-run-duration-formatter` (copy deleted afterwards):
- Reverted the zero branch to `if (total === 0) return "0s";` (which makes `0.5` return `"0s"`).
- Ran `node --test sandbox/duration/format-duration.test.mjs`.
- Result: `formats zero as 0s and sub-second values as floored milliseconds` fails with `actual: '0s', expected: '0ms'`; 4 pass, 1 fail. The forced-change assertion is therefore meaningful.
- Shared worktree after cleanup: `git status --porcelain` is `?? sandbox/`, unchanged.

## Findings

1. **(minor, carried over, non-blocking for the builder)** The plan's documented full-suite command `node --test sandbox/` fails on Node v24.20.0. The Definition of Done requires tests to pass with the documented commands. Required change: the planner records a Plan Amendment (the table at the end of `docs/plans/001-dry-run-duration-formatter.md` is still empty) that replaces the command with `node --test "sandbox/**/*.test.mjs"`. The builder cannot make this change.

2. **(minor, documentation)** Inputs above `Number.MAX_SAFE_INTEGER` now throw `RangeError`. The spec and plan say `RangeError` is for negative or non-finite values only. This is a reasonable choice (the round-1 reviewer offered it as one of two options), and it is covered by tests and JSDoc, but it departs from the written spec. Required change: the planner records this as a Plan Amendment or as a spec note so the documented contract matches the code.

## Evidence

Commands run in `/home/wicttor/Projects/factory/.forge-worktrees/001-dry-run-duration-formatter` (Node v24.20.0):

```text
$ node --test sandbox/duration/format-duration.test.mjs
✔ formats compact units and omits zero-valued units
✔ formats zero as 0s and sub-second values as floored milliseconds
✔ formats durations that include days
✔ throws TypeError for non-number and NaN input
✔ throws RangeError for negative and non-finite input
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

```text
$ node --test "sandbox/**/*.test.mjs"
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

```text
$ node --test sandbox/
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

Edge probes (`node --input-type=module -e` importing the function):

```text
0.5 -> "0ms"
0.9999 -> "0ms"
0 -> "0s"
-0 -> "0s"
999.9 -> "999ms"
1000 -> "1s"
86400000 -> "1d"
9007199254740991 -> "104249991d 8h 59m"
```

Round-2 mutation probe output (disposable copy, zero branch reverted to `total === 0`):

```text
24:  if (total === 0) return "0s";
✖ formats zero as 0s and sub-second values as floored milliseconds
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
    actual: '0s',
    expected: '0ms'
ℹ pass 4
ℹ fail 1
```

Worktree status before and after review: `?? sandbox/` both times. Nothing committed. The only file written by this review is `round-2/review-code.md`.
