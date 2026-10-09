// `init` against throwaway git projects, using the real bin. Installs are skipped
// (--no-install) so the test needs no network; install is covered by the manual smoke run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(PKG, 'bin/software-forge.mjs');

function project(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-init-'));
  for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), c); }
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@example.invalid'); g('config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'README.md'), '# p\n');
  g('add', '-A'); g('commit', '-qm', 'chore: init');
  const run = (...a) => spawnSync('node', [BIN, ...a], { cwd: dir, encoding: 'utf8', env: { ...process.env, FACTORY_REPO: '' } });
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  return { dir, g, run, read, has: (f) => fs.existsSync(path.join(dir, f)) };
}

test('init installs contracts, skill, gitignore, scripts and dependency', () => {
  const p = project({ 'package.json': '{\n    "name": "app",\n    "scripts": { "test": "vitest" }\n}\n' });
  const r = p.run('init', '--no-install');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const f of ['factory/orchestrator.md', 'factory/runtime-adapter.md', 'factory/agents/planner.md', 'factory/agents/code-reviewer.md',
    'factory/board.json', 'factory/backlog.md', 'factory/jobs/.gitkeep', 'docs/templates/plan-template.md', 'docs/learnings/index.md',
    'docs/plans/.gitkeep', 'docs/review/.gitkeep', '.claude/skills/factory/SKILL.md']) assert.ok(p.has(f), f);
  const pj = JSON.parse(p.read('package.json'));
  assert.equal(pj.scripts.test, 'vitest', 'existing scripts kept');
  assert.equal(pj.scripts.factory, 'software-forge');
  assert.equal(pj.scripts['factory:dashboard'], 'software-forge dashboard');
  assert.equal(pj.scripts['factory:start'], 'software-forge start');
  assert.match(pj.devDependencies['software-forge'], /^file:/);
  assert.match(p.read('package.json'), /^ {4}"name"/m, 'indentation preserved');
  assert.match(p.read('.gitignore'), /^\.factory-worktrees\/$/m);
  assert.match(p.read('.gitignore'), /^factory\/\.dashboard\.json$/m);
  const skill = p.read('.claude/skills/factory/SKILL.md');
  assert.match(skill, /^name: factory$/m);
  assert.ok(!skill.includes('{{RUN}}'), 'placeholder replaced');
  assert.match(skill, /npm run factory -- run/);
});

test('init is idempotent and never overwrites project state', () => {
  const p = project();
  assert.equal(p.run('init', '--no-install').status, 0);
  fs.writeFileSync(path.join(p.dir, 'factory/backlog.md'), '- [ ] mine\n');
  fs.writeFileSync(path.join(p.dir, 'factory/agents/planner.md'), 'customised\n');
  const before = p.read('package.json') + p.read('.gitignore');
  const r = p.run('init', '--no-install');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(p.read('package.json') + p.read('.gitignore'), before);
  assert.equal(p.read('factory/backlog.md'), '- [ ] mine\n');
  assert.equal(p.read('factory/agents/planner.md'), 'customised\n', 'contracts kept without --force');
  assert.equal(p.run('init', '--no-install', '--force').status, 0);
  assert.notEqual(p.read('factory/agents/planner.md'), 'customised\n', '--force refreshes contracts');
  assert.equal(p.read('factory/backlog.md'), '- [ ] mine\n', '--force still keeps state');
});

test('init uses pnpm conventions and keeps a conflicting script', () => {
  const p = project({ 'pnpm-lock.yaml': 'lockfileVersion: 9\n', 'package.json': '{"name":"w","scripts":{"factory":"echo mine"}}' });
  const r = p.run('init', '--no-install');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /package manager: pnpm/);
  assert.match(r.stdout, /script "factory" already exists/);
  assert.equal(JSON.parse(p.read('package.json')).scripts.factory, 'echo mine');
  assert.match(p.read('.claude/skills/factory/SKILL.md'), /pnpm factory run/);
});

test('init creates a minimal package.json when the project has none', () => {
  const p = project();
  assert.equal(p.run('init', '--no-install').status, 0);
  const pj = JSON.parse(p.read('package.json'));
  assert.equal(pj.private, true);
  assert.equal(pj.scripts.factory, 'software-forge');
});

test('init refuses non-git directories, repos without commits and subdirectories', () => {
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-plain-'));
  const r = spawnSync('node', [BIN, 'init', '--no-install'], { cwd: plain, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not a git repository/);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-empty-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: empty });
  assert.match(spawnSync('node', [BIN, 'init', '--no-install'], { cwd: empty, encoding: 'utf8' }).stderr, /no commits/);
  const p = project();
  fs.mkdirSync(path.join(p.dir, 'sub'));
  assert.match(spawnSync('node', [BIN, 'init', '--no-install'], { cwd: path.join(p.dir, 'sub'), encoding: 'utf8' }).stderr, /repository root/);
});

test('--dry-run writes nothing', () => {
  const p = project();
  const r = p.run('init', '--no-install', '--dry-run');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!p.has('factory') && !p.has('.claude') && !p.has('package.json'));
});

test('installed project passes verify and resolves the root from a subdirectory and a worktree path', () => {
  const p = project();
  p.run('init', '--no-install');
  p.g('add', '-A'); p.g('commit', '-qm', 'chore: add factory');
  const v = p.run('verify');
  assert.equal(v.status, 0, v.stdout + v.stderr);
  const id = p.run('run', 'Add greeting').stdout.trim();
  const nested = path.join(p.dir, '.factory-worktrees', id, 'src');
  fs.mkdirSync(nested, { recursive: true });
  const brief = spawnSync('node', [BIN, 'brief', id, 'planner'], { cwd: nested, encoding: 'utf8', env: { ...process.env, FACTORY_REPO: '' } });
  assert.equal(brief.status, 0, brief.stderr);
  assert.ok(brief.stdout.includes(`<repo> (main checkout): ${fs.realpathSync(p.dir)}`) || brief.stdout.includes(`<repo> (main checkout): ${p.dir}`));
});

test('commands outside a factory project fail with a pointer to init', () => {
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-none-'));
  const r = spawnSync('node', [BIN, 'verify'], { cwd: plain, encoding: 'utf8', env: { ...process.env, FACTORY_REPO: '' } });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /init/);
});

const get = (port, p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, body: b, type: res.headers['content-type'] })); }).on('error', reject);
});

test('dashboard server: serves the bundle and a read-only, traversal-safe API', async () => {
  const { startDashboardServer, dashboardBuilt } = await import('../src/dashboard-server.mjs');
  if (!dashboardBuilt()) return; // bundle not built in this checkout
  const p = project();
  p.run('init', '--no-install');
  fs.writeFileSync(path.join(p.dir, 'docs/plans/001-x.md'), '# plan\n');
  fs.writeFileSync(path.join(p.dir, 'secret.md'), 'nope');
  const { server, port } = await startDashboardServer({ repoRoot: p.dir, port: 0 });
  try {
    assert.equal((await get(port, '/')).status, 200);
    assert.equal((await get(port, '/some/spa/route')).type.startsWith('text/html'), true);
    const board = await get(port, '/api/board');
    assert.equal(board.status, 200);
    assert.deepEqual(JSON.parse(board.body).jobs, []);
    assert.equal(JSON.parse((await get(port, '/api/board?source=sample')).body).version, 1);
    assert.equal((await get(port, '/api/file?path=docs/plans/001-x.md')).body, '# plan\n');
    for (const bad of ['secret.md', '../secret.md', 'docs/../secret.md', 'factory/board.json', '%2e%2e%2fsecret.md', 'docs/plans']) {
      assert.equal((await get(port, `/api/file?path=${bad}`)).status, 403, bad);
    }
  } finally { server.close(); }
});

test('start: launches the dashboard and claude with the factory prompt, then stops the dashboard', async () => {
  const p = project();
  p.run('init', '--no-install');
  const fake = path.join(p.dir, 'fake-claude.mjs');
  fs.writeFileSync(fake, `#!/usr/bin/env node
import fs from 'node:fs';
fs.writeFileSync(process.env.OUT, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), dash: fs.existsSync('factory/.dashboard.json') }));
`);
  fs.chmodSync(fake, 0o755);
  const out = path.join(p.dir, 'out.json');
  const r = spawnSync('node', [BIN, 'start', 'Add CSV export', '--port', '5391', '--', '--model', 'sonnet'], {
    cwd: p.dir, encoding: 'utf8', env: { ...process.env, FACTORY_REPO: '', FACTORY_CLAUDE_BIN: fake, OUT: out },
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const seen = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(seen.args[0], '--append-system-prompt');
  assert.match(seen.args[1], /software factory/);
  assert.deepEqual(seen.args.slice(2, 4), ['--model', 'sonnet']);
  assert.equal(seen.args.at(-1), '/factory Add CSV export');
  assert.equal(seen.dash, true, 'dashboard state existed while claude ran');
  assert.match(r.stdout, /dashboard: http:\/\/localhost:539\d/);
  await new Promise((res) => setTimeout(res, 400));
  assert.ok(!p.has('factory/.dashboard.json'), 'dashboard stopped after claude exited');
});
