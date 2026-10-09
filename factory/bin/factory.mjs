#!/usr/bin/env node
// Software factory CLI — the orchestrator's state tool and the manual fallback.
// Usage: node factory/bin/factory.mjs <command> [...args]   (see factory/orchestrator.md)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  STAGES, REVIEWER_ROLES, WORKER_ROLES, canTransition, nextJobId, validateBoard,
  parseFrontMatter, setFrontMatter, parseAssignedReviewers, parsePlanMatrix, parseDecision,
  parseReview, evaluateRound, routeDecision, isConventionalCommit, checkLearningsIndex,
} from '../lib/core.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FACTORY = path.join(REPO, 'factory');
const BOARD = path.join(FACTORY, 'board.json');
const JOBS = path.join(FACTORY, 'jobs');
const rel = (p) => path.relative(REPO, p);
const now = () => new Date().toISOString();

// ---------- small I/O helpers ----------
const readText = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : undefined);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
function writeJsonAtomic(p, data) {
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  JSON.parse(fs.readFileSync(tmp, 'utf8')); // must round-trip before replacing
  fs.renameSync(tmp, p);
}
function die(msg, code = 1) { console.error(`factory: ${msg}`); process.exit(code); }
function git(args, cwd = REPO) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function hasGit() { try { git(['rev-parse', '--git-dir']); return true; } catch { return false; } }
function flag(args, name, fallback = undefined) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}
function boolFlag(args, name) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

// ---------- board (orchestrator is the only writer) ----------
function loadBoard() {
  const board = readJson(BOARD);
  const errors = validateBoard(board);
  if (errors.length) die(`board.json invalid:\n  ${errors.join('\n  ')}`);
  return board;
}
function saveBoard(board) {
  board.updatedAt = now();
  const errors = validateBoard(board);
  if (errors.length) die(`refusing to write invalid board.json:\n  ${errors.join('\n  ')}`);
  writeJsonAtomic(BOARD, board);
}
function findJob(board, id) {
  const job = board.jobs.find((j) => j.id === id);
  if (!job) die(`no job "${id}" on the board`);
  return job;
}
function transition(board, job, to, note = '') {
  if (!STAGES.includes(to)) die(`unknown stage "${to}"`);
  if (job.stage !== to && !canTransition(job.stage, to)) die(`illegal transition ${job.stage} -> ${to} for ${job.id}`);
  board.log.push({ at: now(), job: job.id, from: job.stage, to, note });
  job.stage = to;
  job.updatedAt = now();
  refreshFiles(job);
}
function refreshFiles(job) {
  const dir = path.join(JOBS, job.id);
  const found = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(md|json)$/.test(e.name)) found.push(rel(p));
    }
  };
  walk(dir);
  for (const p of [`docs/plans/${job.id}.md`]) if (fs.existsSync(path.join(REPO, p))) found.push(p);
  for (const dir2 of ['docs/review', 'docs/learnings']) {
    const d = path.join(REPO, dir2);
    if (fs.existsSync(d)) for (const f of fs.readdirSync(d).sort()) if (f.startsWith(`${job.id}-`)) found.push(`${dir2}/${f}`);
  }
  job.files = found;
}

// ---------- job.json: write-once core + append-only events ----------
const jobDir = (id) => path.join(JOBS, id);
const jobJsonPath = (id) => path.join(jobDir(id), 'job.json');
const loadJob = (id) => {
  if (!fs.existsSync(jobJsonPath(id))) die(`missing ${rel(jobJsonPath(id))}`);
  return readJson(jobJsonPath(id));
};
function appendEvent(id, event) {
  const job = loadJob(id);
  job.events.push({ at: now(), ...event });
  writeJsonAtomic(jobJsonPath(id), job);
  return job;
}
const planPath = (id) => path.join(REPO, 'docs/plans', `${id}.md`);
function loadPlan(id) {
  const text = readText(planPath(id));
  if (text === undefined) die(`missing plan ${rel(planPath(id))}`);
  return text;
}

// ---------- commands ----------
const commands = {
  run(args) {
    const dryRun = boolFlag(args, 'dry-run');
    const forceChanges = flag(args, 'force-changes'); // dry-run only, e.g. "code"
    const feature = args.join(' ').trim();
    if (!feature) die('usage: run "<feature>" [--dry-run] [--force-changes <role>]');
    const board = loadBoard();
    const existing = [
      ...board.jobs.map((j) => j.id),
      ...(fs.existsSync(JOBS) ? fs.readdirSync(JOBS).filter((d) => /^\d{3}-/.test(d)) : []),
    ];
    const id = nextJobId(existing, feature, { dryRun });
    const branch = `factory/${id}`;
    let baseBranch = null;
    if (hasGit()) baseBranch = dryRun ? 'factory/dry-run-base' : git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const job = {
      id,
      title: feature.length > 80 ? `${feature.slice(0, 77)}…` : feature,
      feature,
      createdAt: now(),
      branch,
      baseBranch,
      dryRun,
      worktreePath: `.factory-worktrees/${id}`,
      runtime: {
        name: process.env.FACTORY_RUNTIME || 'unspecified',
        adapter: 'factory/runtime-adapter.md',
      },
      ...(dryRun && forceChanges ? { dryRunOptions: { forceChanges: { round: 1, role: forceChanges } } } : {}),
      events: [{ at: now(), type: 'created' }],
    };
    fs.mkdirSync(jobDir(id), { recursive: true });
    writeJsonAtomic(jobJsonPath(id), job);
    const card = {
      id, title: job.title, branch, stage: 'brainstorm', round: 0, risk: null, complexity: null,
      reviews: {}, rounds: [], files: [], runtime: 'documented in factory/runtime-adapter.md',
      dryRun, updatedAt: now(),
    };
    board.jobs.push(card);
    board.log.push({ at: now(), job: id, from: null, to: 'brainstorm', note: 'job created' });
    refreshFiles(card);
    saveBoard(board);
    console.log(id);
    console.error(`next: grill the human, write ${rel(jobDir(id))}/spec.md, then \`factory stage ${id} planning\``);
  },

  next() {
    const backlog = path.join(FACTORY, 'backlog.md');
    const text = readText(backlog) ?? die('missing factory/backlog.md');
    const m = /^- \[ \] (.+)$/m.exec(text);
    if (!m) die('backlog has no unchecked items');
    const before = new Set(loadBoard().jobs.map((j) => j.id));
    commands.run([m[1].trim()]);
    const id = loadBoard().jobs.map((j) => j.id).find((j) => !before.has(j));
    fs.writeFileSync(backlog, text.replace(m[0], `- [x] ${m[1].trim()} (job \`${id}\`)`));
  },

  stage(args) {
    const note = flag(args, 'note', '');
    const risk = flag(args, 'risk');
    const complexity = flag(args, 'complexity');
    const blocker = flag(args, 'blocker');
    const [id, to] = args;
    if (!id || !to) die('usage: stage <id> <stage> [--note ...] [--risk ...] [--complexity ...] [--blocker ...]');
    const board = loadBoard();
    const job = findJob(board, id);
    if (risk) job.risk = risk;
    if (complexity) job.complexity = complexity;
    if (blocker) job.blocker = blocker;
    if (to === 'review') job.reviews = Object.fromEntries(Object.entries(job.reviews).map(([k, v]) => [k, v === 'skipped' ? v : 'pending']));
    transition(board, job, to, note);
    saveBoard(board);
    console.log(`${id}: ${to}`);
  },

  event(args) {
    const [id, type, json] = args;
    if (!id || !type) die('usage: event <id> <type> [json-object]');
    const extra = json ? JSON.parse(json) : {};
    appendEvent(id, { type, ...extra });
    console.log(`${id}: event ${type} recorded`);
  },

  'approve-plan'(args) {
    const by = flag(args, 'by');
    const [id] = args;
    if (!id || !by) die('usage: approve-plan <id> --by "<human identifier>"   (record ONLY an explicit human approval)');
    const plan = loadPlan(id);
    const fm = parseFrontMatter(plan);
    if (!fm) die('plan has no front matter');
    const matrix = parsePlanMatrix(plan);
    if (matrix.problems.length) die(`plan matrix problems:\n  ${matrix.problems.join('\n  ')}`);
    const assigned = parseAssignedReviewers(plan);
    if (!assigned.ok) die(assigned.error);
    const today = now().slice(0, 10);
    fs.writeFileSync(planPath(id), setFrontMatter(plan, {
      'plan-approval': 'approved', 'plan-approved-by': `"${by}"`, 'plan-approved-at': today,
    }));
    appendEvent(id, { type: 'plan-approval', by, reviewers: assigned.roles });
    const board = loadBoard();
    const job = findJob(board, id);
    job.risk = fm.risk && !fm.risk.includes('|') ? fm.risk : job.risk;
    job.complexity = fm.complexity && !fm.complexity.includes('|') ? fm.complexity : job.complexity;
    job.round = 1;
    job.reviews = Object.fromEntries([
      ...assigned.roles.map((r) => [r, 'pending']),
      ...['ux', 'ui-design'].filter((r) => !assigned.roles.includes(r)).map((r) => [r, 'skipped']),
    ]);
    transition(board, job, 'building', `plan approved by ${by}; reviewers: ${assigned.roles.join(', ')}`);
    saveBoard(board);
    console.log(`${id}: plan approved by ${by}; reviewers ${assigned.roles.join(', ')}`);
  },

  worktree(args) {
    const [id] = args;
    if (!id) die('usage: worktree <id>');
    if (!hasGit()) die('no VCS available: worktree isolation impossible — stop and report (see runtime-adapter.md)');
    const job = loadJob(id);
    const fm = parseFrontMatter(loadPlan(id));
    if (fm?.['plan-approval'] !== 'approved') die('plan is not human-approved; builder may not start');
    const wt = path.join(REPO, job.worktreePath);
    if (fs.existsSync(wt)) { console.log(wt); return; }
    const branches = git(['branch', '--list', job.baseBranch]);
    if (!branches) {
      if (!job.dryRun) die(`base branch ${job.baseBranch} does not exist`);
      git(['branch', job.baseBranch, 'HEAD']);
    }
    git(['worktree', 'add', '-b', job.branch, wt, job.baseBranch]);
    appendEvent(id, { type: 'worktree', path: job.worktreePath, branch: job.branch, base: job.baseBranch });
    console.log(wt);
  },

  brief(args) {
    const [id, role] = args;
    if (!id || !WORKER_ROLES.includes(role)) die(`usage: brief <id> <role>  (roles: ${WORKER_ROLES.join(', ')})`);
    const job = loadJob(id);
    const card = findJob(loadBoard(), id);
    const roleFile = REVIEWER_ROLES.includes(role) ? `${role}-reviewer.md` : `${role}.md`;
    const n = Math.max(card.round, 1);
    const wt = path.join(REPO, job.worktreePath);
    const outputs = {
      planner: [`${REPO}/docs/plans/${id}.md`],
      builder: [`${REPO}/factory/jobs/${id}/build.md`, `${wt}/** (implementation + tests, on branch ${job.branch})`],
      approver: [
        `${REPO}/factory/jobs/${id}/decision.md`, `${REPO}/docs/review/${id}-round-${n}.md`,
        `${REPO}/docs/learnings/${id}-<short-topic>.md and ${REPO}/docs/learnings/index.md (only when warranted)`,
      ],
    }[role] ?? [`${REPO}/factory/jobs/${id}/round-${n}/review-${role}.md`];
    const prev = n > 1 ? `${REPO}/factory/jobs/${id}/round-${n - 1}/` : null;
    console.log(`You are the factory's ${role} worker for job ${id}.

Read and follow your role contract exactly: ${REPO}/factory/agents/${roleFile}
Your only context is files; do not rely on conversation history.

Job context:
- <repo> (main checkout): ${REPO}
- <worktree>: ${wt}
- <job-id>: ${id}
- <n> (current round): ${n}
- branch: ${job.branch} (base: ${job.baseBranch})
- job metadata: ${REPO}/factory/jobs/${id}/job.json
- spec (brainstorm/grill result): ${REPO}/factory/jobs/${id}/spec.md
- plan: ${REPO}/docs/plans/${id}.md
- build log: ${REPO}/factory/jobs/${id}/build.md${prev ? `\n- previous round feedback: ${prev} (read every file)` : ''}
- templates: ${REPO}/docs/templates/

You may write ONLY:
${outputs.map((o) => `- ${o}`).join('\n')}

Never write factory/board.json or job.json, never overwrite another worker's file, never commit, merge or push.
When finished, reply with one line: the path(s) you wrote and your verdict/decision if applicable.`);
  },

  round(args) {
    const [id] = args;
    if (!id) die('usage: round <id>');
    const board = loadBoard();
    const job = findJob(board, id);
    if (job.stage !== 'review') die(`${id} is in stage ${job.stage}, not review`);
    const assigned = parseAssignedReviewers(loadPlan(id));
    if (!assigned.ok) die(assigned.error);
    const dir = path.join(jobDir(id), `round-${job.round}`);
    const files = Object.fromEntries(assigned.roles.map((r) => [r, readText(path.join(dir, `review-${r}.md`))]));
    const result = evaluateRound({ round: job.round, required: assigned.roles, files });
    job.reviews = { ...job.reviews, ...result.reviews };
    const entry = { round: job.round, reviews: { ...job.reviews } };
    job.rounds = [...job.rounds.filter((r) => r.round !== job.round), entry];
    if (result.next === 'wait') {
      saveBoard(board);
      console.log(JSON.stringify(result, null, 2));
      die(`round ${job.round} incomplete; waiting for: ${result.missing.join(', ')}`, 2);
    }
    appendEvent(id, { type: 'round-complete', round: job.round, reviews: result.reviews, next: result.next });
    if (result.next === 'rework') {
      transition(board, job, 'building', `round ${job.round} CHANGES (${result.changes.join(', ')}): back to builder`);
      job.round += 1;
      job.reviews = Object.fromEntries(Object.entries(job.reviews).map(([k, v]) => [k, v === 'skipped' ? v : 'pending']));
    } else {
      if (result.malformed.length) job.blocker = `malformed review output: ${result.malformed.join('; ')}`;
      const note = result.malformed.length
        ? `${job.blocker}: approver must report and ESCALATE`
        : result.next === 'approval-escalate'
          ? `round ${job.round} CHANGES after max rounds: approver must report and ESCALATE`
          : `round ${job.round} all PASS`;
      transition(board, job, 'approval', note);
    }
    saveBoard(board);
    console.log(JSON.stringify(result, null, 2));
  },

  decide(args) {
    const [id] = args;
    if (!id) die('usage: decide <id>');
    const board = loadBoard();
    const job = findJob(board, id);
    if (job.stage !== 'approval') die(`${id} is in stage ${job.stage}, not approval`);
    const report = path.join(REPO, 'docs/review', `${id}-round-${job.round}.md`);
    const d = parseDecision(readText(path.join(jobDir(id), 'decision.md')));
    let route;
    if (!d.ok) route = { stage: 'needs-human', reason: `decision.md ${d.error}` };
    else if (!fs.existsSync(report)) route = { stage: 'needs-human', reason: `missing approver report ${rel(report)}` };
    else if (d.decision === 'APPROVE' && !isConventionalCommit(d.commitMessage ?? '')) route = { stage: 'needs-human', reason: `Commit-Message is not a Conventional Commit: ${d.commitMessage}` };
    else route = routeDecision({ decision: d.decision, risk: job.risk, reviews: job.reviews });
    appendEvent(id, { type: 'decision', decision: d.decision ?? null, route: route.stage, reason: route.reason });
    if (route.stage === 'needs-human') job.blocker = route.reason;
    if (route.stage !== job.stage) transition(board, job, route.stage, route.reason);
    else { board.log.push({ at: now(), job: id, from: job.stage, to: job.stage, note: route.reason }); refreshFiles(job); }
    saveBoard(board);
    console.log(JSON.stringify(route));
    if (route.merge) console.error(`next: factory merge ${id}`);
  },

  merge(args, { humanApproved = false } = {}) {
    const message = flag(args, 'message');
    const [id] = args;
    if (!id) die('usage: merge <id> [--message "<conventional commit>"]');
    const board = loadBoard();
    const job = findJob(board, id);
    const meta = loadJob(id);
    const d = parseDecision(readText(path.join(jobDir(id), 'decision.md')));
    const authorized = humanApproved
      || (job.stage === 'approval' && d.ok && d.decision === 'APPROVE' && ['Low', 'Medium'].includes(job.risk));
    if (!authorized) die(`${id}: merge not authorized (stage ${job.stage}, decision ${d.decision ?? d.error}, risk ${job.risk}); a human must run \`factory approve ${id}\``);
    const msg = message || d.commitMessage;
    if (!isConventionalCommit(msg ?? '')) die(`commit message is not Conventional Commits 1.0.0: ${msg}`);
    const wt = path.join(REPO, meta.worktreePath);
    if (!hasGit() || !fs.existsSync(wt)) {
      // Commit-equivalent fallback: no VCS → record the intended commit, never claim a merge.
      fs.writeFileSync(path.join(jobDir(id), 'commit-equivalent.md'), `# Commit equivalent\n\nMessage: ${msg}\n\nNo VCS/worktree available; no merge occurred.\n`);
      transition(board, job, 'committed', 'commit-equivalent artifact written; no merge');
      saveBoard(board);
      return console.log(`${id}: committed (commit-equivalent only, no merge)`);
    }
    git(['add', '-A'], wt);
    git(['commit', '-m', msg], wt);
    const commit = git(['rev-parse', 'HEAD'], wt);
    const mergeMsg = `chore(factory): merge ${meta.branch}`;
    const current = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    let mergeSha;
    if (current === meta.baseBranch) {
      git(['merge', '--no-ff', '-m', mergeMsg, meta.branch]);
      mergeSha = git(['rev-parse', 'HEAD']);
    } else {
      // Base not checked out here (e.g. the disposable dry-run base): merge in a scratch worktree.
      const tmp = path.join(REPO, '.factory-worktrees', `_merge-${id}`);
      git(['worktree', 'add', tmp, meta.baseBranch]);
      try {
        git(['merge', '--no-ff', '-m', mergeMsg, meta.branch], tmp);
        mergeSha = git(['rev-parse', 'HEAD'], tmp);
      } finally {
        git(['worktree', 'remove', '--force', tmp]);
      }
    }
    git(['worktree', 'remove', wt]);
    appendEvent(id, { type: 'merge', commit, commitMessage: msg, mergeCommit: mergeSha, into: meta.baseBranch, humanApproved });
    transition(board, job, 'merged', `${msg} → ${meta.baseBranch} (${mergeSha.slice(0, 8)})`);
    delete job.blocker;
    saveBoard(board);
    console.log(`${id}: merged ${commit.slice(0, 8)} into ${meta.baseBranch} as ${mergeSha.slice(0, 8)}`);
  },

  approve(args) {
    const by = flag(args, 'by', process.env.USER || 'human');
    const [id] = args;
    if (!id) die('usage: approve <id> [--by <human>] [--message "<conventional commit>"]');
    const job = findJob(loadBoard(), id);
    if (!['merge-approval', 'needs-human'].includes(job.stage)) die(`${id} is in stage ${job.stage}; approve is for merge-approval/needs-human jobs`);
    appendEvent(id, { type: 'human-merge-approval', by });
    commands.merge(args, { humanApproved: true });
  },

  rework(args) {
    const [id, ...rest] = args;
    const note = rest.join(' ').trim();
    if (!id || !note) die('usage: rework <id> "<note>"');
    const board = loadBoard();
    const job = findJob(board, id);
    if (['merged', 'committed', 'failed'].includes(job.stage)) die(`${id} is ${job.stage}; start a new job instead`);
    const next = Math.max(job.round, 0) + 1;
    const dir = path.join(jobDir(id), `round-${job.round}`);
    fs.mkdirSync(dir, { recursive: true });
    const notePath = path.join(dir, 'human-note.md');
    if (fs.existsSync(notePath)) die(`${rel(notePath)} already exists`);
    fs.writeFileSync(notePath, `# Human rework note (after round ${job.round})\n\n${note}\n`);
    appendEvent(id, { type: 'human-rework', note, fromRound: job.round, toRound: next });
    if (job.round > 0) job.rounds = [...job.rounds.filter((r) => r.round !== job.round), { round: job.round, reviews: { ...job.reviews } }];
    if (job.stage !== 'needs-human' && job.stage !== 'building') transition(board, job, 'needs-human', 'human requested rework');
    if (job.stage !== 'building') transition(board, job, 'building', `human rework: ${note.slice(0, 80)}`);
    job.round = next;
    job.reviews = Object.fromEntries(Object.entries(job.reviews).map(([k, v]) => [k, v === 'skipped' ? v : 'pending']));
    delete job.blocker;
    saveBoard(board);
    console.log(`${id}: back to builder for round ${next}; note at ${rel(notePath)}`);
  },

  verify(args) {
    const [id] = args;
    const problems = [];
    const ok = [];
    const check = (cond, msg) => (cond ? ok : problems).push(msg);
    const required = [
      'factory/orchestrator.md', 'factory/runtime-adapter.md', 'factory/board.json', 'factory/backlog.md',
      ...['planner', 'builder', 'approver'].map((r) => `factory/agents/${r}.md`),
      ...REVIEWER_ROLES.map((r) => `factory/agents/${r}-reviewer.md`),
      'factory/dashboard/package.json', 'docs/templates/plan-template.md', 'docs/templates/review-template.md',
      'docs/templates/learnings-template.md', 'docs/learnings/index.md',
    ];
    for (const f of required) check(fs.existsSync(path.join(REPO, f)), `exists: ${f}`);
    let board;
    try { board = readJson(BOARD); const e = validateBoard(board); check(!e.length, `board.json valid${e.length ? `: ${e.join('; ')}` : ''}`); } catch (e) { check(false, `board.json parses: ${e.message}`); }
    const learnDir = path.join(REPO, 'docs/learnings');
    const learnings = fs.readdirSync(learnDir).filter((f) => f.endsWith('.md') && f !== 'index.md');
    const idx = checkLearningsIndex(readText(path.join(learnDir, 'index.md')), learnings);
    check(!idx.length, `learnings index (${learnings.length} entries)${idx.length ? `: ${idx.join('; ')}` : ''}`);

    if (id) {
      const meta = loadJob(id);
      const plan = readText(planPath(id));
      check(plan !== undefined, `plan exists: docs/plans/${id}.md`);
      if (plan) {
        const fm = parseFrontMatter(plan) || {};
        check(fm['plan-approval'] === 'approved' && fm['plan-approved-by'], 'plan has recorded human approval');
        const m = parsePlanMatrix(plan);
        check(!m.problems.length, `matrix: ${m.acs.length} ACs, one test each${m.problems.length ? `: ${m.problems.join('; ')}` : ''}`);
        const ref = hasGit() && git(['branch', '--list', meta.branch]) ? meta.branch : null;
        for (const r of m.rows) {
          let found = false;
          if (ref && r.testFile && r.testName) {
            try { found = git(['show', `${ref}:${r.testFile}`]).includes(r.testName); } catch { found = false; }
          }
          check(found, `${r.id}: test "${r.testName}" exists in ${r.testFile} on ${ref ?? '(no branch)'}`);
        }
      }
      check(fs.existsSync(path.join(jobDir(id), 'spec.md')), 'spec.md (grill record) exists');
      check(fs.existsSync(path.join(jobDir(id), 'build.md')), 'build.md exists');
      for (const d of fs.readdirSync(jobDir(id)).filter((f) => /^round-\d+$/.test(f))) {
        for (const f of fs.readdirSync(path.join(jobDir(id), d)).filter((x) => x.startsWith('review-'))) {
          check(parseReview(readText(path.join(jobDir(id), d, f))).ok, `${d}/${f} first line is a verdict`);
        }
      }
      const dec = parseDecision(readText(path.join(jobDir(id), 'decision.md')));
      check(dec.ok, `decision.md first line is APPROVE/ESCALATE`);
      const reports = fs.readdirSync(path.join(REPO, 'docs/review')).filter((f) => f.startsWith(`${id}-round-`));
      check(reports.length > 0, `approver report(s): ${reports.join(', ') || 'none'}`);
      const merge = meta.events.find((e) => e.type === 'merge');
      if (merge) {
        const subject = git(['log', '-1', '--format=%s', merge.commit]);
        check(isConventionalCommit(subject), `commit ${merge.commit.slice(0, 8)} is Conventional: "${subject}"`);
        const inBase = git(['branch', '--contains', merge.commit, '--list', meta.baseBranch]);
        check(Boolean(inBase), `commit merged into ${meta.baseBranch}`);
        if (meta.dryRun) {
          let onMain = '';
          try { onMain = git(['branch', '--contains', merge.commit, '--list', 'main']); } catch { /* none */ }
          check(!onMain, 'dry-run commit is NOT on main (production untouched)');
        }
      } else {
        check(false, 'merge event recorded in job.json');
      }
      const cont = meta.events.filter((e) => e.type === 'continuity');
      if (meta.events.some((e) => e.type === 'round-complete' && e.next === 'rework')) check(cont.length > 0, 'builder continuity choice recorded');
    }
    for (const o of ok) console.log(`  ok   ${o}`);
    for (const p of problems) console.log(`  FAIL ${p}`);
    console.log(problems.length ? `\n${problems.length} problem(s)` : '\nall checks passed');
    process.exit(problems.length ? 1 : 0);
  },

  help() {
    console.log(fs.readFileSync(path.join(FACTORY, 'orchestrator.md'), 'utf8').split('## Commands')[1].split('## `board.json`')[0].trim());
  },
};

const [cmd, ...rest] = process.argv.slice(2);
(commands[cmd] || commands.help)(rest);
