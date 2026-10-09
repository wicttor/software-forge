// Pure, side-effect-free factory logic. Everything here is unit-tested in
// test/core.test.mjs; file and git I/O lives in src/factory.mjs.

export const STAGES = [
  'brainstorm', 'planning', 'plan-approval', 'building', 'review', 'approval',
  'merge-approval', 'needs-human', 'merged', 'committed', 'failed',
];

export const REVIEW_VALUES = ['pending', 'PASS', 'CHANGES', 'skipped', 'error'];

export const REVIEWER_ROLES = [
  'security', 'ux', 'ui-design', 'code', 'accessibility', 'data', 'infrastructure', 'performance',
];

export const WORKER_ROLES = ['planner', 'builder', 'approver', ...REVIEWER_ROLES];

export const MAX_ROUNDS = 2;

// Allowed board transitions. `needs-human` can return anywhere a human sends it.
export const TRANSITIONS = {
  brainstorm: ['planning', 'needs-human', 'failed'],
  planning: ['plan-approval', 'needs-human', 'failed'],
  'plan-approval': ['building', 'planning', 'needs-human', 'failed'],
  building: ['review', 'needs-human', 'failed'],
  review: ['approval', 'building', 'needs-human', 'failed'],
  approval: ['merged', 'committed', 'merge-approval', 'needs-human', 'failed'],
  'merge-approval': ['merged', 'committed', 'needs-human', 'failed'],
  'needs-human': ['planning', 'building', 'approval', 'merged', 'committed', 'failed'],
  merged: [],
  committed: [],
  failed: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 5)
    .join('-');
}

export function nextJobId(existingIds, feature, { dryRun = false } = {}) {
  const max = existingIds
    .map((id) => parseInt(String(id).slice(0, 3), 10))
    .filter(Number.isFinite)
    .reduce((a, b) => Math.max(a, b), 0);
  const slug = slugify(feature) || 'job';
  return `${String(max + 1).padStart(3, '0')}-${dryRun ? 'dry-run-' : ''}${slug}`;
}

/** Returns a list of human-readable problems; empty list means valid. */
export function validateBoard(board) {
  const errors = [];
  if (!board || typeof board !== 'object') return ['board is not an object'];
  if (board.version !== 1) errors.push('version must be 1');
  if (!Array.isArray(board.jobs)) return [...errors, 'jobs must be an array'];
  if (!Array.isArray(board.log)) errors.push('log must be an array');
  const seen = new Set();
  for (const job of board.jobs) {
    const where = `job ${job?.id ?? '?'}`;
    if (!/^\d{3}-[a-z0-9-]+$/.test(job?.id ?? '')) errors.push(`${where}: invalid id`);
    if (seen.has(job.id)) errors.push(`${where}: duplicate id`);
    seen.add(job.id);
    if (!STAGES.includes(job.stage)) errors.push(`${where}: unknown stage "${job.stage}"`);
    if (!Number.isInteger(job.round) || job.round < 0) errors.push(`${where}: round must be an integer >= 0`);
    for (const [role, v] of Object.entries(job.reviews || {})) {
      if (!REVIEW_VALUES.includes(v)) errors.push(`${where}: review ${role} has invalid value "${v}"`);
    }
    if (!Array.isArray(job.rounds)) errors.push(`${where}: rounds must be an array`);
    if (!Array.isArray(job.files)) errors.push(`${where}: files must be an array`);
  }
  return errors;
}

/** First line must be exactly `VERDICT: PASS` or `VERDICT: CHANGES`. */
export function parseReview(text) {
  if (typeof text !== 'string') return { ok: false, error: 'missing' };
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0];
  if (first === 'VERDICT: PASS') return { ok: true, verdict: 'PASS' };
  if (first === 'VERDICT: CHANGES') return { ok: true, verdict: 'CHANGES' };
  return { ok: false, error: `malformed first line: ${JSON.stringify(first)}` };
}

/** First line must be exactly `APPROVE` or `ESCALATE`. */
export function parseDecision(text) {
  if (typeof text !== 'string') return { ok: false, error: 'missing' };
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0];
  if (first === 'APPROVE' || first === 'ESCALATE') {
    const msg = text.match(/^Commit-Message:\s*(.+)$/m);
    return { ok: true, decision: first, commitMessage: msg ? msg[1].trim() : null };
  }
  return { ok: false, error: `malformed first line: ${JSON.stringify(first)}` };
}

export function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text || '');
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1').trim();
  }
  return out;
}

export function setFrontMatter(text, updates) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) throw new Error('document has no front matter');
  let body = m[1];
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}:.*$`, 'm');
    const line = `${key}: ${value}`;
    body = re.test(body) ? body.replace(re, line) : `${body}\n${line}`;
  }
  return text.replace(m[1], body);
}

/** Parses the planner's machine-readable `Assigned reviewers: code, security` line. */
export function parseAssignedReviewers(planText) {
  const m = /^\s*(?:\*\*)?Assigned reviewers:?(?:\*\*)?:?\s*(.+)$/im.exec(planText || '');
  if (!m) return { ok: false, error: 'plan has no "Assigned reviewers:" line' };
  const roles = m[1].replace(/[`*.]/g, '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const unknown = roles.filter((r) => !REVIEWER_ROLES.includes(r));
  if (unknown.length) return { ok: false, error: `unknown reviewer roles: ${unknown.join(', ')}` };
  if (!roles.length) return { ok: false, error: 'no reviewers assigned' };
  return { ok: true, roles: [...new Set(roles)] };
}

/** Acceptance criteria and the AC-to-test matrix from a plan built on plan-template.md. */
export function parsePlanMatrix(planText) {
  const text = planText || '';
  const acs = [...text.matchAll(/^\s*-\s*(AC-\d+):/gm)].map((m) => m[1]);
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length >= 4 && /^AC-\d+$/.test(cells[0])) {
      const ticks = [...cells[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      rows.push({ id: cells[0], criterion: cells[1], testFile: ticks[0] ?? null, testName: ticks[1] ?? null, level: cells[3] });
    }
  }
  const problems = [];
  const uniqueAcs = [...new Set(acs)];
  for (const ac of uniqueAcs) {
    const n = rows.filter((r) => r.id === ac).length;
    if (n !== 1) problems.push(`${ac} has ${n} matrix rows (exactly 1 required)`);
  }
  for (const r of rows) {
    if (!uniqueAcs.includes(r.id)) problems.push(`${r.id} in matrix but not in Acceptance Criteria`);
    if (!r.testFile || !r.testName) problems.push(`${r.id} matrix row lacks \`file\` / \`test name\``);
  }
  if (!uniqueAcs.length) problems.push('plan has no acceptance criteria');
  return { acs: uniqueAcs, rows, problems };
}

/**
 * Decide what happens after a review round, given the required roles and the
 * raw text of each review file (undefined when the file does not exist yet).
 */
export function evaluateRound({ round, required, files }) {
  const reviews = {};
  const missing = [];
  const malformed = [];
  for (const role of required) {
    const text = files[role];
    if (text === undefined) { reviews[role] = 'pending'; missing.push(role); continue; }
    const r = parseReview(text);
    if (!r.ok) { reviews[role] = 'error'; malformed.push(`${role}: ${r.error}`); continue; }
    reviews[role] = r.verdict;
  }
  const changes = required.filter((r) => reviews[r] === 'CHANGES');
  let next;
  if (malformed.length) next = 'approval-escalate'; // blocker: approver reports, then ESCALATE
  else if (missing.length) next = 'wait';
  else if (!changes.length) next = 'approval';
  else if (round < MAX_ROUNDS) next = 'rework';
  else next = 'approval-escalate';
  return { complete: !missing.length && !malformed.length, reviews, missing, malformed, changes, next };
}

/** Where an approver decision routes the job. */
export function routeDecision({ decision, risk, reviews }) {
  const notPassed = Object.entries(reviews || {}).filter(([, v]) => v !== 'PASS' && v !== 'skipped');
  if (decision === 'APPROVE' && notPassed.length) {
    return { stage: 'needs-human', reason: `contradiction: APPROVE while ${notPassed.map(([k, v]) => `${k}=${v}`).join(', ')}` };
  }
  if (decision === 'ESCALATE') return { stage: 'needs-human', reason: 'approver escalated' };
  if (decision !== 'APPROVE') return { stage: 'needs-human', reason: 'malformed decision' };
  if (risk === 'High' || risk === 'Critical') return { stage: 'merge-approval', reason: `${risk} risk requires human merge approval` };
  if (risk === 'Low' || risk === 'Medium') return { stage: 'approval', reason: 'merge authorized', merge: true };
  return { stage: 'needs-human', reason: `unknown risk "${risk}"` };
}

// Conventional Commits 1.0.0: <type>[optional scope][!]: <description>
export const CONVENTIONAL_COMMIT = /^[a-z][a-z0-9]*(\([a-z0-9][a-z0-9._/-]*\))?!?: \S.*$/;

export function isConventionalCommit(message) {
  return CONVENTIONAL_COMMIT.test(String(message).split(/\r?\n/, 1)[0]);
}

/** Checks docs/learnings/index.md: one linked sentence <= 100 words per entry. */
export function checkLearningsIndex(indexText, learningFiles) {
  const problems = [];
  const entries = (indexText || '').split(/\r?\n/).filter((l) => /^\s*-\s*\[/.test(l));
  for (const line of entries) {
    if (line.includes('<learning-file>')) { problems.push('template placeholder line still present'); continue; }
    const words = line.replace(/\[[^\]]*\]\([^)]*\)/, 'LINK').trim().split(/\s+/).length - 1;
    if (words > 100) problems.push(`entry exceeds 100 words (${words}): ${line.slice(0, 60)}…`);
  }
  for (const f of learningFiles) {
    if (!entries.some((l) => l.includes(`(${f})`))) problems.push(`learning ${f} is not indexed`);
  }
  return problems;
}
