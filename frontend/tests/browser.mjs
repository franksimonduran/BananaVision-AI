/* Run with Playwright installed separately; the application has no npm dependency. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    response.end(body);
  } catch { if (response.headersSent) response.end(); else response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const passed = [], errors = [], resourceErrors = [];
const record = message => { passed.push(message); console.log(`OK ${message}`); };
const reading = (label = 'APTO', confidence = .86, time = 120) => ({ label, confidence, inference_time_ms: time, threshold: .7, conclusive: label !== 'NO CONCLUYENTE', predicted_class: label === 'NO APTO' ? 'NO APTO' : 'APTO', probabilities: { APTO: label === 'NO APTO' ? 1 - confidence : confidence, 'NO APTO': label === 'NO APTO' ? confidence : 1 - confidence }, recommendation: { message: 'Evaluación visual preliminar.', action: 'Revisa manualmente la muestra antes de decidir.', storage: 'Mantén la muestra identificada mientras revisas.' } });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['camera'] });
  await context.addInitScript(() => {
    window.testVoiceAlerts = [];
    window.testGumCalls = 0;
    const realGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (...args) => { window.testGumCalls++; return realGum(...args); };
    class FakeUtterance { constructor(text) { this.text = text; } }
    const speech = {
      speak(utterance) { window.testVoiceAlerts.push({ text: utterance.text, at: performance.now() }); },
      cancel() {}, resume() {}, pause() {},
      getVoices: () => [{ lang: 'es-ES', name: 'Voz de prueba', default: true }],
      addEventListener() {}, removeEventListener() {}, speaking: false, pending: false, paused: false
    };
    window.SpeechSynthesisUtterance = FakeUtterance;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: speech });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    // Controlled HTTP/network failures are exercised below; script errors are not.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400 && !/\/(health|predict)(\/batch)?$/.test(new URL(response.url()).pathname)) resourceErrors.push(`${response.status()} ${response.url()}`);
  });
  let healthState = 'ready', mode = 'success', delay = 0, active = 0, maximumActive = 0;
  await page.route('**/health', route => healthState === 'network' ? route.abort() : route.fulfill({ status: healthState === 'unavailable' ? 503 : 200, json: { model_loaded: healthState !== 'unavailable', limits: { image_mb: 5, batch_files: 10, batch_mb: 20 } } }));
  await page.route('**/model/info', route => route.fulfill({ json: { model_name: 'Modelo de prueba', parameters: 538508, input_shape: [224, 224, 3] } }));
  await page.route('**/predict', async route => {
    active++; maximumActive = Math.max(maximumActive, active);
    try {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (mode === 'error') await route.fulfill({ status: 500, json: { detail: 'Fallo de prueba controlado' } });
      else await route.fulfill({ json: mode === 'reject' ? reading('NO APTO', .93) : mode === 'uncertain' ? reading('NO CONCLUYENTE', .6) : reading() });
    } finally { active--; }
  });
  await page.route('**/predict/batch', route => route.fulfill({ json: [reading('NO APTO', .93, 152), reading('NO CONCLUYENTE', .6, 155)] }));
  await page.goto(`${origin}/#dashboard`);
  await page.waitForFunction(() => document.getElementById('sidebarStatusText').textContent === 'Modelo conectado');
  assert.equal(await page.locator('#dashTotal').textContent(), '0');
  assert.equal(await page.locator('#view-dashboard').isVisible(), true);
  record('Panel inicial sin datos simulados y navegación accesible');

  const png = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 340;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fdfcf8'; ctx.fillRect(0, 0, 600, 340);
    const banana = new Image(); banana.src = 'assets/banana.svg'; await banana.decode(); ctx.drawImage(banana, 0, 0, 600, 340);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const file = name => ({ name, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.locator('[data-view="capturar"]').click();
  assert.equal(await page.locator('#cameraIdle').isVisible(), true);
  assert.equal(await page.locator('#video').isVisible(), false);
  assert.equal(await page.evaluate(() => window.testGumCalls), 0);
  await page.locator('#cameraMode').click();
  await page.locator('#startLiveCamera').click();
  await page.waitForFunction(() => document.getElementById('video').videoWidth > 0 && document.getElementById('realtime').checked);
  assert.equal(await page.evaluate(() => window.testGumCalls), 1);
  assert.equal(await page.locator('#cameraIdle').isVisible(), false);
  await page.waitForFunction(() => !document.getElementById('cropGuide').hidden);
  assert.equal(await page.locator('#cropGuideText').textContent(), 'Área analizada');
  assert.equal(await page.getByRole('button', { name: 'Subir imagen' }).count(), 0);
  record('Al entrar en Análisis la cámara no se solicita sola; con «Iniciar cámara» aparece la guía de área y el análisis en vivo queda activo');
  await page.locator('#fileInput').setInputFiles(file('muestra-a.png'));
  await page.waitForFunction(() => document.getElementById('video').srcObject === null);
  await page.locator('#resultEmpty').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#resultEmpty').isVisible(), true);
  assert.equal(await page.locator('#resultContent').isVisible(), false);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('800 48px Manrope')), true);
  // Se limpia el historial anterior: NO APTO continuos sí se guardan automáticamente.
  await page.locator('[data-view="historial"]').click();
  if (Number(await page.locator('#navCount').textContent())) {
    await page.locator('#clearHistory').click();
    await page.locator('#clearHistoryDialog button[value="clear"]').click();
    await page.waitForFunction(() => document.getElementById('dashTotal').textContent === '0');
  }
  await page.locator('[data-view="capturar"]').click();
  await page.waitForFunction(() => document.getElementById('view-capturar').hidden === false && document.getElementById('video').hidden && !document.getElementById('video').srcObject);
  await page.locator('#fileInput').setInputFiles(file('muestra-a.png'));
  assert.ok((await page.locator('#selectionMeta').textContent()).includes('/ PNG'));
  assert.equal(await page.locator('#selectionThumbnail').isVisible(), true);
  await page.locator('#analyzeButton').click();
  await page.waitForFunction(() => document.getElementById('resultSource').textContent === 'muestra-a.png' && !document.getElementById('resultContent').hidden);
  assert.equal(await page.locator('#resultLabel').textContent(), 'APTO');
  assert.equal(await page.evaluate(() => window.testVoiceAlerts.length), 0);
  assert.equal(await page.locator('#resultHeadline').textContent(), 'Apto para continuar');
  assert.equal(await page.locator('#recommendationOneTitle').textContent(), 'Continuar evaluación');
  for(const removedId of ['probApto', 'probNoApto', 'thresholdValue', 'inferenceTime', 'resultDisclaimer', 'voiceStatus']) {
    assert.equal(await page.locator('#' + removedId).count(), 0);
  }
  assert.equal(await page.locator('#recommendationTwoText').isVisible(), true);
  assert.equal(await page.locator('#resultThumbnail').evaluate(img => img.complete && img.naturalWidth > 0), true);
  assert.equal(await page.locator('#dashTotal').textContent(), '1');
  record('Imagen, resultado, miniatura y recomendaciones juntos; panel actualizado');

  await page.locator('#fileInput').setInputFiles([file('lote-b.png'), file('lote-c.png')]);
  await page.locator('#analyzeButton').click();
  await page.waitForFunction(() => document.getElementById('readingSelect').options.length === 2 && !document.getElementById('readingSelect').disabled);
  const batchAlerts = await page.evaluate(() => window.testVoiceAlerts);
  assert.equal(batchAlerts.length, 1);
  assert.equal(batchAlerts[0].text, 'Atención, producto no apto para exportación.');
  await page.locator('#readingSelect').selectOption('1');
  assert.equal(await page.locator('#resultSource').textContent(), 'lote-c.png');
  assert.equal(await page.locator('#resultLabel').textContent(), 'NO CONCLUYENTE');
  assert.equal(await page.locator('#dashTotal').textContent(), '3');
  const mean = await page.locator('#dashTime').textContent();
  await page.locator('#readingSelect').selectOption('0');
  assert.equal(await page.locator('#dashTime').textContent(), mean);
  assert.equal(await page.evaluate(() => window.testVoiceAlerts.length), 1);
  record('Lotes sincronizados y métricas independientes del resultado seleccionado');

  await page.locator('[data-view="dashboard"]').click();
  await page.waitForFunction(() => getComputedStyle(document.getElementById('view-dashboard')).opacity === '1');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#distributionLegend .legend-row').count(), 3);
  assert.equal(await page.locator('#confidenceChart circle[tabindex]').count(), 3);
  await page.locator('#confidenceChart circle[tabindex]').first().focus();
  assert.equal(await page.locator('#confidenceChart .chart-tooltip').isVisible(), true);
  await page.locator('#activityPeriod').selectOption('30');
  assert.equal(await page.locator('#activityChart rect').count(), 30);
  record('Gráficos con datos reales, periodo seleccionable y detalles por teclado');

  await page.locator('[data-view="historial"]').click();
  await page.locator('#historySearch').fill('lote');
  assert.equal(await page.locator('#historyBody tr').count(), 2);
  await page.locator('#historyStatus').selectOption('NO APTO');
  assert.equal(await page.locator('#historyBody tr').count(), 1);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportHistory').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'bananavision-ai-historial.csv');
  const stream = await download.createReadStream(); let csv = '';
  for await (const chunk of stream) csv += chunk.toString('utf8');
  assert.ok(csv.includes('lote-b.png')); assert.ok(!csv.includes('lote-c.png'));
  await page.locator('#resetFilters').click();
  await page.reload();
  assert.equal(await page.locator('#historyBody tr').count(), 3);
  assert.equal(await page.locator('#dashTotal').textContent(), '3');
  assert.equal(await page.locator('#sessionCount').textContent(), '0 lecturas en esta sesión');
  record('Historial independiente: filtros combinados, CSV filtrado y persistencia');

  await page.locator('[data-view="capturar"]').click();
  const beforeDrop = await page.locator('#dashTotal').textContent();
  await page.evaluate(base64 => {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'arrastrada.png', { type: 'image/png' }));
    const stage = document.getElementById('stage');
    stage.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    if (!stage.classList.contains('dragover')) throw new Error('No aparece el estado dragover');
    stage.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, png);
  await page.waitForFunction(() => document.getElementById('preview').complete && document.getElementById('preview').naturalWidth > 0);
  assert.equal(await page.locator('#selectionText').textContent(), 'arrastrada.png');
  assert.equal(await page.locator('#preview').evaluate(img => img.complete && img.naturalWidth > 0), true);
  assert.equal(await page.locator('#dashTotal').textContent(), beforeDrop);
  assert.equal(await page.locator('#stage').evaluate(stage => stage.classList.contains('dragover')), false);
  record('Drag & drop conserva vista previa, metadatos y análisis explícito');

  for (const width of [320, 390, 768, 1024, 1366, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const view of ['dashboard', 'capturar', 'historial']) {
      await page.locator(`[data-view="${view}"]`).click();
      await page.waitForTimeout(80);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `Desbordamiento en ${view} a ${width}px`);
      if (view === 'capturar') {
        const tops = await page.locator('.feature-card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().top));
        assert.ok(Math.max(...tops) - Math.min(...tops) < 2, `Tarjetas descriptivas fuera de fila a ${width}px`);
      }
      if (view === 'capturar' && width >= 1366) {
        const dimensions = await page.evaluate(() => {
          const sample = document.querySelector('.capture-card').getBoundingClientRect(), result = document.querySelector('.result-card').getBoundingClientRect();
          return { ratio: sample.width / (sample.width + result.width), sameRow: Math.abs(sample.top - result.top) < 1, heightDifference: Math.abs(sample.height - result.height) };
        });
        assert.equal(dimensions.sameRow, true);
        assert.ok(Math.abs(dimensions.ratio - .46) < .02);
        assert.ok(dimensions.heightDifference < 2);
      }
    }
  }
  record('Responsive de 320 a 2560px, proporción 46/54 y paneles de igual altura en desktop');

  await page.locator('[data-view="capturar"]').click();
  await page.locator('#fileInput').setInputFiles(file('reintento.png'));
  await page.locator('#analyzeButton').click();
  await page.waitForFunction(() => document.getElementById('resultLabel').textContent === 'APTO' && document.getElementById('stage').getAttribute('aria-busy') === 'false');
  mode = 'error';
  await page.locator('#analyzeButton').click();
  await page.waitForFunction(() => document.getElementById('noticeText').textContent.includes('Tu muestra sigue disponible'));
  assert.equal(await page.locator('#resultContent').isVisible(), true);
  mode = 'reject'; delay = 1200;
  const alertsBeforeCancel = await page.evaluate(() => window.testVoiceAlerts.length);
  const beforeCancel = await page.locator('#dashTotal').textContent();
  await page.locator('#analyzeButton').click();
  assert.equal(await page.locator('#overlay').isVisible(), true);
  await page.locator('#cameraMode').click(); // cambiar de modo cancela la solicitud pendiente
  assert.equal(await page.locator('#overlay').isVisible(), false);
  assert.equal(await page.locator('#analyzeButton').isEnabled(), true);
  await page.waitForTimeout(1400);
  assert.equal(await page.locator('#dashTotal').textContent(), beforeCancel);
  assert.equal(await page.evaluate(() => window.testVoiceAlerts.length), alertsBeforeCancel);
  mode = 'success';
  record('Fallo distingue lectura anterior; cancelar libera controles y descarta respuestas tardías');

  delay = 150;
  await page.locator('#cameraMode').click();
  await page.locator('#startLiveCamera').click();
  await page.waitForFunction(() => document.getElementById('video').videoWidth > 0 && document.getElementById('realtime').checked);
  await page.waitForFunction(() => document.getElementById('resultSource').textContent === 'Captura de cámara' && document.getElementById('stage').getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('#resultThumbnail').evaluate(img => img.naturalWidth), 672);
  const cameraThumbnail = await page.locator('#resultThumbnail').getAttribute('src');
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.testTracks = document.getElementById('video').srcObject.getTracks(); });
  await page.locator('#stopCamera').click();
  assert.equal(await page.evaluate(() => window.testTracks.every(track => track.readyState === 'ended')), true);
  assert.equal(await page.locator('#analyzeButton').isDisabled(), true);
  assert.equal(maximumActive, 1);
  assert.ok(cameraThumbnail?.startsWith('blob:'));
  assert.equal(await page.locator('#rejectionCount').textContent(), '0');
  assert.equal(await page.evaluate(() => window.testVoiceAlerts.length), alertsBeforeCancel);
  record('Cámara virtual automática: APTO sin guardar fotografías ni avisos de voz, continuo sin solapamientos y pistas liberadas');

  mode = 'reject'; delay = 1000;
  await page.locator('#cameraMode').click();
  await page.locator('#startLiveCamera').click();
  await page.waitForFunction(() => document.getElementById('stage').getAttribute('aria-busy') === 'true');
  await page.locator('#stopCamera').click();
  await page.locator('#fileInput').setInputFiles(file('despues-cancelar.png'));
  assert.equal(await page.locator('#analyzeButton').isEnabled(), true);
  await page.waitForTimeout(1100); delay = 0;
  assert.equal(await page.locator('#rejectionCount').textContent(), '0');
  assert.equal(await page.evaluate(() => window.testVoiceAlerts.length), alertsBeforeCancel);
  mode = 'success';
  record('Detener cámara durante una inferencia permite seleccionar una nueva muestra inmediatamente');

  healthState = 'unavailable'; await page.locator('#connectionStatus').click();
  await page.waitForFunction(() => document.getElementById('sidebarStatusText').textContent === 'Modelo no disponible');
  assert.equal(await page.locator('#analyzeButton').isDisabled(), true);
  healthState = 'network'; await page.locator('#connectionStatus').click();
  await page.waitForFunction(() => document.getElementById('sidebarStatusText').textContent === 'Sin conexión');
  healthState = 'ready'; await page.locator('#retryConnection').click();
  await page.waitForFunction(() => !document.getElementById('analyzeButton').disabled);
  record('Modelo no disponible y fallo de red se distinguen; recuperación conserva la muestra');

  await page.locator('[data-settings]:visible').first().click();
  await page.locator('#apiUrl').fill(origin);
  await page.locator('#settingsForm button[type="submit"]').click();
  await page.waitForFunction(() => !document.getElementById('settingsDialog').open && document.getElementById('sidebarStatusText').textContent === 'Modelo conectado');
  await page.locator('#openHelp').click();
  assert.equal(await page.getByRole('dialog', { name: /Una mejor imagen/ }).isVisible(), true);
  await page.keyboard.press('Escape');
  record('Configuración y guía operativas con diálogos nombrados');

  mode = 'reject';
  await page.locator('#analyzeButton').click();
  await page.waitForFunction(() => document.getElementById('stage').getAttribute('aria-busy') === 'false' && document.getElementById('resultLabel').textContent === 'NO APTO');
  assert.equal(await page.locator('#resultLabel').textContent(), 'NO APTO');
  const rejectionAlerts = await page.evaluate(() => window.testVoiceAlerts.length);
  assert.equal(rejectionAlerts, alertsBeforeCancel + 1);
  await page.locator('[data-view="historial"]').click();
  await page.locator('[data-view="capturar"]').click();
  assert.equal(await page.evaluate(() => window.testVoiceAlerts.length), rejectionAlerts);
  mode = 'uncertain';
  await page.locator('#analyzeButton').click();
  await page.waitForFunction(() => document.getElementById('stage').getAttribute('aria-busy') === 'false' && document.getElementById('resultLabel').textContent === 'NO CONCLUYENTE');
  assert.equal(await page.locator('#resultLabel').textContent(), 'NO CONCLUYENTE');
  assert.equal(await page.evaluate(() => window.testVoiceAlerts.length), rejectionAlerts);
  await page.locator('#voiceEnabled').uncheck();
  await page.reload();
  await page.waitForFunction(() => document.getElementById('sidebarStatusText').textContent === 'Modelo conectado');
  assert.equal(await page.locator('#voiceEnabled').isChecked(), false);
  await page.locator('#fileInput').setInputFiles(file('rechazo-silenciado.png'));
  mode = 'reject';
  await page.locator('#analyzeButton').click();
  await page.waitForFunction(() => document.getElementById('stage').getAttribute('aria-busy') === 'false' && document.getElementById('resultHeadline').textContent === 'Revisión requerida');
  assert.equal(await page.evaluate(() => window.testVoiceAlerts.length), 0);
  await page.locator('#voiceEnabled').check();
  assert.equal(await page.evaluate(() => window.testVoiceAlerts.length), 0);
  await page.locator('#cameraMode').click();
  await page.locator('#startLiveCamera').click();
  await page.waitForFunction(() => document.getElementById('video').videoWidth > 0 && document.getElementById('realtime').checked);
  await page.waitForTimeout(6200);
  await page.locator('#stopCamera').click();
  const voiceTimes = await page.evaluate(() => window.testVoiceAlerts);
  assert.equal(voiceTimes.length, 2);
  assert.ok(voiceTimes[1].at - voiceTimes[0].at >= 5000);
  await page.waitForFunction(() => Number(document.getElementById('rejectionCount').textContent) >= 2);
  const savedRejections = Number(await page.locator('#rejectionCount').textContent());
  assert.equal(await page.locator('.rejection-card').count(), savedRejections);
  await page.waitForFunction(() => [...document.querySelectorAll('.rejection-card img')].every(img => img.complete && img.naturalWidth === 672));
  await page.locator('#fileInput').setInputFiles(file('apres-aviso.png'));
  mode = 'success';
  await page.locator('#analyzeButton').click();
  await page.waitForFunction(() => document.getElementById('stage').getAttribute('aria-busy') === 'false' && document.getElementById('resultLabel').textContent === 'APTO');
  assert.equal(Number(await page.locator('#rejectionCount').textContent()), savedRejections);
  record('Aviso de voz: rechazo individual/lote, en silencio ante incertidumbre/historial/cancelación, preferencia persistente y continuo cada 5 s');

  // Axe may restart CSS animations while collecting styles; inspect the settled UI.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  mode = 'reject';
  await page.locator('#analyzeButton').click();
  await page.waitForFunction(() => document.getElementById('stage').getAttribute('aria-busy') === 'false' && document.getElementById('resultHeadline').textContent === 'Revisión requerida');
  mode = 'success';
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const view of ['dashboard', 'capturar', 'historial']) {
      await page.locator(`[data-view="${view}"]`).click();
      await page.waitForFunction(id => getComputedStyle(document.getElementById(id)).opacity === '1', `view-${view}`);
      await page.locator(`#view-${view}`).evaluate(async section => {
        await new Promise(resolve => requestAnimationFrame(resolve));
        await Promise.all(section.getAnimations().map(animation => animation.finished));
      });
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(accessibility.violations.map(issue => ({ id: issue.id, nodes: issue.nodes.map(node => node.target) })), [], `Accesibilidad de ${view} a ${width}px`);
    }
  }
  record('Comprobación automatizada WCAG A/AA de las tres vistas en escritorio y móvil');

  if (process.argv.includes('--premium-screenshots')) {
    await page.locator('[data-view="capturar"]').click();
    await page.locator('#fileInput').setInputFiles(file('banana_muestra.png'));
    await page.locator('#analyzeButton').click();
    await page.waitForFunction(() => document.getElementById('stage').getAttribute('aria-busy') === 'false');
    for (const [width, height] of [[1920, 1080], [2560, 1440], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await page.screenshot({ path: resolve(root, `../docs/saas-capturar-${width}.png`), fullPage: true, animations: 'disabled' });
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload();
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: resolve(root, '../docs/saas-capturar-vacio.png'), fullPage: true, animations: 'disabled' });
  }

  if (process.argv.includes('--screenshots')) {
    const screenshotView = async (view, filename) => {
      await page.locator(`[data-view="${view}"]`).click();
      await page.waitForFunction(view => {
        const section = document.getElementById(`view-${view}`);
        return !section.hidden && getComputedStyle(section).opacity === '1';
      }, view);
      await page.screenshot({ path: resolve(root, `../docs/${filename}`), fullPage: true, animations: 'disabled' });
    };
    await page.setViewportSize({ width: 1440, height: 1000 });
    await screenshotView('dashboard', 'bananavision-panel.png');
    await page.locator('[data-view="capturar"]').click();
    await page.locator('#analyzeButton').click();
    await page.waitForFunction(() => document.getElementById('stage').getAttribute('aria-busy') === 'false');
    await screenshotView('capturar', 'bananavision-capturar.png');
    await screenshotView('historial', 'bananavision-historial.png');
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshotView('dashboard', 'bananavision-movil.png');
  }

  await page.locator('[data-view="historial"]').click();
  await page.locator('#clearHistory').click();
  await page.getByRole('button', { name: 'Conservar historial' }).click();
  assert.ok(Number(await page.locator('#navCount').textContent()) > 0);
  await page.locator('#clearHistory').click();
  await page.locator('#clearHistoryDialog button[value="clear"]').click();
  await page.waitForFunction(() => document.getElementById('dashTotal').textContent === '0');
  await page.reload();
  assert.equal(await page.locator('#navCount').textContent(), '0');
  record('Borrado confirmado y persistente, con el panel sincronizado');

  await page.locator('[data-view="capturar"]').click();
  await page.waitForFunction(count => Number(document.getElementById('rejectionCount').textContent) === count, savedRejections);
  const jpgDownload = page.waitForEvent('download');
  await page.locator('.rejection-card a[download]').first().click();
  const jpg = await jpgDownload;
  assert.ok(jpg.suggestedFilename().startsWith('no-apto-') && jpg.suggestedFilename().endsWith('.jpg'));
  const jpgStream = await jpg.createReadStream(), chunks = [];
  for await (const chunk of jpgStream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).readUInt16BE(0), 0xffd8);
  await page.locator('.rejection-card button').first().click();
  await page.waitForFunction(count => Number(document.getElementById('rejectionCount').textContent) === count, savedRejections - 1);
  await page.locator('#clearRejections').click();
  await page.locator('#clearRejectionsDialog button[value="clear"]').click();
  await page.waitForFunction(() => document.getElementById('rejectionCount').textContent === '0');
  record('Solo rechazos de cámara: persistencia tras recargar, descarga JPG y borrado independiente del historial');

  const migrated = await browser.newContext();
  await migrated.addInitScript(() => localStorage.setItem('bananaStudioHistoryV2', JSON.stringify([{ name: 'historial-anterior.png', label: 'APTO', confidence: .82, inference_time_ms: 100, timestamp: new Date().toISOString() }])));
  const legacyPage = await migrated.newPage();
  await legacyPage.route('**/health', route => route.fulfill({ json: { model_loaded: true } }));
  await legacyPage.goto(origin);
  assert.equal(await legacyPage.locator('#dashTotal').textContent(), '1');
  assert.ok((await legacyPage.locator('#recentReadings').textContent()).includes('historial-anterior.png'));
  record('La actualización preserva el historial de Banana Studio');
  await migrated.close();

  const blocked = await browser.newContext();
  await blocked.addInitScript(() => { window.testGumCalls = 0; navigator.mediaDevices.getUserMedia = async () => { window.testGumCalls++; throw new DOMException('Permission denied', 'NotAllowedError'); }; });
  const blockedPage = await blocked.newPage();
  blockedPage.on('pageerror', error => errors.push(error.message));
  await blockedPage.route('**/health', route => route.fulfill({ json: { model_loaded: true } }));
  await blockedPage.goto(origin);
  await blockedPage.locator('#cameraIdle').waitFor({ state: 'visible' });
  assert.equal(await blockedPage.evaluate(() => window.testGumCalls), 0);
  assert.equal(await blockedPage.locator('#view-capturar').isVisible(), true);
  assert.equal(await blockedPage.locator('#stage').isVisible(), false);
  await blockedPage.locator('#startLiveCamera').click();
  assert.equal(await blockedPage.evaluate(() => window.testGumCalls), 1);
  await blockedPage.waitForFunction(() => document.getElementById('noticeText').textContent.includes('Permite el acceso'));
  assert.equal(await blockedPage.locator('#video').isVisible(), false);
  assert.equal(await blockedPage.locator('#startLiveCamera').isEnabled(), true);
  assert.equal(await blockedPage.locator('#resultEmpty').isVisible(), true);
  await blockedPage.evaluate(base64 => {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'arrastrada-bloqueada.png', { type: 'image/png' }));
    const panel = document.getElementById('cameraIdle');
    panel.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    if (!panel.classList.contains('dragover')) throw new Error('No aparece el estado dragover en el panel de cámara');
    panel.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, png);
  await blockedPage.waitForFunction(() => document.getElementById('selectionText').textContent === 'arrastrada-bloqueada.png');
  assert.equal(await blockedPage.locator('#stage').isVisible(), true);
  assert.equal(await blockedPage.locator('#analyzeButton').isEnabled(), true);
  await blocked.close();
  record('Cámara bloqueada: aviso accesible, reintento y arrastre de imagen sobre el panel principal');
  assert.deepEqual(errors, []);
  assert.deepEqual(resourceErrors, [], 'Recursos del frontend no disponibles');
  console.log(`\n${passed.length} recorridos aprobados; cero errores JavaScript no controlados.`);
  await context.close();
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
