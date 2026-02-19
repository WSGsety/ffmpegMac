import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const baseArgs = ['test', '--manifest-path', 'src-tauri/Cargo.toml'];

function run(command, args, options = {}) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  const currentPath = process.env[pathKey] || '';
  const prependedPath = [
    home ? path.join(home, '.cargo', 'bin') : '',
    process.platform === 'darwin' ? '/opt/homebrew/opt/rustup/bin' : ''
  ].filter(Boolean);

  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      [pathKey]:
        prependedPath.length > 0
          ? `${prependedPath.join(path.delimiter)}${currentPath ? path.delimiter + currentPath : ''}`
          : currentPath
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
