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
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const path = resolve(root, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`);
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    response.end(await readFile(path));
  } catch { response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const page = await browser.newPage({ permissions: ['camera'] });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const result = { label: 'APTO', confidence: .9, inference_time_ms: 104, threshold: .7, conclusive: true, predicted_class: 'APTO', probabilities: { APTO: .9, 'NO APTO': .1 }, recommendation: { message: 'Lectura.', destination: 'Destino', timing: 'Tiempo', storage: 'Manejo', action: 'Acción' } };
  await page.route('**/health', route => route.fulfill({ json: { model_loaded: true, limits: { image_mb: 5, batch_files: 10, batch_mb: 20 } } }));
  let delay = 1000;
  let liveResult = result;
  await page.route('**/predict', async route => { if (delay) await new Promise(resolve => setTimeout(resolve, delay)); await route.fulfill({ json: liveResult }).catch(() => {}); });
  await page.route('**/predict/batch', route => route.fulfill({ json: [result, result] }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/#capturar`);
  assert.equal(await page.locator('#video').isVisible(), false);
  await page.locator('#startLiveCamera').click();
  await page.waitForFunction(() => document.getElementById('video').videoWidth > 0 && document.getElementById('realtime').checked && document.getElementById('analyzeButtonText').textContent === 'Analizando en vivo');
  await page.locator('#resultContent').waitFor({ state: 'visible' });
  assert.ok(await page.evaluate(() => {
    const capture = document.querySelector('.capture-card').getBoundingClientRect();
    const result = document.querySelector('.result-card').getBoundingClientRect();
    const stage = document.getElementById('stage').getBoundingClientRect();
    const controls = document.querySelector('.capture-actions').getBoundingClientRect();
    return Math.abs(capture.height - result.height) <= 1
      && Math.abs(capture.top - result.top) <= 1
      && stage.height >= 310 && controls.top >= stage.bottom;
  }));
  assert.equal(await page.locator('#cropGuide').isVisible(), true);
  assert.equal(await page.locator('.capture-card > .card-heading .subtle-pill').count(), 0);
  assert.equal(await page.locator('#voiceStatus').textContent(), 'Aviso para NO APTO · máximo cada 5 s');
  const cameraBounds = await page.locator('#stage').boundingBox();
  delay = 0;
  for (const label of ['NO APTO', 'NO CONCLUYENTE', 'APTO']) {
    const confidence = label === 'NO CONCLUYENTE' ? .6 : .9;
    const apto = label === 'NO APTO' ? 1 - confidence : confidence;
    liveResult = { ...result, label, confidence, conclusive: label !== 'NO CONCLUYENTE', predicted_class: label === 'NO APTO' ? 'NO APTO' : 'APTO', probabilities: { APTO: apto, 'NO APTO': 1 - apto } };
    await page.waitForFunction(label => document.getElementById('resultLabel').textContent === label, label);
    const bounds = await page.locator('#stage').boundingBox();
    assert.ok(Math.abs(bounds.height - cameraBounds.height) <= 1);
    assert.ok(Math.abs(bounds.width - cameraBounds.width) <= 1);
    assert.ok(Math.abs(bounds.y - cameraBounds.y) <= 1);
  }
  await page.evaluate(() => { window.previousTrack = document.getElementById('video').srcObject.getVideoTracks()[0]; });
  await page.locator('#imageMode').click();
  assert.equal(await page.locator('#imageMode').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#cameraControls').isVisible(), false);
  assert.equal(await page.locator('#selectImages').isVisible(), true);
  assert.equal(await page.evaluate(() => window.previousTrack.readyState), 'ended');
  assert.equal(await page.locator('#realtime').isChecked(), false);
  assert.equal(await page.locator('#analyzeButton').isDisabled(), true);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 340;
    canvas.getContext('2d').fillRect(0, 0, 600, 340);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const file = name => ({ name, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#selectImages').click();
  await (await chooserPromise).setFiles(file('individual.png'));
  await page.waitForFunction(() => document.getElementById('preview').naturalWidth === 600);
  assert.equal(await page.locator('#resultContent').isVisible(), false);
  assert.equal(await page.locator('#selectImagesText').textContent(), 'Cambiar imágenes');
  delay = 0;
  await page.locator('#analyzeButton').click();
  await page.waitForFunction(() => document.getElementById('resultSource').textContent === 'individual.png' && !document.getElementById('analyzeButton').disabled);
  await page.locator('[data-view="historial"]').click();
  await page.getByRole('button', { name: 'Ver imagen y datos de individual.png', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('historyDetailImage').naturalWidth === 600);
  await page.keyboard.press('Escape');
  await page.locator('[data-view="capturar"]').click();
  assert.equal(await page.locator('#imageMode').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => document.getElementById('video').srcObject), null);
  const batchChooser = page.waitForEvent('filechooser');
  await page.locator('#selectImages').click();
  await (await batchChooser).setFiles([file('lote-a.png'), file('lote-b.png')]);
  await page.locator('#analyzeButton').click();
  await page.waitForFunction(() => document.getElementById('readingSelect').options.length === 2 && !document.getElementById('analyzeButton').disabled);
  await page.locator('#readingSelect').selectOption('1');
  assert.equal(await page.locator('#resultSource').textContent(), 'lote-b.png');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator('.source-mode-selector').evaluate(element => element.scrollWidth <= element.clientWidth));
  await page.locator('#cameraMode').click();
  await page.locator('#startLiveCamera').click();
  await page.waitForFunction(() => document.getElementById('video').videoWidth > 0 && document.getElementById('realtime').checked);
  assert.equal(await page.locator('#cropGuide').isVisible(), true);
  assert.ok(await page.locator('.capture-card').evaluate(card => card.scrollWidth <= card.clientWidth));
  assert.ok(await page.locator('#cameraControls').evaluate(controls => {
    const label = controls.querySelector('label').getBoundingClientRect();
    const button = controls.querySelector('button').getBoundingClientRect();
    return Math.abs((label.top + label.height / 2) - (button.top + button.height / 2)) <= 2;
  }));
  assert.equal(await page.locator('#cameraMode').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#selectImages').isVisible(), false);
  await page.locator('#imageMode').click();
  assert.equal(await page.locator('#preview').isVisible(), false);
  assert.equal(await page.locator('#selectImagesText').textContent(), 'Seleccionar imágenes');
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async options => {
      await new Promise(resolve => setTimeout(resolve, 300));
      const stream = await original(options); window.lateTrack = stream.getVideoTracks()[0]; return stream;
    };
  });
  await page.locator('#cameraMode').click();
  await page.locator('#startLiveCamera').click();
  await page.locator('#imageMode').click();
  await page.waitForFunction(() => window.lateTrack?.readyState === 'ended');
  assert.equal(await page.evaluate(() => document.getElementById('video').srcObject), null);
  assert.deepEqual(errors, []);
  console.log('OK: cambio de modo cancela la cámara, selector de archivos, análisis individual/lote, historial con foto, navegación, regreso a cámara, móvil y permiso tardío.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
