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


test('la cámara permite guardar una muestra manual sin almacenar todos los fotogramas continuos', () => {
  assert.ok(known.has('saveCameraSample'));
  assert.ok(!known.has('historySaveStatus'));
  assert.match(app, /saveCameraSampleToHistory\(\)/);
  assert.match(app, /state\.realtimeWanted = false/);
  assert.match(app, /await analyze\(false\)/);
  assert.match(app, /data\.record_id/);
});


test('sistema sin login ni registros visibles: sesión privada automática por navegador', () => {
  for (const legacyId of ['accountButton', 'logoutButton', 'accountDialog', 'accountForm']) {
    assert.equal(known.has(legacyId), false, 'Se encontró una pantalla de inicio de sesión');
  }
  assert.match(app, /await cloud\.anonymous\(\)/);
  assert.match(app, /state\.cloudInitializing/);
});

test('cada NO APTO del modo continuo se registra en el historial automáticamente', () => {
  assert.match(app, /continuous && results\.some\(data => data\.label === 'NO APTO'\)/);
  assert.match(app, /await refreshCloudHistory\(\)/);
  assert.match(app, /await historyImages\.save\(rejected, state\.history\)/);
});

test('no se muestra inicio/cierre de sesión ni textos informativos eliminados', () => {
  assert.doesNotMatch(html, /Cerrar sesión|Todos los resultados NO APTO del análisis continuo se guardan automáticamente/);
  assert.doesNotMatch(app, /Sin inicio de sesión: los NO APTO de la cámara continua se guardan automáticamente/);
  assert.doesNotMatch(html, /historySaveStatus/);
});
