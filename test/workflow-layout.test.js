import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../src/renderer/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/renderer/styles.css', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../src/renderer/renderer.js', import.meta.url), 'utf8');

test('basic section provides quick profile area for one-click defaults', () => {
  assert.match(html, /id="quickProfileGrid"/);
  assert.match(html, /data-profile="social"/);
  assert.match(html, /data-profile="archive"/);
  assert.match(html, /data-profile="audio"/);
});

test('advanced section keeps modular groups for video audio and container', () => {
  assert.match(html, /summary>视频模块<\/summary>/);
  assert.match(html, /summary>音频模块<\/summary>/);
  assert.match(html, /summary>封装与执行模块<\/summary>/);
});

test('renderer script has quick profile applier', () => {
  assert.match(js, /const QUICK_PROFILES = \{/);
  assert.match(js, /function applyQuickProfile\(profileKey\)/);
});

test('styles define quick profile card layout', () => {
  assert.match(css, /\.quick-profile-grid\s*\{/);
  assert.match(css, /\.quick-profile-card\s*\{/);
  assert.match(css, /\.quick-profile-card\.active\s*\{/);
});
