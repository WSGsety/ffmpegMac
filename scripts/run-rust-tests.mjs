import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const baseArgs = ['test', '--manifest-path', 'src-tauri/Cargo.toml'];

function run(command, args, options = {}) {
  const home = process.env.HOME || '';
  const prependedPath = [
    home ? `${home}/.cargo/bin` : '',
    '/opt/homebrew/opt/rustup/bin'
  ]
    .filter(Boolean)
    .join(':');

  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      PATH: prependedPath ? `${prependedPath}:${process.env.PATH || ''}` : process.env.PATH
    },
    ...options
  });
}

const rustup = '/opt/homebrew/opt/rustup/bin/rustup';
const shouldUseRustup = process.platform === 'darwin' && existsSync(rustup);

const result = shouldUseRustup
  ? run(rustup, ['run', 'stable', 'cargo', ...baseArgs])
  : run('cargo', baseArgs);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
