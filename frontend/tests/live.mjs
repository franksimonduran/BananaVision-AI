/* Real frontend -> FastAPI -> included Keras model; requires the installed Python environment. */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const backend = resolve(root, 'bakend');
const portProbe = createServer();
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const python = process.env.BANANA_PYTHON || resolve(backend, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const server = spawn(python, ['-m', 'uvicorn', 'src.main:app', '--host', '127.0.0.1', '--port', String(port)], { cwd: backend, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '', startupError;
server.stdout.on('data', chunk => { log += chunk; });
server.stderr.on('data', chunk => { log += chunk; });
server.on('error', error => { startupError = error; });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (startupError) throw startupError;
    if (server.exitCode !== null) throw new Error(log);
    try { const response = await fetch(`${origin}/health`); ready = response.ok && (await response.json()).model_loaded === true; } catch { /* Wait for startup. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(ready, true, `No se cargó el modelo real:\n${log}`);
  browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.waitForFunction(() => document.getElementById('statusText').textContent === 'Modelo conectado');
  await page.locator('[data-view="capturar"]').click();
  const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 100; const context = canvas.getContext('2d'); context.fillStyle = '#e4c456'; context.fillRect(0, 0, 160, 100); return canvas.toDataURL('image/png').split(',')[1]; });
  const file = name => ({ name, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.locator('#fileInput').setInputFiles(file('integracion-real.png'));
  await page.locator('#analyzeButton').click();
  await page.waitForFunction(() => !document.getElementById('resultContent').hidden && document.getElementById('stage').getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('#dashTotal').textContent(), '1');
  assert.ok((await page.locator('#recommendationTwoText').textContent()).length > 0);
  console.log('OK Imagen individual -> FastAPI -> modelo Keras real -> recomendaciones -> panel');
  await page.locator('#fileInput').setInputFiles([file('lote-real-a.png'), file('lote-real-b.png')]);
  await page.locator('#analyzeButton').click();
  await page.waitForFunction(() => document.getElementById('readingSelect').options.length === 2 && !document.getElementById('readingSelect').disabled);
  await page.locator('#readingSelect').selectOption('1');
  assert.equal(await page.locator('#resultSource').textContent(), 'lote-real-b.png');
  assert.equal(await page.locator('#dashTotal').textContent(), '3');
  await page.locator('[data-view="historial"]').click();
  assert.equal(await page.locator('#historyBody tr').count(), 3);
  await page.reload();
  assert.equal(await page.locator('#historyBody tr').count(), 3);
  assert.deepEqual(errors, []);
  console.log('OK Lote -> modelo real -> selección sincronizada -> historial persistente; cero errores JavaScript');
  await page.context().grantPermissions(['camera'], { origin });
  await page.locator('[data-view="capturar"]').click();
  await page.locator('#startLiveCamera').click();
  await page.waitForFunction(() => document.getElementById('video').videoWidth > 0 && document.getElementById('realtime').checked);
  await page.waitForFunction(() => document.getElementById('resultSource').textContent === 'Captura de cámara' && document.getElementById('stage').getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('#realtime').isChecked(), true);
  assert.equal(await page.locator('#dashTotal').textContent(), '3'); // lecturas automáticas no son muestras distintas
  await page.locator('#saveCameraSample').click();
  await page.waitForFunction(() => document.getElementById('dashTotal').textContent === '4' && document.getElementById('stage').getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('#realtime').isChecked(), false);
  assert.equal(await page.locator('#historyBody tr').count(), 4);
  await page.locator('#stopCamera').click();
  assert.equal(await page.locator('#video').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('OK Cámara virtual -> análisis automático -> FastAPI -> modelo Keras real -> pausa y detención');
} finally {
  if (browser) await browser.close();
  if (server.pid && server.exitCode === null) {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else server.kill('SIGTERM');
  }
}
