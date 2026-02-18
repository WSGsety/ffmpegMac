import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/renderer/styles.css', import.meta.url), 'utf8');

test('command preview wraps long command lines to avoid layout overflow', () => {
  assert.match(css, /\.command-preview\s*\{[\s\S]*white-space:\s*pre-wrap;/);
  assert.match(css, /\.command-preview\s*\{[\s\S]*overflow-wrap:\s*anywhere;/);
});

test('form container uses min-width safeguards for long path inputs', () => {
  assert.match(css, /\.field-group\s*\{[\s\S]*min-width:\s*0;/);
  assert.match(css, /\.field-grow\s*\{[\s\S]*min-width:\s*0;/);
});
