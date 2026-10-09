// prepack guard: never publish a package whose dashboard bundle is missing or stale.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const dash = path.join(root, 'dashboard');
const newest = (dir) => fs.readdirSync(dir, { withFileTypes: true, recursive: true })
  .filter((e) => e.isFile()).reduce((m, e) => Math.max(m, fs.statSync(path.join(e.parentPath, e.name)).mtimeMs), 0);
const dist = path.join(dash, 'dist/index.html');
const stale = !fs.existsSync(dist) || newest(path.join(dash, 'src')) > fs.statSync(dist).mtimeMs;
if (stale) {
  if (!fs.existsSync(path.join(dash, 'node_modules'))) execFileSync(process.execPath, [path.join(root, 'scripts/dashboard.mjs'), 'install'], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(root, 'scripts/dashboard.mjs'), 'build'], { stdio: 'inherit' });
}
