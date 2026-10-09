// Runs a dashboard task (install | dev | build | preview) with the package manager
// that invoked us (npm, pnpm, yarn or bun), so the repo works with any of them.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { detectPackageManager } from '../src/pm.mjs';

const dash = path.resolve(import.meta.dirname, '../dashboard');
const task = process.argv[2];
// Prefer whoever invoked us; fall back to the lockfile in dashboard/.
const agent = (process.env.npm_config_user_agent ?? '').split('/')[0];
const pm = ['npm', 'pnpm', 'yarn', 'bun'].includes(agent) ? agent : detectPackageManager(dash).name;

const commands = {
  install: { npm: ['ci'], pnpm: ['install'], yarn: ['install'], bun: ['install'] },
  dev: { npm: ['run', 'dev'], pnpm: ['run', 'dev'], yarn: ['run', 'dev'], bun: ['run', 'dev'] },
  build: { npm: ['run', 'build'], pnpm: ['run', 'build'], yarn: ['run', 'build'], bun: ['run', 'build'] },
  preview: { npm: ['run', 'preview'], pnpm: ['run', 'preview'], yarn: ['run', 'preview'], bun: ['run', 'preview'] },
};
const args = commands[task]?.[pm];
if (!args) {
  console.error(`usage: node scripts/dashboard.mjs <${Object.keys(commands).join('|')}>`);
  process.exit(2);
}
const r = spawnSync(pm, args, { cwd: dash, stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
