import { spawnSync } from 'node:child_process';

const [, , ...tauriArgs] = process.argv;
if (tauriArgs.length === 0) {
  console.error('Usage: node scripts/run-tauri.mjs <tauri args>');
  process.exit(1);
}

const home = process.env.HOME || '';
const prependPaths = [
  home ? `${home}/.cargo/bin` : '',
  '/opt/homebrew/opt/rustup/bin'
]
  .filter(Boolean)
  .join(':');

const env = {
  ...process.env,
  PATH: prependPaths ? `${prependPaths}:${process.env.PATH || ''}` : process.env.PATH
};

const tauriBinary = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';
const result = spawnSync(tauriBinary, tauriArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
