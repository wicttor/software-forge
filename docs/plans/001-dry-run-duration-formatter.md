---
plan-id: 001-dry-run-duration-formatter
title: "Duration formatter (dry run)"
status: ready
complexity: LOW
risk: Low
created: 2026-10-09
updated: 2026-10-09
version: 1.0
owner: "planner"
plan-approval: approved
plan-approved-by: "Wicttor (human, interactive approval)"
plan-approved-at: 2026-10-09
---

## Overview

Deliver a pure ESM function `formatDuration(ms)` (Node >= 20, zero dependencies) that turns a millisecond count into a compact string such as `"1h 2m 3s"`, throwing typed errors on invalid input. Complexity LOW and risk Low are taken from the spec (single pure function, no I/O, disposable branch). Success means all five acceptance-criterion tests pass under `node --test`.

## Scope

### In scope

- `sandbox/duration/format-duration.mjs` exporting `formatDuration(ms)`.
- `sandbox/duration/format-duration.test.mjs` with one `node:test` test per acceptance criterion.
- Units d, h, m, s; `ms` only when the total is under one second; fractional milliseconds floored.

### Out of scope

- Any production code change, dependencies, I/O, localization, weeks/months/years, rounding options.
- Any change on `main`; code lives only on `factory/001-dry-run-duration-formatter`.

## High-Level Technical Design

> This section is directional guidance for review, not an implementation
> specification to copy. The builder determines final names, abstractions, and
> code structure while preserving the stated behavior and constraints.

**Or pseudo-code:**

```text
formatDuration(ms):
  if typeof ms !== "number" or Number.isNaN(ms): throw TypeError
  if ms < 0 or not Number.isFinite(ms): throw RangeError
  total = floor(ms)
  if total == 0: return "0s"
  if total < 1000: return total + "ms"
  split total into d, h, m, s (s = floor(total/1000) remainder; sub-second part of totals >= 1s is dropped)
  return non-zero units joined by " " in order d h m s
```

## Acceptance Criteria

- AC-001: `formatDuration(3723000)` returns `"1h 2m 3s"`, and zero-valued units are omitted (`formatDuration(3600000)` returns `"1h"`).
- AC-002: `formatDuration(0)` returns `"0s"`; values under one second return milliseconds (`450` gives `"450ms"`), with fractional milliseconds floored (`450.9` gives `"450ms"`).
- AC-003: Days are supported: `formatDuration(90061000)` returns `"1d 1h 1m 1s"`.
- AC-004: A non-number input (string, `null`, `undefined`) or `NaN` throws `TypeError`.
- AC-005: A negative value, `Infinity` or `-Infinity` throws `RangeError`.

## Acceptance-Criterion-to-Test Matrix

| ID | Acceptance criterion | Test file or test name | Test level | Expected initial state | Result |
|---|---|---|---|---|---|
| AC-001 | Compact output omits zero units (`"1h 2m 3s"`, `"1h"`) | `sandbox/duration/format-duration.test.mjs` / `formats compact units and omits zero-valued units` | unit | failing | pending |
| AC-002 | Zero gives `"0s"`; sub-second gives floored `ms` | `sandbox/duration/format-duration.test.mjs` / `formats zero as 0s and sub-second values as floored milliseconds` | unit | failing | pending |
| AC-003 | Days are included (`"1d 1h 1m 1s"`) | `sandbox/duration/format-duration.test.mjs` / `formats durations that include days` | unit | failing | pending |
| AC-004 | Non-number or NaN throws `TypeError` | `sandbox/duration/format-duration.test.mjs` / `throws TypeError for non-number and NaN input` | unit | failing | pending |
| AC-005 | Negative or non-finite throws `RangeError` | `sandbox/duration/format-duration.test.mjs` / `throws RangeError for negative and non-finite input` | unit | failing | pending |

The planner must not mark this plan `ready` while an acceptance criterion has
no meaningful test. Each test must exercise the stated behavior and must be
capable of failing when that behavior is absent or broken.

## Reviewer Assignment

Select reviewers using the task type, affected files, complexity, and risk.
Record both assigned and explicitly skipped roles.

| Reviewer role | Assigned? | Reason | Required evidence |
|---|---|---|---|
| Security | yes | Requested by the human in the grill; function validates untrusted input and must reject it with typed errors | Review of input validation (NaN, Infinity, negative, non-number) and absence of I/O, eval or dependencies |
| UX | not applicable | No user interface | None |
| UI design | not applicable | No user interface | None |
| Code | yes | Always assigned | Diff review plus passing `node --test` output |
| Accessibility | no | No UI | None |
| Data | no | No schema, persistence or personal data | None |
| Infrastructure | no | No build, CI, config or dependency changes | None |
| Performance | no | Constant-time pure function, no hot path | None |

Assigned reviewers: code, security

Higher complexity and risk require broader review coverage and deeper test
coverage. A skipped UX or UI design review is valid only when the feature has
no meaningful user interface.

## Implementation Units (Phased)

### Phase 1: Foundation

- U1. **Valid-input formatting**
  - **Goal:** Export `formatDuration` producing compact strings for valid input.
  - **Dependencies:** None
  - **Files:**
    - Create: `sandbox/duration/format-duration.mjs`
    - Test: `sandbox/duration/format-duration.test.mjs`
  - **Acceptance criteria:** AC-001, AC-002, AC-003
  - **Test-first steps:**
    1. Add the three tests for AC-001..AC-003 (importing the not-yet-existing module).
    2. Run `node --test sandbox/duration/` and record the failing result.
    3. Implement the smallest function that makes them pass.
    4. Refactor without weakening the tests.

- U2. **Input validation**
  - **Goal:** Throw `TypeError` / `RangeError` for invalid input.
  - **Dependencies:** U1
  - **Files:**
    - Modify: `sandbox/duration/format-duration.mjs`
    - Test: `sandbox/duration/format-duration.test.mjs`
  - **Acceptance criteria:** AC-004, AC-005
  - **Test-first steps:**
    1. Add tests for AC-004 and AC-005 using `assert.throws` with the error class.
    2. Run them and confirm they fail (no validation yet).
    3. Add validation ahead of formatting logic.
    4. Run the full file; refactor keeping all tests green.

## Test Strategy and Commands

### Test layers

- Unit: all five ACs in `sandbox/duration/format-duration.test.mjs` using `node:test` and `node:assert/strict`.
- Integration: not applicable (pure function).
- System or end-to-end: not applicable.
- Regression: no existing tests are affected.

### Commands

```text
# Install or prepare dependencies
(none; zero dependencies, Node >= 20)

# Run focused tests
node --test sandbox/duration/format-duration.test.mjs

# Run the complete suite
node --test sandbox/
```

### Test data and environment

Inline literals only; no fixtures, services or credentials. Run from the worktree root.

## Alternatives Considered

- **Colon format (`01:02:03`):** Clock-style output — **Rejected because:** the human chose compact units.
- **Return `null` on invalid input:** Silent failure — **Rejected because:** the human chose throwing typed errors.

## Risk Analysis and Mitigation

| Risk | Impact | Mitigation | Owner or trigger |
|---|---|---|---|
| Floating-point or large-value edge cases misformat | Low | Floor first, use integer arithmetic; tests cover fractional input | Code reviewer |
| Ambiguity for sub-second part of totals >= 1s | Low | Documented in design: dropped, only whole seconds shown | Code reviewer |

## Operational and Rollout Notes

- Feature flags: none.
- Monitoring: none.
- Data migration: none.
- Rollback plan: discard branch `factory/001-dry-run-duration-formatter`.
- Performance baseline: constant time, negligible.

## Definition of Done

- [ ] All implementation units are complete.
- [ ] Every acceptance criterion has a meaningful automated test.
- [ ] Tests pass using the commands documented above.
- [ ] Security, UX, UI-design, and code reviews are complete where applicable.
- [ ] Documentation and operational notes are updated.
- [ ] The approver report is stored at `docs/review/<job-id>-round-<n>.md`.
- [ ] The plan’s human approval metadata is complete before building starts.
- [ ] Important durable learnings are stored under `docs/learnings/`, or the
      review report records that none were identified.

## Related Learnings

- None identified.

## Learning Gaps

- None identified.

## Plan Amendments

| Date | Version | Change | Reason | Approved by |
|---|---|---|---|---|
