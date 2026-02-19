import { spawnSync } from 'node:child_process';
import path from 'node:path';

const [, , ...tauriArgs] = process.argv;
if (tauriArgs.length === 0) {
  console.error('Usage: node scripts/run-tauri.mjs <tauri args>');
  process.exit(1);
}

const home = process.env.HOME || process.env.USERPROFILE || '';
const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH';
const currentPath = process.env[pathKey] || '';
const prependPaths = [
  home ? path.join(home, '.cargo', 'bin') : '',
  process.platform === 'darwin' ? '/opt/homebrew/opt/rustup/bin' : ''
].filter(Boolean);
const env = {
  ...process.env,
  [pathKey]:
    prependPaths.length > 0
      ? `${prependPaths.join(path.delimiter)}${currentPath ? path.delimiter + currentPath : ''}`
      : currentPath
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
