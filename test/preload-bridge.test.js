import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('renderer includes tauri bridge bootstrap script', () => {
  const html = fs.readFileSync(new URL('../src/renderer/index.html', import.meta.url), 'utf8');
  assert.match(html, /src="\.\/tauri-bridge\.js"/);
  assert.match(html, /src="\.\/renderer\.js"/);
});

test('tauri bridge exposes ffmpegShell API with invoke and event bindings', () => {
  const bridge = fs.readFileSync(new URL('../src/renderer/tauri-bridge.js', import.meta.url), 'utf8');
  assert.match(bridge, /window\.ffmpegShell\s*=\s*\{/);
  assert.match(bridge, /pickInput:\s*\(\)\s*=>\s*invokeCommand\('pick_input'\)/);
  assert.match(bridge, /run:\s*\(payload\)\s*=>\s*invokeCommand\('run_ffmpeg',\s*payload\)/);
  assert.match(bridge, /onProgress:\s*\(callback\)\s*=>\s*bindEvent\('ffmpeg:progress',\s*callback\)/);
});

test('tauri config enables global api and static renderer dist', () => {
  const configPath = new URL('../src-tauri/tauri.conf.json', import.meta.url);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(config?.app?.withGlobalTauri, true);
  assert.equal(config?.build?.frontendDist, '../src/renderer');
});
