// Package-manager detection and the few commands init needs from it.
import fs from 'node:fs';
import path from 'node:path';

export function detectPackageManager(dir) {
  const has = (f) => fs.existsSync(path.join(dir, f));
  let declared = '';
  try { declared = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).packageManager ?? ''; } catch { /* none */ }
  const name =
    has('pnpm-lock.yaml') || has('pnpm-workspace.yaml') || declared.startsWith('pnpm') ? 'pnpm'
    : has('yarn.lock') || declared.startsWith('yarn') ? 'yarn'
    : has('bun.lock') || has('bun.lockb') || declared.startsWith('bun') ? 'bun'
    : has('package-lock.json') || declared.startsWith('npm') ? 'npm'
    : (process.env.npm_config_user_agent ?? '').split('/')[0] || 'npm';
  return { name, workspaceRoot: name === 'pnpm' && has('pnpm-workspace.yaml') };
}

// How to run a package script / the bin in this project, as text for docs and the skill.
export function runCommand(pm, script = 'sforge') {
  return { npm: `npm run ${script} --`, pnpm: `pnpm ${script}`, yarn: `yarn ${script}`, bun: `bun run ${script}` }[pm.name] ?? `npm run ${script} --`;
}

// Dependencies are already written to package.json, so a plain install is enough
// (also at a pnpm workspace root, where `pnpm add` would need --workspace-root).
export function installArgs() {
  return ['install'];
}
