// Read-only HTTP API for the dashboard, shared by the standalone server below and
// by the Vite dev server (dashboard/vite.config.ts). Zero dependencies.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { PACKAGE_ROOT } from './project.mjs';

export const SAMPLE_BOARD = path.join(PACKAGE_ROOT, 'dashboard/fixtures/sample-board.json');
export const DASHBOARD_DIST = path.join(PACKAGE_ROOT, 'dashboard/dist');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, type, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.end(body);
}

function inside(file, dir) {
  const rel = path.relative(dir, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// Handles /api/board and /api/file; calls next() for everything else.
export function createApiHandler(repoRoot) {
  const allowedDirs = [path.join(repoRoot, 'factory/jobs'), path.join(repoRoot, 'docs')];
  return function apiHandler(req, res, next) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    if (url.pathname === '/api/board') {
      const file = url.searchParams.get('source') === 'sample' ? SAMPLE_BOARD : path.join(repoRoot, 'factory/board.json');
      try {
        return send(res, 200, 'application/json; charset=utf-8', fs.readFileSync(file, 'utf8'));
      } catch {
        return send(res, 404, 'application/json', JSON.stringify({ error: 'board not found' }));
      }
    }

    if (url.pathname === '/api/file') {
      const rel = url.searchParams.get('path') ?? '';
      const resolved = path.resolve(repoRoot, rel);
      const okExt = resolved.endsWith('.md') || resolved.endsWith('.json');
      if (!rel || rel.includes('\0') || !okExt || !allowedDirs.some((d) => inside(resolved, d))) {
        return send(res, 403, 'text/plain; charset=utf-8', 'forbidden');
      }
      try {
        // resolve symlinks so a link cannot escape the allowed dirs
        const real = fs.realpathSync(resolved);
        const realDirs = allowedDirs.map((d) => { try { return fs.realpathSync(d); } catch { return d; } });
        if (!realDirs.some((d) => inside(real, d))) return send(res, 403, 'text/plain; charset=utf-8', 'forbidden');
        return send(res, 200, 'text/plain; charset=utf-8', fs.readFileSync(real, 'utf8'));
      } catch {
        return send(res, 404, 'text/plain; charset=utf-8', 'not found');
      }
    }
    next();
  };
}

function serveStatic(req, res, distDir) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  let file = path.resolve(distDir, `.${rel}`);
  if (!inside(file, distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, 'index.html');
  const type = MIME[path.extname(file)] ?? 'application/octet-stream';
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.statusCode = 200;
  res.setHeader('Content-Type', type);
  if (immutable) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  else res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
}

export function dashboardBuilt(distDir = DASHBOARD_DIST) {
  return fs.existsSync(path.join(distDir, 'index.html'));
}

// Starts the server on `port` (0 = any free port). Resolves { server, port }.
export function startDashboardServer({ repoRoot, port = 5173, host = '127.0.0.1', distDir = DASHBOARD_DIST }) {
  if (!dashboardBuilt(distDir)) {
    throw new Error(`dashboard is not built (${distDir}/index.html missing). Run "npm run dashboard:build" in the software-forge package.`);
  }
  const api = createApiHandler(repoRoot);
  const server = http.createServer((req, res) => {
    api(req, res, () => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'method not allowed');
      serveStatic(req, res, distDir);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve({ server, port: server.address().port }));
  });
}
