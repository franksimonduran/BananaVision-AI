import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { protocol: 'http:', port: '8000', hostname: '127.0.0.1', origin: 'http://127.0.0.1:8000' };
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const { resultCopy, HISTORY_KEY, loadHistory, saveHistory, validateResult, filterHistory, paginateHistory, csvContent, validApiUrl, dayKey } = await import('../data.js');

const item = { name: 'muestra.png', label: 'APTO', confidence: .86, inference_time_ms: 120, timestamp: new Date(2026, 9, 2, 12).toISOString() };
const result = { ...item, predicted_class: 'APTO', threshold: .7, conclusive: true, probabilities: { APTO: .86, 'NO APTO': .14 }, recommendation: { message: 'Lectura', action: 'Revisar', storage: 'Separar' } };

test('preserva los registros existentes y descarta almacenamiento inválido', () => {
  storage.set(HISTORY_KEY, JSON.stringify([item, { ...item, confidence: 3 }, { ...item, timestamp: 'invalid' }, { ...item, label: 'OTHER' }]));
  assert.deepEqual(loadHistory(), [item]);
  storage.set(HISTORY_KEY, '{'); assert.deepEqual(loadHistory(), []);
  saveHistory([item]); assert.deepEqual(loadHistory(), [item]);
});

test('conserva más de 50 lecturas y limita almacenamiento y carga a 1.000', () => {
  saveHistory(Array.from({ length: 60 }, (_, i) => ({ ...item, name: String(i) })));
  assert.equal(loadHistory().length, 60);
  const records = Array.from({ length: 1005 }, (_, i) => ({ ...item, name: String(i) }));
  saveHistory(records);
  assert.equal(JSON.parse(storage.get(HISTORY_KEY)).length, 1000);
  storage.set(HISTORY_KEY, JSON.stringify(records));
  assert.equal(loadHistory().length, 1000);
  assert.equal(loadHistory()[0].name, '0');
  assert.equal(loadHistory()[999].name, '999');
});

test('preserva la asociación de fotografías sin alterar registros antiguos', () => {
  const linked = { ...item, id: 'sample-id' };
  saveHistory([linked, item]);
  assert.deepEqual(loadHistory(), [linked, item]);
});

test('pagina de 50 en 50 y ajusta páginas vacías o fuera de rango', () => {
  const records = Array.from({ length: 101 }, (_, i) => ({ ...item, name: String(i) }));
  assert.equal(paginateHistory(records).items.length, 50);
  const second = paginateHistory(records, 2);
  assert.equal(second.items[0].name, '50');
  assert.equal(second.start, 51);
  assert.equal(second.end, 100);
  const last = paginateHistory(records, 99);
  assert.equal(last.page, 3);
  assert.equal(last.items.length, 1);
  assert.equal(last.items[0].name, '100');
  assert.equal(paginateHistory([], 3).start, 0);
  assert.equal(paginateHistory([], 3).page, 1);
  assert.equal(paginateHistory(records, -1).page, 1);
});

test('los filtros y el CSV incluyen resultados fuera de la primera página', () => {
  const records = Array.from({ length: 101 }, (_, i) => ({ ...item, name: `lote-${i}`, label: i >= 50 ? 'NO APTO' : 'APTO' }));
  const filtered = filterHistory(records, { label: 'NO APTO' });
  assert.equal(filtered.length, 51);
  assert.equal(paginateHistory(filtered, 2).items[0].name, 'lote-100');
  assert.ok(csvContent(filtered).includes('"lote-100"'));
});

test('valida respuestas coherentes y rechaza clases que no son la probabilidad mayor', () => {
  assert.doesNotThrow(() => validateResult(result));
  assert.throws(() => validateResult({ ...result, confidence: .2, conclusive: false, label: 'NO CONCLUYENTE', probabilities: { APTO: .2, 'NO APTO': .8 } }), /inconsistentes/);
  assert.throws(() => validateResult({ ...result, probabilities: { APTO: .86, 'NO APTO': .5 } }), /inconsistentes/);
  assert.throws(() => validateResult({ ...result, inference_time_ms: -1 }), /inválido/);
});

test('combina búsqueda, clasificación y fecha local', () => {
  const other = { ...item, name: 'Lote B.jpg', label: 'NO APTO' };
  assert.deepEqual(filterHistory([item, other], { query: ' LOTE ', label: 'NO APTO', date: dayKey(item.timestamp) }), [other]);
  assert.equal(filterHistory([item, other], { label: 'NO CONCLUYENTE' }).length, 0);
});

test('CSV usa UTF-8, escapa comillas y neutraliza prefijos de fórmulas', () => {
  const csv = csvContent([{ ...item, name: ' =HYPERLINK("x")' }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\' =HYPERLINK(""x"")"'));
  assert.ok(csv.includes(';"86.00";"120.00";'));
  assert.ok(csv.includes('"APTO"'));
});

test('dirección de API rechaza credenciales y contenido mixto', () => {
  assert.equal(validApiUrl('http://127.0.0.1:8000/'), 'http://127.0.0.1:8000');
  assert.throws(() => validApiUrl('http://user:pass@localhost:8000'));
  location.protocol = 'https:';
  assert.throws(() => validApiUrl('http://localhost:8000'), /HTTPS/);
  location.protocol = 'http:';
});

test('textos de resultado: títulos esperados y aviso sin afirmaciones de certificación', () => {
  assert.equal(resultCopy('APTO').title, 'Apto para continuar');
  assert.equal(resultCopy('NO APTO').title, 'Revisión requerida');
  assert.equal(resultCopy('NO CONCLUYENTE').title, 'Resultado no concluyente');
  for (const label of ['APTO', 'NO APTO', 'NO CONCLUYENTE']) assert.equal(resultCopy(label).recommendations.length, 2);
  assert.doesNotMatch(JSON.stringify(resultCopy('APTO')), /100% seguro|aprobado definitivamente/i);
});
