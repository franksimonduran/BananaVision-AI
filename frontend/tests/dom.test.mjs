import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const known = new Set(ids);

test('DOM sin IDs duplicados y compatible con todos los selectores de app.js', () => {
  assert.equal(ids.length, known.size);
  const referenced = [...app.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
  for (const id of referenced) assert.ok(known.has(id), `Falta el elemento requerido #${id}`);
  for (const id of ['historySearch', 'historyStatus', 'historyDate', 'dashboardTitle', 'view-dashboard', 'view-capturar', 'view-historial']) assert.ok(known.has(id));
});

test('referencias de etiquetas, descripciones e iconos apuntan a elementos reales', () => {
  for (const match of html.matchAll(/\b(?:aria-labelledby|aria-describedby|for)="([^"]+)"/g)) {
    for (const id of match[1].split(' ')) assert.ok(known.has(id), `Referencia inválida: ${id}`);
  }
  for (const match of html.matchAll(/<use href="#([^"]+)"/g)) assert.ok(known.has(match[1]));
});

test('fuente e imágenes son recursos locales existentes y no hay métricas ficticias', async () => {
  for (const match of html.matchAll(/(?:src|href)="(assets\/[^\"]+)"/g)) {
    assert.ok((await readFile(new URL(`../${match[1]}`, import.meta.url))).length > 0);
  }
  assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(html));
  assert.ok(!/Vida útil estimada|Textura.*Óptima|Manchas.*Bajas|96%/.test(html));
});
