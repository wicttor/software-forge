VERDICT: CHANGES

## Scope reviewed

- Worktree: `/home/wicttor/Projects/factory/.forge-worktrees/001-dry-run-duration-formatter` (branch `forge/001-dry-run-duration-formatter`, base `forge/dry-run-base`).
- Diff: `git diff HEAD` is empty; the build is untracked. Files reviewed in full: `sandbox/duration/format-duration.mjs`, `sandbox/duration/format-duration.test.mjs`.
- Forge inputs read: `docs/plans/001-dry-run-duration-formatter.md`, `forge/jobs/001-dry-run-duration-formatter/spec.md`, `job.json`, `build.md`.
- Plan sections covered: Scope, High-Level Technical Design, Acceptance Criteria AC-001..AC-005, Acceptance-Criterion-to-Test Matrix, Implementation Units U1 and U2, Test Strategy and Commands, Definition of Done.
- Round 1, dry-run forced: `job.json` `dryRunOptions.forceChanges` = `{round: 1, role: "code"}`, so `VERDICT: CHANGES` is required (see Findings 1 to 3, labeled "(dry-run forced)" where applicable).

## TDD verification

| AC | Mapped test | Single mapped test | Meaningful and can fail |
|---|---|---|---|
| AC-001 | `formats compact units and omits zero-valued units` | yes | yes (asserts `1h 2m 3s` and `1h`) |
| AC-002 | `formats zero as 0s and sub-second values as floored milliseconds` | yes | yes for `0` and `450`/`450.9`; does not cover 0 < ms < 1 (Finding 1) |
| AC-003 | `formats durations that include days` | yes | yes (`1d 1h 1m 1s`) |
| AC-004 | `throws TypeError for non-number and NaN input` | yes | yes, proven by mutation probe below |
| AC-005 | `throws RangeError for negative and non-finite input` | yes | yes (`-1`, `Infinity`, `-Infinity`) |

Mutation probe (AC-004), run in a disposable copy at `<scratchpad>/probe-001-dry-run-duration-formatter` (copy deleted afterwards):
- Replaced the `typeof`/`NaN` guard with `if (false) {` in `format-duration.mjs`.
- Ran `node --test sandbox/duration/format-duration.test.mjs`.
- Result: `throws TypeError for non-number and NaN input` failed with `AssertionError ... Received "RangeError"`; the other four tests passed. The AC-004 test therefore fails when the behavior is absent.
- Shared worktree check after cleanup: `git status --porcelain` is still `?? sandbox/` (unchanged by this review).

Red evidence in build.md is consistent with the test file (the five tests fail against the stub). No test was weakened in the files I read.

## Findings

1. **(minor, dry-run forced)** Non-zero sub-second values below 1 ms return `"0s"`, and no test covers this. `formatDuration(0.5)` returns `"0s"` and `formatDuration(0.9999)` returns `"0s"`. The code checks `total === 0` after flooring, so any 0 < ms < 1 takes the zero branch. AC-002 says values under one second return milliseconds, which points to `"0ms"` for these inputs. Required change:
   - Add `assert.equal(formatDuration(0.5), "0ms");` to the existing AC-002 test (keep it as the one mapped test for AC-002; do not add a second test for AC-002).
   - Change `format-duration.mjs` so that any input with `0 < ms < 1000` returns `${Math.floor(ms)}ms`, and only `ms === 0` (or `-0`) returns `"0s"`. Keep `formatDuration(0)` returning `"0s"`.
   - Verify with `node --test sandbox/duration/format-duration.test.mjs` that AC-002 passes and that `formatDuration(0.5)` is `"0ms"`.
   - If the builder instead decides `"0s"` is intended, the decision must be written into the spec and the test must assert `"0s"` explicitly; a silent `"0s"` for `0.5` is not acceptable.

2. **(minor)** Very large finite inputs produce exponential notation in the day unit. `formatDuration(Number.MAX_VALUE)` returns `"2.0806633505350875e+300d"`. The spec allows finite non-negative input, so this is a misformat, though not in any AC. Required change: either
   - add a doc comment on `formatDuration` stating the supported range (for example, that values beyond `Number.MAX_SAFE_INTEGER` ms are not formatted exactly), and keep the behavior, or
   - reject values above `Number.MAX_SAFE_INTEGER` with a `RangeError` and add an assertion in the AC-005 test for that case.
   The builder picks one; a silent exponential string is not acceptable.

3. **(minor, planner-owned; the builder cannot fix this)** The plan's documented full-suite command does not run on the target runtime. `node --test sandbox/` fails on Node v24.20.0 with `✖ sandbox ... 'test failed'` (1 test, 0 pass), and the Definition of Done requires tests to pass "using the commands documented above". The working form is `node --test "sandbox/**/*.test.mjs"`, which runs all 5 tests and passes. Required change: the planner records a Plan Amendment (empty table at the end of the plan) updating the full-suite command, or the plan is updated to the glob form. The build.md note already points to this. I did not edit the plan.

4. **(nit)** `formatDuration` has no doc comment describing the output contract (units, zero handling, flooring, error types). A short JSDoc would make the behavior that Finding 1 and 2 depend on explicit.

## Evidence

Commands run in `/home/wicttor/Projects/factory/.forge-worktrees/001-dry-run-duration-formatter` (Node v24.20.0):

```text
$ node --test sandbox/duration/format-duration.test.mjs
✔ formats zero as 0s and sub-second values as floored milliseconds
✔ formats durations that include days
✔ throws TypeError for non-number and NaN input
✔ throws RangeError for negative and non-finite input
ℹ tests 5
ℹ pass 5
ℹ fail 0
```
(The first passing test line was trimmed from this excerpt; all five passed.)

```text
$ node --test sandbox/
✖ sandbox (30.411361ms)
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

```text
$ node --test "sandbox/**/*.test.mjs"
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

Edge probes (`node --input-type=module -e` importing the function):

```text
0.5 -> "0s"
0 -> "0s"
0.9999 -> "0s"
999.9 -> "999ms"
1000 -> "1s"
1000.5 -> "1s"
86400000 -> "1d"
90061000.999 -> "1d 1h 1m 1s"
1.7976931348623157e+308 -> "2.0806633505350875e+300d"
```

Mutation probe output (disposable copy, `typeof` guard replaced by `if (false) {`):

```text
✖ throws TypeError for non-number and NaN input
AssertionError [ERR_ASSERTION]: The error is expected to be an instance of "TypeError". Received "RangeError"
ℹ pass 4
ℹ fail 1
```

Worktree status before and after review: `?? sandbox/` both times. Nothing committed, nothing written in the worktree, no forge files other than this review written.
