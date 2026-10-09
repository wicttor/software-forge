---
learning-id: 001-dry-run-duration-formatter-node-test-command
job-id: 001-dry-run-duration-formatter
title: "Use a glob with node --test on Node 24"
status: active
category: testing
importance: medium
created: 2026-10-09
updated: 2026-10-09
version: 1.0
author: "approver worker"
source-review: 001-dry-run-duration-formatter-round-2
related-plan: 001-dry-run-duration-formatter
---

# Learning: Use a glob with node --test on Node 24

- Source job: `001-dry-run-duration-formatter`
- Date recorded: 2026-10-09
- Category: testing
- Related review: [001-dry-run-duration-formatter-round-2.md](../review/001-dry-run-duration-formatter-round-2.md)
- Status: active

## Context

The plan specified `node --test sandbox/` as the full-suite command. On Node v24.20.0 it fails with one failing "test" because the directory is treated as a module path.

## Learning

Plans should specify `node --test "<dir>/**/*.test.mjs"` (quoted glob), which works on Node 20+ and 24.

## Evidence

- build.md round 1 notes; round-1 and round-2 review-code evidence (`node --test sandbox/` fails, glob passes 5/5).

## Consequences

Planners should verify documented test commands on the target Node version; otherwise Definition of Done cannot be met literally.

## Recommended future action

- [ ] Use the glob form in future plans.

## Supersession

None.
