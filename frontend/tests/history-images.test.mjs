import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import HistoryImages from '../history-images.js';

const require = createRequire(import.meta.url);
const { indexedDB } = require('fake-indexeddb');
globalThis.indexedDB = indexedDB;

test('guarda imágenes y respuestas de las tres clases y persiste al reabrir', async () => {
  const store = new HistoryImages();
  await store.clear();
  const readings = ['APTO', 'NO APTO', 'NO CONCLUYENTE'].map((label, index) => ({
    id: String(index), file: new Blob([`image-${index}`], { type: 'image/jpeg' }),
    data: { label, recommendation: { action: `action-${index}` } },
  }));
  await store.save(readings, readings);
  const reopened = new HistoryImages();
  for (const reading of readings) {
    const stored = await reopened.get(reading.id);
    assert.equal(await stored.blob.text(), await reading.file.text());
    assert.deepEqual(stored.data, reading.data);
  }
  assert.equal(await reopened.get(null), null);
  assert.equal(await reopened.get('missing'), null);
});

test('elimina fotografías fuera del historial retenido y serializa el borrado', async () => {
  const store = new HistoryImages();
  await store.save([{ id: 'new', file: new Blob(['new']), data: {} }], [{ id: 'new' }]);
  assert.equal(await store.get('0'), null);
  assert.ok(await store.get('new'));
  const saving = store.save([{ id: 'pending', file: new Blob(['pending']), data: {} }], [{ id: 'pending' }]);
  const clearing = store.clear();
  await Promise.all([saving, clearing]);
  assert.equal(await store.get('pending'), null);
  assert.equal(await store.get('new'), null);
});

test('IndexedDB no disponible produce un error recuperable', async () => {
  globalThis.indexedDB = undefined;
  try { await assert.rejects(new HistoryImages().save([], []), /guardar fotografías/); }
  finally { globalThis.indexedDB = indexedDB; }
});
