#!/usr/bin/env node
// software-forge: installer, dashboard, Claude launcher and the job CLI in one bin.
const [cmd, ...rest] = process.argv.slice(2);

const HELP = `software-forge <command>

Setup
  init [dir] [--force] [--no-install] [--no-skill] [--spec <dep spec>] [--dry-run]
                       install the factory into the current git project
Run
  start [feature] [--port n] [--no-dashboard] [--keep-dashboard] [-- <claude args>]
                       dashboard in the background + Claude Code with the factory skill
  dashboard [--port n] [--detach] [--stop]
                       read-only board (default http://localhost:5173)
Jobs (run inside an initialized project; see factory/orchestrator.md)
  run next stage approve-plan worktree brief round decide merge approve rework verify event
`;

async function main() {
  if (cmd === '--version' || cmd === '-v') {
    const { readPackageJson } = await import('../src/project.mjs');
    return console.log(readPackageJson().version);
  }
  if (cmd === '--help' || cmd === '-h' || cmd === undefined) return console.log(HELP);
  if (cmd === 'init') return (await import('../src/init.mjs')).init(rest);
  if (cmd === 'dashboard') return (await import('../src/start.mjs')).dashboardCommand(rest);
  if (cmd === 'start') return (await import('../src/start.mjs')).startCommand(rest);
  // Everything else is a job command; src/factory.mjs reads process.argv itself.
  await import('../src/factory.mjs');
}

main().catch((e) => {
  console.error(`software-forge: ${e.message}`);
  process.exit(1);
});
