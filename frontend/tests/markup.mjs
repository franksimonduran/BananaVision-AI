/* Optional developer tools: parse5 and css-tree; no application dependency. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { parse: parseHtml } = require('parse5');
const cssTree = require('css-tree');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const htmlErrors = [];
parseHtml(html, { onParseError: error => htmlErrors.push(`${error.code} at ${error.startLine}:${error.startCol}`) });
assert.deepEqual(htmlErrors, [], 'Errores de sintaxis HTML');
console.log('OK HTML analizado con parse5, sin errores');

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const cssErrors = [];
cssTree.parse(css, { onParseError: error => cssErrors.push(error.message) });
assert.deepEqual(cssErrors, [], 'Errores de sintaxis CSS');
console.log('OK CSS analizado con css-tree, sin errores');

for (const name of ['app.js', 'api.js', 'charts.js', 'config.js', 'data.js', 'rejections.js', 'history-images.js', 'voice.js']) {
  const path = fileURLToPath(new URL(`../${name}`, import.meta.url));
  const check = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  assert.equal(check.status, 0, `${name}: ${check.stderr}`);
}
console.log('OK Sintaxis JavaScript de los siete módulos');
