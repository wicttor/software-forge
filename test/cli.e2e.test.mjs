// End-to-end test of the manual / vendor-neutral fallback: a throwaway git repo,
// the real CLI, and worker outputs written by hand (no agent runtime at all).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-e2e-'));
  // The project files `init` would create, copied straight from the package template.
  for (const p of ['factory', 'docs']) fs.cpSync(path.join(SRC, 'template', p), path.join(dir, p), { recursive: true });
  fs.writeFileSync(path.join(dir, 'factory/backlog.md'), '# Backlog\n\n- [ ] Add greeting helper\n- [ ] Second thing\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.factory-worktrees/\n');
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'e2e@example.invalid');
  g('config', 'user.name', 'e2e');
  g('add', '-A');
  g('commit', '-qm', 'chore: init');
  const cli = (...args) => spawnSync('node', [path.join(SRC, 'bin/software-forge.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
  const ok = (...args) => { const r = cli(...args); assert.equal(r.status, 0, `${args.join(' ')}\n${r.stderr}`); return r.stdout.trim(); };
  const board = () => JSON.parse(fs.readFileSync(path.join(dir, 'factory/board.json'), 'utf8'));
  const job = (id) => board().jobs.find((j) => j.id === id);
  const write = (p, text) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), text); };
  return { dir, cli, ok, board, job, write, g };
}

const plan = (risk) => `---
plan-id: X
title: "Greeting"
status: ready
complexity: LOW
risk: ${risk}
plan-approval: pending
plan-approved-by: ""
plan-approved-at: ""
---

## Acceptance Criteria

- AC-001: greet("Ana") returns "Hello, Ana"

## Acceptance-Criterion-to-Test Matrix

| ID | Acceptance criterion | Test file or test name | Test level | Expected initial state | Result |
|---|---|---|---|---|---|
| AC-001 | greets | \`greet.test.mjs\` / \`greets by name\` | unit | failing | pending |

## Reviewer Assignment

Assigned reviewers: code, security
`;

function toBuilding(s, risk = 'Low') {
  const id = s.ok('next');
  assert.match(fs.readFileSync(path.join(s.dir, 'factory/backlog.md'), 'utf8'), /- \[x\] Add greeting helper/);
  s.write(`factory/jobs/${id}/spec.md`, '# grill\n');
  s.ok('stage', id, 'planning', '--risk', risk);
  assert.match(s.ok('brief', id, 'planner'), /agents\/planner\.md/);
  s.write(`docs/plans/${id}.md`, plan(risk));
  s.ok('stage', id, 'plan-approval');
  // the builder must not start before human approval
  assert.notEqual(s.cli('worktree', id).status, 0);
  s.ok('approve-plan', id, '--by', 'Test Human');
  const wt = s.ok('worktree', id);
  s.write(path.relative(s.dir, path.join(wt, 'greet.mjs')), 'export const greet = (n) => `Hello, ${n}`;\n');
  s.write(path.relative(s.dir, path.join(wt, 'greet.test.mjs')), "import {test} from 'node:test';\ntest('greets by name', () => {});\n");
  s.write(`factory/jobs/${id}/build.md`, '# Build\n## Round 1\n');
  s.ok('stage', id, 'review');
  return id;
}

test('fallback lifecycle: CHANGES once, rework, PASS, approve, Low-risk merge', () => {
  const s = sandbox();
  const id = toBuilding(s);
  assert.equal(s.job(id).stage, 'review');
  assert.deepEqual(s.job(id).reviews, { code: 'pending', security: 'pending', ux: 'skipped', 'ui-design': 'skipped' });

  s.write(`factory/jobs/${id}/round-1/review-code.md`, 'VERDICT: CHANGES\n\n1. add edge case\n');
  assert.equal(s.cli('round', id).status, 2, 'incomplete round must not advance');
  assert.equal(s.job(id).stage, 'review');
  s.write(`factory/jobs/${id}/round-1/review-security.md`, 'VERDICT: PASS\n');
  s.ok('round', id);
  assert.equal(s.job(id).stage, 'building');
  assert.equal(s.job(id).round, 2);
  s.ok('event', id, 'continuity', '{"mode":"replacement"}');

  s.ok('stage', id, 'review');
  s.write(`factory/jobs/${id}/round-2/review-code.md`, 'VERDICT: PASS\n');
  s.write(`factory/jobs/${id}/round-2/review-security.md`, 'VERDICT: PASS\n');
  s.ok('round', id);
  assert.equal(s.job(id).stage, 'approval');

  s.write(`factory/jobs/${id}/decision.md`, 'APPROVE\n\nCommit-Message: feat(greet): add greeting helper\n');
  s.ok('decide', id); // no approver report yet → must not merge
  assert.equal(s.job(id).stage, 'needs-human', 'missing approver report is an error state');
  assert.match(s.job(id).blocker, /missing approver report/);
  s.write(`docs/review/${id}-round-2.md`, '# report\n');
  s.ok('approve', id, '--by', 'Test Human');
  assert.equal(s.job(id).stage, 'merged');
  const subjects = s.g('log', '--format=%s', 'main').split('\n');
  assert.match(subjects[0], /^chore\(factory\): merge factory\//);
  assert.ok(subjects.includes('feat(greet): add greeting helper'), 'feature commit reachable from main');
  const meta = JSON.parse(fs.readFileSync(path.join(s.dir, `factory/jobs/${id}/job.json`), 'utf8'));
  assert.deepEqual(meta.events.map((e) => e.type).filter((t) => t !== 'worker'),
    ['created', 'plan-approval', 'worktree', 'round-complete', 'continuity', 'round-complete', 'decision', 'human-merge-approval', 'merge']);
  assert.equal(s.board().log.length >= 9, true);
});

test('Low risk APPROVE with report merges directly via merge', () => {
  const s = sandbox();
  const id = toBuilding(s);
  for (const r of ['code', 'security']) s.write(`factory/jobs/${id}/round-1/review-${r}.md`, 'VERDICT: PASS\n');
  s.ok('round', id);
  s.write(`factory/jobs/${id}/decision.md`, 'APPROVE\n\nCommit-Message: feat(greet): add greeting helper\n');
  s.write(`docs/review/${id}-round-1.md`, '# report\n');
  assert.equal(JSON.parse(s.ok('decide', id)).merge, true);
  s.ok('merge', id);
  assert.equal(s.job(id).stage, 'merged');
  assert.ok(!fs.existsSync(path.join(s.dir, `.factory-worktrees/${id}`)), 'worktree removed after merge');
});

test('second CHANGES escalates to needs-human; High risk needs human merge approval', () => {
  const s = sandbox();
  const id = toBuilding(s, 'High');
  for (const n of [1, 2]) {
    s.write(`factory/jobs/${id}/round-${n}/review-code.md`, 'VERDICT: CHANGES\n');
    s.write(`factory/jobs/${id}/round-${n}/review-security.md`, 'VERDICT: PASS\n');
    s.ok('round', id);
    if (n === 1) s.ok('stage', id, 'review');
  }
  assert.equal(s.job(id).stage, 'approval', 'approver must still write the report');
  s.write(`factory/jobs/${id}/decision.md`, 'ESCALATE\n');
  s.write(`docs/review/${id}-round-2.md`, '# report\n');
  s.ok('decide', id);
  assert.equal(s.job(id).stage, 'needs-human');

  // human sends it back with a note → round 3 is allowed only by a human
  s.ok('rework', id, 'please simplify');
  assert.equal(s.job(id).stage, 'building');
  assert.equal(s.job(id).round, 3);
  assert.ok(fs.existsSync(path.join(s.dir, `factory/jobs/${id}/round-2/human-note.md`)));
  s.ok('stage', id, 'review');
  for (const r of ['code', 'security']) s.write(`factory/jobs/${id}/round-3/review-${r}.md`, 'VERDICT: PASS\n');
  s.ok('round', id);
  s.write(`factory/jobs/${id}/decision.md`, 'APPROVE\n\nCommit-Message: feat(greet): add greeting helper\n');
  s.write(`docs/review/${id}-round-3.md`, '# report\n');
  s.ok('decide', id);
  assert.equal(s.job(id).stage, 'merge-approval', 'High risk waits for a human');
  assert.notEqual(s.cli('merge', id).status, 0, 'approver alone cannot merge High risk');
  s.ok('approve', id, '--by', 'Test Human');
  assert.equal(s.job(id).stage, 'merged');
});

test('malformed review output is an error state, not a pass', () => {
  const s = sandbox();
  const id = toBuilding(s);
  s.write(`factory/jobs/${id}/round-1/review-code.md`, 'Looks good to me!\n');
  s.write(`factory/jobs/${id}/round-1/review-security.md`, 'VERDICT: PASS\n');
  s.ok('round', id);
  assert.equal(s.job(id).stage, 'approval', 'blocker goes to the approver for a report first');
  assert.equal(s.job(id).reviews.code, 'error');
  assert.match(s.job(id).blocker, /malformed/);
  // even an APPROVE cannot pass a round containing an error verdict
  s.write(`factory/jobs/${id}/decision.md`, 'APPROVE\n\nCommit-Message: feat: x\n');
  s.write(`docs/review/${id}-round-1.md`, '# report: blocker\n');
  s.ok('decide', id);
  assert.equal(s.job(id).stage, 'needs-human');
  assert.match(s.job(id).blocker, /contradiction/);
});
