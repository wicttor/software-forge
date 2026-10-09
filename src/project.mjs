// Locating the project a command works on, and the package's own files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WORKTREES_DIR = '.forge-worktrees';
export const BOARD_REL = 'forge/board.json';

// A forge project is the nearest ancestor that holds forge/board.json.
// Commands run inside a builder worktree (<project>/.forge-worktrees/<id>) must
// resolve to the main checkout, not to the worktree's own committed copy.
export function findProjectRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  const marker = `${path.sep}${WORKTREES_DIR}${path.sep}`;
  const at = `${dir}${path.sep}`.indexOf(marker);
  if (at !== -1) dir = dir.slice(0, at);
  for (;;) {
    if (fs.existsSync(path.join(dir, BOARD_REL))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// FORGE_REPO wins, so scripts and tests can point at any project explicitly.
export function resolveProject(start = process.cwd()) {
  const explicit = process.env.FORGE_REPO;
  if (explicit) return path.resolve(explicit);
  return findProjectRoot(start);
}

export function readPackageJson() {
  return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
}
