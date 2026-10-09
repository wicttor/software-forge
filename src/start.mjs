// `software-forge dashboard` and `software-forge start`.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveProject } from './project.mjs';
import { startDashboardServer, dashboardBuilt } from './dashboard-server.mjs';

const stateFile = (root) => path.join(root, 'forge/.dashboard.json');
const BIN = fileURLToPath(new URL('../bin/software-forge.mjs', import.meta.url));

function needProject() {
  const root = resolveProject();
  if (!root) throw new Error('not a forge project (no forge/board.json above the current directory). Run "npx software-forge init" first.');
  return root;
}

function parseFlags(args) {
  const o = { port: 5173, detach: false, quiet: false, keep: false, stop: false, dashboard: true, claude: true, positional: [], passthrough: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--port') o.port = Number(args[++i]);
    else if (a === '--detach') o.detach = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--keep-dashboard') o.keep = true;
    else if (a === '--stop') o.stop = true;
    else if (a === '--no-dashboard') o.dashboard = false;
    else if (a === '--no-claude') o.claude = false;
    else if (a === '--') { o.passthrough = args.slice(i + 1); break; }
    else o.positional.push(a);
  }
  if (!Number.isInteger(o.port) || o.port < 0 || o.port > 65535) throw new Error('--port needs a number');
  return o;
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const readState = (root) => { try { return JSON.parse(fs.readFileSync(stateFile(root), 'utf8')); } catch { return null; } };

function ping(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/board', timeout: 800 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// A running dashboard for this project, if any (state file + live pid + answering port).
export async function runningDashboard(root) {
  const st = readState(root);
  if (st && alive(st.pid) && (await ping(st.port))) return st;
  if (st) fs.rmSync(stateFile(root), { force: true });
  return null;
}

async function listenFrom(root, port) {
  // Walk up from the requested port when it is busy, so a second project does not fail.
  for (let p = port; p < port + (port === 0 ? 1 : 20); p++) {
    try { return await startDashboardServer({ repoRoot: root, port: p }); }
    catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  throw new Error(`no free port from ${port} to ${port + 19}`);
}

// Foreground dashboard (also the body of a detached child).
export async function dashboardCommand(args) {
  const root = needProject();
  const o = parseFlags(args);
  if (o.stop) return stopDashboard();
  const running = await runningDashboard(root);
  if (running) { if (!o.quiet) console.log(`dashboard already running: http://localhost:${running.port} (pid ${running.pid})`); return; }
  if (!dashboardBuilt()) throw new Error('the dashboard bundle is missing (dashboard/dist). In the software-forge package run the "dashboard:build" script (npm, pnpm, yarn or bun).');

  if (o.detach) {
    const child = spawn(process.execPath, [BIN, 'dashboard', '--port', String(o.port), '--quiet'], {
      cwd: root, detached: true, stdio: 'ignore', env: { ...process.env, FORGE_REPO: root },
    });
    child.unref();
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const st = await runningDashboard(root);
      if (st) { if (!o.quiet) console.log(`dashboard: http://localhost:${st.port} (pid ${st.pid}; stop with: software-forge dashboard --stop)`); return st; }
    }
    throw new Error('dashboard did not start');
  }

  const { server, port } = await listenFrom(root, o.port);
  fs.writeFileSync(stateFile(root), JSON.stringify({ pid: process.pid, port, startedAt: new Date().toISOString() }));
  const cleanup = () => { const st = readState(root); if (st?.pid === process.pid) fs.rmSync(stateFile(root), { force: true }); };
  process.on('exit', cleanup);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(0));
  server.on('close', cleanup);
  if (!o.quiet) console.log(`forge dashboard: http://localhost:${port}  (project ${root})`);
}

export async function stopDashboard() {
  const root = needProject();
  const st = readState(root);
  if (st && alive(st.pid)) { process.kill(st.pid, 'SIGTERM'); console.log(`stopped dashboard (pid ${st.pid})`); }
  else console.log('no dashboard running for this project');
  fs.rmSync(stateFile(root), { force: true });
}

const APPEND_PROMPT = [
  'This project uses the software forge. When the user asks to build a feature through the forge,',
  'or types /forge, load the "forge" skill and act as the orchestrator defined in forge/orchestrator.md.',
  'The read-only board is the forge dashboard (already running when this session was started by `software-forge start`).',
].join(' ');

// `software-forge start [feature...] [-- claude args]`: dashboard in the background, then Claude Code.
export async function startCommand(args) {
  const root = needProject();
  const o = parseFlags(args);
  const feature = o.positional.join(' ').trim();
  const claudeExtra = o.passthrough;

  let started = false;
  if (o.dashboard) {
    const before = await runningDashboard(root);
    if (before) console.log(`dashboard: http://localhost:${before.port} (already running)`);
    else {
      try { await dashboardCommand(['--detach', '--port', String(o.port), '--quiet']); started = true; }
      catch (e) { console.error(`forge: dashboard not started: ${e.message}`); }
      const st = await runningDashboard(root);
      if (st) console.log(`dashboard: http://localhost:${st.port}`);
    }
  }
  if (!o.claude) return;

  const bin = process.env.FORGE_CLAUDE_BIN || 'claude';
  const cargs = ['--append-system-prompt', APPEND_PROMPT, ...claudeExtra];
  if (feature) cargs.push(`/forge ${feature}`);
  const child = spawn(bin, cargs, { cwd: root, stdio: 'inherit' });
  child.on('error', (e) => { console.error(`forge: cannot start "${bin}": ${e.message}`); process.exitCode = 127; });
  await new Promise((resolve) => child.on('close', (code) => { process.exitCode = code ?? 0; resolve(); }));

  if (started && !o.keep) {
    const st = readState(root);
    if (st && alive(st.pid)) process.kill(st.pid, 'SIGTERM');
  }
}
