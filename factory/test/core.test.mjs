import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canTransition, nextJobId, validateBoard, parseReview, parseDecision, parseAssignedReviewers,
  parsePlanMatrix, evaluateRound, routeDecision, isConventionalCommit, checkLearningsIndex,
  parseFrontMatter, setFrontMatter,
} from '../lib/core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(fs.readFileSync(path.join(here, '../fixtures/sample-board.json'), 'utf8'));

test('sample board and live board are valid', () => {
  assert.deepEqual(validateBoard(sample), []);
  assert.deepEqual(validateBoard(JSON.parse(fs.readFileSync(path.join(here, '../board.json'), 'utf8'))), []);
});

test('validateBoard rejects unknown stages, bad review values and duplicate ids', () => {
  const job = { id: '001-x', stage: 'shipping', round: 1, reviews: { code: 'LGTM' }, rounds: [], files: [] };
  const errors = validateBoard({ version: 1, jobs: [job, { ...job, stage: 'review', reviews: {} }], log: [] });
  assert.ok(errors.some((e) => e.includes('unknown stage')));
  assert.ok(errors.some((e) => e.includes('invalid value')));
  assert.ok(errors.some((e) => e.includes('duplicate id')));
});

test('transitions follow the loop', () => {
  assert.ok(canTransition('plan-approval', 'building'));
  assert.ok(canTransition('review', 'building'));
  assert.ok(!canTransition('brainstorm', 'building'), 'cannot skip planning/approval');
  assert.ok(!canTransition('merged', 'building'), 'terminal');
});

test('nextJobId increments and slugs', () => {
  assert.equal(nextJobId(['001-a', '007-b'], 'Rate Limiting!'), '008-rate-limiting');
  assert.equal(nextJobId([], 'Slugify util', { dryRun: true }), '001-dry-run-slugify-util');
});

test('verdict and decision parsing is strict on line 1', () => {
  assert.deepEqual(parseReview('VERDICT: PASS\n...'), { ok: true, verdict: 'PASS' });
  assert.equal(parseReview('VERDICT: CHANGES').verdict, 'CHANGES');
  assert.equal(parseReview('verdict: pass').ok, false);
  assert.equal(parseReview('\nVERDICT: PASS').ok, false);
  assert.equal(parseReview(undefined).ok, false);
  const d = parseDecision('APPROVE\n\nCommit-Message: feat(x): add y\n');
  assert.deepEqual(d, { ok: true, decision: 'APPROVE', commitMessage: 'feat(x): add y' });
  assert.equal(parseDecision('Approve').ok, false);
});

test('assigned reviewers line', () => {
  assert.deepEqual(parseAssignedReviewers('x\nAssigned reviewers: code, security\n').roles, ['code', 'security']);
  assert.deepEqual(parseAssignedReviewers('**Assigned reviewers:** `code`, `ux`').roles, ['code', 'ux']);
  assert.equal(parseAssignedReviewers('Assigned reviewers: code, wizard').ok, false);
  assert.equal(parseAssignedReviewers('nothing').ok, false);
});

test('plan matrix requires exactly one test row per AC', () => {
  const plan = [
    '- AC-001: does a', '- AC-002: does b',
    '| ID | Acceptance criterion | Test file or test name | Test level | Expected initial state | Result |',
    '|---|---|---|---|---|---|',
    '| AC-001 | a | `t/a.test.mjs` / `does a` | unit | failing | pending |',
  ].join('\n');
  const m = parsePlanMatrix(plan);
  assert.deepEqual(m.acs, ['AC-001', 'AC-002']);
  assert.equal(m.rows[0].testName, 'does a');
  assert.ok(m.problems.some((p) => p.includes('AC-002 has 0')));
  const dup = parsePlanMatrix(`${plan}\n| AC-002 | b | \`t\` / \`b\` | unit | failing | pending |\n| AC-002 | b | \`t\` / \`b2\` | unit | failing | pending |`);
  assert.ok(dup.problems.some((p) => p.includes('AC-002 has 2')));
});

test('evaluateRound: waits, reworks once, then escalates; malformed is an error', () => {
  const required = ['code', 'security'];
  assert.equal(evaluateRound({ round: 1, required, files: { code: 'VERDICT: PASS' } }).next, 'wait');
  assert.equal(evaluateRound({ round: 1, required, files: { code: 'VERDICT: PASS', security: 'VERDICT: PASS' } }).next, 'approval');
  assert.equal(evaluateRound({ round: 1, required, files: { code: 'VERDICT: CHANGES', security: 'VERDICT: PASS' } }).next, 'rework');
  assert.equal(evaluateRound({ round: 2, required, files: { code: 'VERDICT: CHANGES', security: 'VERDICT: PASS' } }).next, 'approval-escalate');
  const bad = evaluateRound({ round: 1, required, files: { code: 'LGTM', security: 'VERDICT: PASS' } });
  assert.equal(bad.next, 'approval-escalate', 'blockers still get an approver report');
  assert.equal(bad.reviews.code, 'error');
});

test('routeDecision: risk gates and contradictions', () => {
  const pass = { code: 'PASS', ux: 'skipped' };
  assert.equal(routeDecision({ decision: 'APPROVE', risk: 'Low', reviews: pass }).merge, true);
  assert.equal(routeDecision({ decision: 'APPROVE', risk: 'High', reviews: pass }).stage, 'merge-approval');
  assert.equal(routeDecision({ decision: 'ESCALATE', risk: 'Low', reviews: pass }).stage, 'needs-human');
  assert.match(routeDecision({ decision: 'APPROVE', risk: 'Low', reviews: { code: 'CHANGES' } }).reason, /contradiction/);
});

test('Conventional Commits 1.0.0', () => {
  for (const ok of ['feat: add x', 'fix(api): handle null', 'feat(slugify)!: drop v1', 'docs(factory): note']) assert.ok(isConventionalCommit(ok), ok);
  for (const bad of ['Add x', 'feat:add x', 'feat(): x', 'FEAT: x', 'feat x']) assert.ok(!isConventionalCommit(bad), bad);
});

test('learnings index: placeholder, word limit, coverage', () => {
  const tpl = '- [<Learning title>](<learning-file>.md) — <one-sentence explanation of why it matters.>';
  assert.ok(checkLearningsIndex(tpl, []).some((p) => p.includes('placeholder')));
  const long = `- [T](a.md) — ${'word '.repeat(101)}`;
  assert.ok(checkLearningsIndex(long, ['a.md']).some((p) => p.includes('exceeds')));
  assert.deepEqual(checkLearningsIndex('- [T](a.md) — matters because.', ['a.md']), []);
  assert.ok(checkLearningsIndex('', ['a.md']).some((p) => p.includes('not indexed')));
});

test('front matter read/write keeps other keys', () => {
  const doc = '---\nplan-id: 001\nplan-approval: pending\n---\n# body\n';
  const out = setFrontMatter(doc, { 'plan-approval': 'approved', 'plan-approved-by': '"Ana"' });
  assert.deepEqual(parseFrontMatter(out), { 'plan-id': '001', 'plan-approval': 'approved', 'plan-approved-by': 'Ana' });
  assert.ok(out.endsWith('# body\n'));
});
