---
review-id: <job-id>-round-<n>
job-id: <job-id>
title: "Review report: <short feature name>"
status: draft | complete | amended
decision: APPROVE | ESCALATE | FAILED
review-round: n
created: YYYY-MM-DD
updated: YYYY-MM-DD
version: 1.0
approver: "[Approver or agent]"
plan-id: <plan-id>
branch-or-change: "[Branch, commit, or equivalent]"
---

# Loop Review Report: <job-id>

- Job: `<job-id>`
- Feature: <short feature name>
- Plan: [<plan filename>](../plans/<plan filename>)
- Review round: <number>
- Date: <YYYY-MM-DD>
- Branch or change reference: <branch, commit, or equivalent>
- Final status: `APPROVE` / `ESCALATE` / `FAILED`
- Human approval required: yes/no
- Human approval status: pending/approved/rejected/not applicable

## Summary

<Concise description of what was attempted and the final outcome.>

## Plan and scope

<What the planner proposed, what was implemented, and any scope changes.>

## Acceptance criteria and TDD evidence

| Acceptance criterion | Test file/name | Test result | Evidence or notes |
|---|---|---|---|
| <criterion> | <test> | PASS/FAIL/BLOCKED | <command, output, or explanation> |

<Explain any missing, weakened, or changed test and why it was accepted or rejected.>

## Review verdicts

| Reviewer | Verdict | Key findings | Source |
|---|---|---|---|
| Security | PASS/CHANGES | <summary> | <path> |
| UX | PASS/CHANGES | <summary> | <path> |
| UI design | PASS/CHANGES | <summary> | <path> |
| Code | PASS/CHANGES | <summary> | <path> |
| Accessibility | PASS/CHANGES/SKIPPED | <summary> | <path> |
| Data | PASS/CHANGES/SKIPPED | <summary> | <path> |
| Infrastructure | PASS/CHANGES/SKIPPED | <summary> | <path> |
| Performance | PASS/CHANGES/SKIPPED | <summary> | <path> |

## Decision

<Why the approver approved, escalated, or marked the run failed.>

## Follow-up actions

- [ ] <action, owner, and when it is needed>

## Blockers and human input

<Record blockers, missing capabilities, or the exact question awaiting human
input. Use “None” when no blocker exists.>

## Durable learnings

- [<learning entry>](../learnings/<learning filename>)
- None identified.

## Amendments

<Corrections or clarifications made after the original worker files were written.>
