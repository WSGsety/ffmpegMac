import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('main window points to CommonJS preload bridge file', () => {
  const mainJs = fs.readFileSync(new URL('../src/main/main.js', import.meta.url), 'utf8');
  assert.match(mainJs, /preload:\s*path\.join\(__dirname,\s*'preload\.cjs'\)/);
});

test('preload bridge exports ffmpegShell API using CommonJS', () => {
  const preloadCjs = fs.readFileSync(new URL('../src/main/preload.cjs', import.meta.url), 'utf8');
  assert.match(preloadCjs, /const\s+\{\s*contextBridge,\s*ipcRenderer\s*\}\s*=\s*require\('electron'\)/);
  assert.match(preloadCjs, /contextBridge\.exposeInMainWorld\('ffmpegShell'/);
  assert.match(preloadCjs, /pickInput:\s*\(\)\s*=>/);
  assert.match(preloadCjs, /pickOutput:\s*\(payload\)\s*=>/);
});
