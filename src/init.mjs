// `software-forge init`: install the factory into the current git project.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { PACKAGE_ROOT, WORKTREES_DIR, readPackageJson } from './project.mjs';
import { detectPackageManager, runCommand, installArgs } from './pm.mjs';

const TEMPLATE = path.join(PACKAGE_ROOT, 'template');
const PKG_NAME = readPackageJson().name;

// Contracts are owned by the package and refreshed with --force. State belongs to the project: never overwritten.
const STATE = new Set([
  'factory/board.json', 'factory/backlog.md', 'docs/learnings/index.md',
  'factory/jobs/.gitkeep', 'docs/plans/.gitkeep', 'docs/review/.gitkeep',
]);
const GITIGNORE = [WORKTREES_DIR + '/', 'factory/.dashboard.json'];
const SCRIPTS = {
  factory: 'software-forge',
  'factory:dashboard': 'software-forge dashboard',
  'factory:start': 'software-forge start',
  'factory:verify': 'software-forge verify',
};

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p)];
  });
}

function indentOf(text) {
  const m = /^([ \t]+)"/m.exec(text);
  return m ? m[1] : '  ';
}

export function init(rawArgs) {
  const opts = { force: false, install: true, skill: true, dryRun: false, dir: process.cwd(), spec: undefined };
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '--force') opts.force = true;
    else if (a === '--no-install') opts.install = false;
    else if (a === '--no-skill') opts.skill = false;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--spec') opts.spec = rawArgs[++i];
    else if (a === '--dir') opts.dir = path.resolve(rawArgs[++i]);
    else if (!a.startsWith('-')) opts.dir = path.resolve(a);
    else throw new Error(`unknown option ${a}`);
  }
  const dir = opts.dir;
  const report = [];
  const say = (kind, msg) => report.push(`  ${kind.padEnd(8)} ${msg}`);

  // 1. The factory needs git worktrees and a base commit.
  let top;
  try { top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { throw new Error(`${dir} is not a git repository. Run "git init" and make a first commit; the factory builds in git worktrees.`); }
  if (fs.realpathSync(top) !== fs.realpathSync(dir)) throw new Error(`run init at the repository root (${top}), not in a subdirectory`);
  try { execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: dir, stdio: 'ignore' }); }
  catch { throw new Error('the repository has no commits yet. Make a first commit before installing the factory.'); }

  const write = (rel, content) => {
    if (!opts.dryRun) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), content); }
  };
  const pm = detectPackageManager(dir);
  const RUN = runCommand(pm);

  // 2. Copy contracts and starter state.
  const targets = [
    ...walk(path.join(TEMPLATE, 'factory'), TEMPLATE),
    ...walk(path.join(TEMPLATE, 'docs'), TEMPLATE),
    ...(opts.skill ? walk(path.join(TEMPLATE, 'claude'), TEMPLATE) : []),
  ];
  for (const src of targets) {
    const dest = src.startsWith('claude') ? src.replace(/^claude/, '.claude') : src;
    const exists = fs.existsSync(path.join(dir, dest));
    let body = fs.readFileSync(path.join(TEMPLATE, src), 'utf8');
    body = body.replaceAll('{{RUN}}', RUN);
    if (exists && (STATE.has(dest) || !opts.force)) { say('keep', dest); continue; }
    if (exists && fs.readFileSync(path.join(dir, dest), 'utf8') === body) { say('same', dest); continue; }
    write(dest, body);
    say(exists ? 'update' : 'create', dest);
  }

  // 3. .gitignore
  const giPath = path.join(dir, '.gitignore');
  const gi = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf8') : '';
  const missing = GITIGNORE.filter((l) => !gi.split(/\r?\n/).some((x) => x.trim() === l || x.trim() === `/${l}`));
  if (missing.length) {
    write('.gitignore', `${gi}${gi && !gi.endsWith('\n') ? '\n' : ''}${gi ? '\n' : ''}# software-forge\n${missing.join('\n')}\n`);
    say('update', `.gitignore (+${missing.join(', ')})`);
  } else say('keep', '.gitignore');

  // 4. package.json: scripts + devDependency.
  const pjPath = path.join(dir, 'package.json');
  const hadPkg = fs.existsSync(pjPath);
  const raw = hadPkg ? fs.readFileSync(pjPath, 'utf8') : '';
  const pj = hadPkg ? JSON.parse(raw) : { name: path.basename(dir).toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || 'project', version: '0.0.0', private: true };
  pj.scripts ??= {};
  const added = [];
  for (const [k, v] of Object.entries(SCRIPTS)) {
    if (pj.scripts[k] === v) continue;
    if (pj.scripts[k] && !opts.force) { say('skip', `script "${k}" already exists ("${pj.scripts[k]}"); use --force to replace`); continue; }
    pj.scripts[k] = v;
    added.push(k);
  }
  const insidePackages = PACKAGE_ROOT.split(path.sep).includes('node_modules');
  const spec = opts.spec ?? (insidePackages ? `^${readPackageJson().version}` : `file:${path.relative(dir, PACKAGE_ROOT) || '.'}`);
  const depField = pj.dependencies?.[PKG_NAME] ? 'dependencies' : 'devDependencies';
  pj[depField] ??= {};
  const depChanged = pj[depField][PKG_NAME] !== spec;
  if (depChanged && (!pj[depField][PKG_NAME] || opts.force || opts.spec || pj[depField][PKG_NAME].startsWith('file:'))) pj[depField][PKG_NAME] = spec;
  pj[depField] = Object.fromEntries(Object.entries(pj[depField]).sort(([a], [b]) => a.localeCompare(b)));
  if (added.length || depChanged || !hadPkg) {
    write('package.json', `${JSON.stringify(pj, null, hadPkg ? indentOf(raw) : 2)}\n`);
    say(hadPkg ? 'update' : 'create', `package.json (${[added.length && `scripts: ${added.join(', ')}`, depChanged && `${depField}: ${PKG_NAME}@${spec}`].filter(Boolean).join('; ')})`);
  } else say('keep', 'package.json');

  console.log(`${opts.dryRun ? '[dry run] ' : ''}software-forge init in ${dir} (package manager: ${pm.name})\n${report.join('\n')}`);

  // 5. Install so the bin is on PATH for the scripts.
  if (opts.install && !opts.dryRun && (added.length || depChanged || !hadPkg || !fs.existsSync(path.join(dir, 'node_modules', PKG_NAME)))) {
    console.log(`\n$ ${pm.name} ${installArgs().join(' ')}`);
    const r = spawnSync(pm.name, installArgs(), { cwd: dir, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`${pm.name} install failed (exit ${r.status}); fix it and re-run "init"`);
  } else if (!opts.install) {
    console.log(`\nSkipped install. Run "${pm.name} install" before using the scripts.`);
  }

  console.log(`
Done. Next:
  git add -A && git commit -m "chore: add software-forge"   # worktrees branch from a committed base
  claude            # then type: /factory <feature>
  ${RUN} verify     # sanity-check the install
  npx software-forge start "<feature>"  # Claude + dashboard together (http://localhost:5173)
Edit factory/runtime-adapter.md ("Repository facts") to describe this project.`);
}
