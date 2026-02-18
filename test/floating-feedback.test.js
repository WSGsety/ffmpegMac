import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../src/renderer/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/renderer/styles.css', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../src/renderer/renderer.js', import.meta.url), 'utf8');

test('renderer page contains floating feedback containers', () => {
  assert.match(html, /id="floatingStack"/);
  assert.match(html, /id="activityBanner"/);
  assert.match(html, /id="activityText"/);
});

test('styles define toast stack and top activity banner', () => {
  assert.match(css, /\.floating-stack\s*\{/);
  assert.match(css, /\.toast\s*\{/);
  assert.match(css, /\.activity-banner\.active\s*\{/);
});

test('renderer script provides toast and activity helpers', () => {
  assert.match(js, /function\s+showToast\s*\(/);
  assert.match(js, /function\s+showActivity\s*\(/);
  assert.match(js, /function\s+hideActivity\s*\(/);
});

test('probe flow triggers floating feedback while probing', () => {
  assert.match(js, /els\.probeInput\.addEventListener\('click',[\s\S]*showActivity\(/);
  assert.match(js, /els\.probeInput\.addEventListener\('click',[\s\S]*hideActivity\(/);
});
