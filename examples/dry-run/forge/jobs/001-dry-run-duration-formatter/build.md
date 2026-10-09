# Build: 001-dry-run-duration-formatter

## Round 1
### Red evidence
Tests written first; `sandbox/duration/format-duration.mjs` was a stub throwing `Error("not implemented")`.
Command: `node --test sandbox/duration/format-duration.test.mjs`
```text
✖ formats compact units and omits zero-valued units (0.78238ms)
✖ formats zero as 0s and sub-second values as floored milliseconds (0.138098ms)
✖ formats durations that include days (0.092169ms)
✖ throws TypeError for non-number and NaN input (0.574523ms)
✖ throws RangeError for negative and non-finite input (0.198908ms)
ℹ tests 5
ℹ pass 0
ℹ fail 5
```

### Green evidence
Focused: `node --test sandbox/duration/format-duration.test.mjs`
```text
✔ formats compact units and omits zero-valued units (0.757821ms)
✔ formats zero as 0s and sub-second values as floored milliseconds (0.110758ms)
✔ formats durations that include days (0.134718ms)
✔ throws TypeError for non-number and NaN input (0.314126ms)
✔ throws RangeError for negative and non-finite input (0.666572ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0
```
Full suite (glob form, see Notes): `node --test "sandbox/**/*.test.mjs"`
```text
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

### AC-to-test mapping
AC-001 -> sandbox/duration/format-duration.test.mjs::formats compact units and omits zero-valued units
AC-002 -> sandbox/duration/format-duration.test.mjs::formats zero as 0s and sub-second values as floored milliseconds
AC-003 -> sandbox/duration/format-duration.test.mjs::formats durations that include days
AC-004 -> sandbox/duration/format-duration.test.mjs::throws TypeError for non-number and NaN input
AC-005 -> sandbox/duration/format-duration.test.mjs::throws RangeError for negative and non-finite input

### Files changed
sandbox/duration/format-duration.mjs
sandbox/duration/format-duration.test.mjs

### Responses to review
n/a

### Notes
- Plan amendment requested (planner-owned): the plan's full-suite command `node --test sandbox/` fails on Node v24.20.0 (`Cannot find module '.../sandbox'`, 1 failing "test") because directory arguments are treated as module paths. Used `node --test "sandbox/**/*.test.mjs"` instead; it runs all 5 tests. No test removed or weakened.
- Nothing committed.

## Round 2
### Red evidence
Extended the mapped AC-002 test (added `formatDuration(0.5) === "0ms"`) and the mapped AC-005 test (added `Number.MAX_SAFE_INTEGER + 1`, `Number.MAX_VALUE`) before changing code. Command: `node --test "sandbox/**/*.test.mjs"`
```text
✔ formats compact units and omits zero-valued units (0.80716ms)
✖ formats zero as 0s and sub-second values as floored milliseconds (0.742931ms)
✔ formats durations that include days (0.140678ms)
✔ throws TypeError for non-number and NaN input (0.360195ms)
✖ throws RangeError for negative and non-finite input (0.275056ms)
ℹ tests 5
ℹ pass 3
ℹ fail 2
✖ failing tests:
✖ formats zero as 0s and sub-second values as floored milliseconds (0.742931ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
    actual: '0s',
```

### Green evidence
Focused: `node --test sandbox/duration/format-duration.test.mjs`
```text
✔ formats compact units and omits zero-valued units (0.736241ms)
✔ formats zero as 0s and sub-second values as floored milliseconds (0.113558ms)
✔ formats durations that include days (0.140768ms)
✔ throws TypeError for non-number and NaN input (0.312996ms)
✔ throws RangeError for negative and non-finite input (0.739731ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0
```
Full suite: `node --test "sandbox/**/*.test.mjs"`
```text
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

### AC-to-test mapping
Unchanged from Round 1 (same five tests; AC-002 and AC-005 tests extended, none weakened).

### Files changed
sandbox/duration/format-duration.mjs
sandbox/duration/format-duration.test.mjs

### Responses to review
- review-code #1 (0 < ms < 1 returned "0s"): fixed. Only exactly 0 (or -0) returns "0s"; 0.5 now gives "0ms". AC-002 test extended.
- review-code #2 (exponential notation for huge values): fixed by rejecting values above Number.MAX_SAFE_INTEGER with RangeError; AC-005 test extended with MAX_SAFE_INTEGER + 1 and MAX_VALUE. Documented in the doc comment.
- review-code #3 (plan full-suite command fails on Node 24, planner-owned): plan amendment request stands: replace `node --test sandbox/` with `node --test "sandbox/**/*.test.mjs"`. Not editable by the builder.
- review-code #4 (no doc comment): fixed, JSDoc added describing units, zero handling, flooring and errors.
- review-security #1 (minor, huge values exponential/imprecise): addressed by the same MAX_SAFE_INTEGER RangeError as code #2.

### Notes
- Behavior change: inputs above Number.MAX_SAFE_INTEGER now throw RangeError (builder's choice among the reviewer's options). Spec/plan say "RangeError for negative or non-finite"; the planner may wish to record this as an amendment. No test removed or weakened. Nothing committed.
