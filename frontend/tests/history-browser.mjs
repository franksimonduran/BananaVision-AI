import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    response.end(await readFile(path));
  } catch { response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const labels = ['APTO', 'NO APTO', 'NO CONCLUYENTE'];
  const results = labels.map(label => {
    const confidence = label === 'NO CONCLUYENTE' ? .6 : .9;
    const apto = label === 'NO APTO' ? 1 - confidence : confidence;
    return { label, confidence, inference_time_ms: 104, threshold: .7, conclusive: label !== 'NO CONCLUYENTE', predicted_class: label === 'NO APTO' ? 'NO APTO' : 'APTO', probabilities: { APTO: apto, 'NO APTO': 1 - apto }, recommendation: { message: 'Lectura.', destination: 'Destino de prueba', timing: 'Plazo de prueba', storage: 'Manejo de prueba', action: 'Acción de prueba' } };
  });
  await page.route('**/health', route => route.fulfill({ json: { model_loaded: true, limits: { image_mb: 5, batch_files: 10, batch_mb: 20 } } }));
  await page.route('**/predict/batch', route => route.fulfill({ json: results }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/index.html#historial`);
  await page.waitForFunction(() => document.getElementById('statusText').textContent === 'Modelo conectado');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 340;
    canvas.getContext('2d').fillRect(0, 0, 600, 340);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#fileInput').setInputFiles(labels.map((label, index) => ({ name: `sample-${index}.png`, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })));
  await page.locator('[data-view="capturar"]').click();
  await page.locator('#analyzeButton').click();
  await page.waitForFunction(() => document.getElementById('navCount').textContent === '3' && !document.getElementById('analyzeButton').disabled);
  await page.locator('[data-view="historial"]').click();
  for (let index = 0; index < labels.length; index++) {
    await page.getByRole('button', { name: `Ver imagen y datos de sample-${index}.png`, exact: true }).click();
    await page.waitForFunction(() => document.getElementById('historyDetailImage').naturalWidth === 600);
    assert.equal(await page.locator('#historyDetailLabel').textContent(), labels[index]);
    assert.equal(await page.locator('#historyDetailImage').evaluate(image => image.naturalHeight), 340);
    assert.equal(await page.locator('#historyDetailTime').textContent(), '104 ms');
    assert.equal(await page.locator('#historyDetailAction').textContent(), 'Acción de prueba');
    assert.equal(await page.locator('#historyDetailDownload').isVisible(), true);
    await page.getByRole('button', { name: 'Cerrar detalle de la muestra' }).click();
  }
  await page.reload();
  await page.getByRole('button', { name: 'Ver imagen y datos de sample-0.png', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('historyDetailImage').naturalWidth === 600);
  assert.equal(await page.locator('#historyDetailLabel').textContent(), 'APTO');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#historyDetailDownload').click();
  assert.ok((await downloadPromise).suggestedFilename().endsWith('.png'));
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const key = 'bananaStudioHistoryV2', items = JSON.parse(localStorage.getItem(key));
    items.push({ name: 'anterior.png', label: 'APTO', confidence: .8, inference_time_ms: 100, timestamp: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(items));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Ver imagen y datos de anterior.png', exact: true }).click();
  assert.equal(await page.locator('#historyDetailImage').isVisible(), false);
  assert.ok((await page.locator('#historyDetailImageStatus').textContent()).includes('Imagen no disponible'));
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Ver imagen y datos de sample-1.png', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('historyDetailImage').naturalWidth === 600);
  assert.ok(await page.locator('#historyDetailDialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth));
  await page.keyboard.press('Escape');
  await page.locator('#clearHistory').click();
  await page.locator('#clearHistoryDialog button[value="clear"]').click();
  await page.waitForFunction(() => document.getElementById('navCount').textContent === '0');
  assert.equal(await page.evaluate(async () => {
    const { default: HistoryImages } = await import('./history-images.js');
    const db = await new HistoryImages().open();
    return new Promise(resolve => { const request = db.transaction('readings').objectStore('readings').count(); request.onsuccess = () => resolve(request.result); });
  }), 0);
  assert.deepEqual(errors, []);
  console.log('OK: tres clases, fotografía completa, datos, recomendaciones, persistencia, descarga, teclado, registros anteriores, móvil y borrado.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
