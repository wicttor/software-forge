VERDICT: PASS

## Scope reviewed

- Worktree: `/home/wicttor/Projects/factory/.factory-worktrees/001-dry-run-duration-formatter` (branch `factory/001-dry-run-duration-formatter`, base `factory/dry-run-base`).
- Diff: `git diff HEAD` is empty; the implementation is untracked under `sandbox/duration/`:
  - `sandbox/duration/format-duration.mjs` (new implementation of `formatDuration`)
  - `sandbox/duration/format-duration.test.mjs` (five `node:test` tests)
- Read: `factory/agents/security-reviewer.md`, `job.json`, `spec.md`, `docs/plans/001-dry-run-duration-formatter.md`, `build.md`.
- Plan sections covered: Scope, High-Level Technical Design, Acceptance Criteria AC-001..AC-005, AC-to-test matrix, Reviewer Assignment (security), Test Strategy and Commands.
- Dry-run rule: `job.json` `dryRunOptions.forceChanges` targets role `code`, not `security`. No forced change applies to this review.

## TDD verification

| AC | Mapped test (exactly one) | Meaningful / can fail? | Result |
|---|---|---|---|
| AC-001 | `formats compact units and omits zero-valued units` | Yes: asserts `"1h 2m 3s"` and `"1h"`; fails on a stub or wrong unit logic | Verified |
| AC-002 | `formats zero as 0s and sub-second values as floored milliseconds` | Yes: asserts `0 -> "0s"`, `450 -> "450ms"`, `450.9 -> "450ms"` | Verified |
| AC-003 | `formats durations that include days` | Yes: asserts `90061000 -> "1d 1h 1m 1s"` | Verified |
| AC-004 | `throws TypeError for non-number and NaN input` | Yes: `assert.throws(..., TypeError)` over `"1000"`, `null`, `undefined`, `NaN`; fails if no throw or wrong class | Verified |
| AC-005 | `throws RangeError for negative and non-finite input` | Yes: `assert.throws(..., RangeError)` over `-1`, `Infinity`, `-Infinity` | Verified |

Each AC maps to one test, and the build.md red evidence (stub throwing `not implemented`) shows the tests fail without the behavior. I did not run a mutation probe. The code reviewer owns mutation probes.

## Findings

1. **minor**: Very large finite inputs produce exponential notation inside the day unit, for example `formatDuration(Number.MAX_VALUE)` returns `"2.0806633505350875e+300d"`, and `formatDuration(1e21)` returns `"11574074074074d 1h 47m 2s"`. Template-literal formatting of large integers switches to exponent form at 1e21, and integer precision is lost above 2^53. This is not a security issue (no I/O, no eval, output is inert), and the spec does not define a maximum. No change is required for this review. If the code reviewer or the human wants a cap or a defined behavior, that is a spec decision, not a security fix.

No blocker or major findings.

Security checks performed:
- Input validation: `typeof` and `Number.isNaN` gate `TypeError`; `ms < 0` and `!Number.isFinite` gate `RangeError`. Rejected types (string, null, undefined, boolean, object, array, BigInt, `new Number`) all throw `TypeError`. The number-wrapper object case is also rejected, which is the intended behavior.
- Injection and eval: no `eval`, `Function`, dynamic import, shell, or template-based code execution. The output is built only from `Math.floor` results and fixed unit labels.
- Dependencies: none. `sandbox/duration/` has no `package.json` change and no imports beyond `node:test` and `node:assert/strict`.
- I/O: none in the production module. The test file imports only the module under test and Node built-ins.
- Error leakage and logging: error messages are fixed strings and do not echo the input value. There is no logging.
- Secrets: none present in the diff.
- Authentication and authorization: not applicable to a pure function.

## Evidence

Node version: `v24.20.0` (plan requires Node >= 20).

Worktree status before and after my checks (unchanged):
```text
?? sandbox/
```

Focused test run, `node --test sandbox/duration/format-duration.test.mjs` (tail):
```text
✔ formats zero as 0s and sub-second values as floored milliseconds (0.111028ms)
✔ formats durations that include days (0.152138ms)
✔ throws TypeError for non-number and NaN input (0.341256ms)
✔ throws RangeError for negative and non-finite input (0.664721ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

Glob run, `node --test "sandbox/**/*.test.mjs"` (tail):
```text
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

Note: the plan's `node --test sandbox/` form was not run by me. build.md records that it fails on Node v24.20.0 because directory arguments are treated as module paths. That is a planner-owned plan amendment, outside security scope.

Edge probes, run with `node --input-type=module -e` importing the worktree module. No files were written:
```text
1.7976931348623157e+308 -> "2.0806633505350875e+300d"
1e+21 -> "11574074074074d 1h 47m 2s"
9007199254740992 -> "104249991d 8h 59m"
0 -> "0s"
0.5 -> "0s"
999.99 -> "999ms"
1000 -> "1s"
86400000 -> "1d"
5 threw TypeError ms must be a number
true threw TypeError ms must be a number
 threw TypeError ms must be a number
[object Object] threw TypeError ms must be a number
1 threw TypeError ms must be a number
NaN threw TypeError ms must be a number
```
