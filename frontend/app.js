import CONFIG from './config.js?v=20261006-11';
import ApiClient from './api.js';
import ExportAlert from './voice.js?v=20261006-8';
import RejectionStore from './rejections.js';
import HistoryImages from './history-images.js';
import CloudClient from './cloud.js?v=20261007-1';
import { API_KEY, HISTORY_KEY, VOICE_KEY, DISCLAIMER, resultCopy, exportLabel, loadHistory, saveHistory, storageGet, validApiUrl, validateResult, percentage, elapsed, badgeClass, formatDate, filterHistory, paginateHistory, csvContent } from './data.js?v=20261006-15';
import { renderActivity, renderDistribution, renderConfidence } from './charts.js?v=20261006-6';

const $ = id => document.getElementById(id);
const alertVoice = new ExportAlert({ enabled: storageGet(VOICE_KEY) !== 'false', intervalMs: CONFIG.ALERT_INTERVAL_MS });
const rejectionStore = new RejectionStore();
const historyImages = new HistoryImages();
const cloud = new CloudClient();
let historyDetailUrl = null, historyDetailTicket = 0;
const rejectionCards = new Map();
let rejectionLimit = 50, rejectionTicket = 0, rejectionStorageError = '';
$('voiceEnabled').checked = alertVoice.enabled;

function syncVoiceStatus() {
  $('voiceStatus').textContent = !alertVoice.enabled ? 'Voz silenciada. Las alertas visuales siguen activas.'
    : !alertVoice.available ? 'Este navegador no admite síntesis de voz. Las alertas visuales siguen activas.'
    : `Aviso para NO APTO · máximo cada ${CONFIG.ALERT_INTERVAL_MS / 1000} s`;
}

function unlockVoice() {
  alertVoice.unlock();
  syncVoiceStatus();
}

function alertExportResults(results, continuous) {
  const rejected = results.filter(result => result.label === 'NO APTO').length;
  if (rejected) alertVoice.speak(rejected === 1 ? 'Atención. Resultado NO APTO. Se requiere revisión manual.' : `Atención. Hay ${rejected} resultados NO APTO. Se requiere revisión manual.`, { continuous });
}
const viewNames = { dashboard: 'Panel', capturar: 'Análisis', historial: 'Historial' };
const state = {
  history: loadHistory(), historyPage: 1, sourceMode: 'camera', files: [], readings: [], stream: null,
  previewUrl: null, thumbnailUrl: null, job: null, cameraPending: false,
  cameraTicket: 0, realtimeRunning: false, realtimeWanted: true, apiReady: false, sessionTotal: 0,
  limits: { image_mb: CONFIG.MAX_IMAGE_SIZE_MB, batch_files: CONFIG.MAX_BATCH_FILES, batch_mb: CONFIG.MAX_BATCH_SIZE_MB },
  view: 'capturar', cloudEnabled: false, cloudInitializing: true, account: null
};
let api;
try { api = new ApiClient(validApiUrl(storageGet(API_KEY) || CONFIG.API_BASE)); }
catch { api = new ApiClient(CONFIG.API_BASE); }

function notice(message, kind = 'success') {
  $('noticeText').textContent = message;
  $('notice').dataset.kind = kind;
  $('notice').setAttribute('role', kind === 'error' ? 'alert' : 'status');
  $('notice').hidden = false;
}


let cloudTicket = 0;

function clearRejectionCards() {
  rejectionTicket++;
  for (const [, card] of rejectionCards) {
    URL.revokeObjectURL(card.url);
    card.node.remove();
  }
  rejectionCards.clear();
}

function syncStorageUI() {
  const enabled = !!state.account;
  $('historySaveStatus').textContent = enabled
    ? 'Sin inicio de sesión: los NO APTO de la cámara continua se guardan automáticamente en tu historial privado en la nube. Los demás análisis se guardan manualmente.'
    : state.cloudInitializing ? 'Preparando el historial automático…'
      : 'Guardado local sin cuenta: los NO APTO de la cámara continua se registran en este navegador. Sin almacenamiento en la nube.';
  $('dashboardStorageLabel').textContent = enabled
    ? 'Historial privado en la nube · Sin inicio de sesión' : 'Historial guardado en este navegador';
  $('dashboardNote').textContent = enabled
    ? 'Los resultados NO APTO de la cámara continua se guardan con fotografía automáticamente. Este historial de nube pertenece a este navegador, sin correo ni contraseña.'
    : 'Los NO APTO se guardan automáticamente en este navegador. Para guardar en la nube, el servidor necesita PostgreSQL.';
  $('historyStorageLabel').textContent = enabled
    ? 'PostgreSQL y fotografías privadas · Sin iniciar sesión' : 'Historial local · No sincronizado';
  $('clearHistoryDescription').textContent = enabled
    ? 'Se eliminarán los análisis de este navegador en la nube, incluidas las capturas NO APTO automáticas y sus fotografías. Puedes exportar CSV primero.'
    : 'Se eliminarán todos los registros y fotografías del historial local. La galería local NO APTO se conserva.';
  $('clearRejectionsDescription').textContent = enabled
    ? 'Se eliminarán las capturas NO APTO automáticas de la galería y también del historial en la nube. Las muestras manuales se conservan.'
    : 'Se eliminarán las fotografías de la galería local. El historial de resultados se conserva.';
  $('importLocalHistory').hidden = !enabled;
  $('importLocalHistory').textContent = 'Importar datos anteriores';
}

async function refreshCloudHistory() {
  if (!state.account) return;
  state.history = await cloud.history();
  refreshData();
}

async function refreshCloudSession({ quiet = false } = {}) {
  const ticket = ++cloudTicket;
  state.cloudInitializing = true;
  syncStorageUI();
  syncControls();
  try {
    let session = await cloud.me();
    if (session.enabled === true) {
      // Reuse previous browser identity where possible, extend its cookie.
      await cloud.anonymous();
      session = await cloud.me();
    }
    const history = session.user ? await cloud.history() : loadHistory();
    if (ticket !== cloudTicket) return;
    const oldId = state.account?.id;
    state.cloudEnabled = session.enabled === true;
    state.account = session.user || null;
    state.history = history;
    if (session.user && api.baseUrl !== location.origin) {
      api = new ApiClient(location.origin);
      try { localStorage.setItem(API_KEY, location.origin); } catch { /* Same-origin access still applies. */ }
    }
    if (oldId !== state.account?.id) { clearRejectionCards(); cloud.images.clear(); }
    refreshData();
    await renderRejections();
  } catch (error) {
    if (ticket !== cloudTicket) return;
    state.cloudEnabled = false;
    state.account = null;
    state.history = loadHistory();
    refreshData();
    notice('No se pudo activar el historial en la nube. Los NO APTO se guardarán localmente en este navegador.', 'error');
  } finally {
    if (ticket === cloudTicket) {
      state.cloudInitializing = false;
      syncStorageUI();
      syncControls();
    }
  }
}

function icon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`); svg.append(use);
  return svg;
}

function badge(label) {
  const span = document.createElement('span');
  span.className = `badge ${badgeClass(label)}`; span.textContent = label;
  return span;
}

function navigate(initial = false) {
  const requested = location.hash.slice(1);
  const view = Object.hasOwn(viewNames, requested) ? requested : 'capturar';
  if (requested !== view) history.replaceState(null, '', `#${view}`);
  if (state.view === 'capturar' && view !== 'capturar') stopCamera();
  state.view = view;
  document.querySelectorAll('.page-view').forEach(section => { section.hidden = section.id !== `view-${view}`; });
  document.querySelectorAll('[data-view]').forEach(link => {
    const active = link.dataset.view === view;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  $('pageName').textContent = viewNames[view];
  document.title = `${viewNames[view]} · BananaVision AI`;
  if (view === 'dashboard') renderDashboard();
  if (view === 'capturar') {
    requestAnimationFrame(updateCropGuide);
    // La cámara solo se solicita cuando la persona pulsa «Iniciar cámara en vivo».
  }
  if (!initial) { window.scrollTo({ top: 0, behavior: 'instant' }); $('mainContent').focus({ preventScroll: true }); }
}

function syncControls() {
  const busy = !!state.job;
  const unavailable = state.cloudInitializing;
  const imageMode = state.sourceMode === 'images';
  $('cameraMode').setAttribute('aria-pressed', String(!imageMode));
  $('imageMode').setAttribute('aria-pressed', String(imageMode));
  $('cameraIdleTitle').textContent = imageMode ? 'Inspección por imágenes' : 'Inicia una inspección';
  $('cameraIdleDescription').textContent = imageMode ? 'Selecciona una fotografía o un lote para analizar.' : 'Centra un solo plátano y utiliza una iluminación uniforme.';
  $('startLiveCamera').hidden = imageMode;
  $('selectImages').hidden = !imageMode;
  $('selectImages').disabled = busy;
  $('selectImagesText').textContent = state.files.length ? 'Cambiar imágenes' : 'Seleccionar imágenes';
  $('analyzeButton').disabled = unavailable || !state.apiReady || busy || state.cameraPending || (!state.stream && !state.files.length) || $('realtime').checked;
  $('analyzeButtonText').textContent = busy ? state.job.fromCamera ? 'Analizando en vivo' : 'Analizando…' : !state.apiReady ? 'Esperando conexión al modelo' : $('realtime').checked ? 'Analizando en vivo' : state.files.length > 1 ? `Analizar ${state.files.length} muestras` : 'Analizar muestra';
  $('realtime').disabled = unavailable || !state.apiReady || !state.stream || state.cameraPending || (busy && !$('realtime').checked);
  document.querySelectorAll('[data-settings]').forEach(button => { button.disabled = busy; });
  $('readingSelect').disabled = busy;
  $('overlay').hidden = !busy || state.job.fromCamera;
  $('stage').setAttribute('aria-busy', String(busy));
  $('cameraIdle').hidden = !!state.stream;
  $('cameraIdle').classList.toggle('camera-idle-compact', !!state.files.length);
  $('stage').hidden = !state.stream && !state.files.length;
  $('startLiveCamera').disabled = unavailable || !state.apiReady || busy || state.cameraPending;
  $('startLiveCameraText').textContent = state.cameraPending ? 'Esperando permiso…' : 'Iniciar cámara en vivo';
  $('cameraControls').hidden = !state.stream;
  $('saveCameraSample').disabled = unavailable || !state.stream || !state.apiReady || state.cameraPending;
  $('fileLimits').textContent = `JPG, PNG o WebP · Hasta ${state.limits.image_mb} MB por imagen`;
  $('batchLimits').textContent = `Hasta ${state.limits.batch_files} imágenes · ${state.limits.batch_mb} MB por lote`;
  syncSampleSummary();
}

async function renderRejections() {
  const ticket = ++rejectionTicket;
  try {
    const { items, total } = state.account ? await cloud.rejections(rejectionLimit) : await rejectionStore.snapshot(rejectionLimit);
    if (ticket !== rejectionTicket) return;
    $('rejectionCount').textContent = String(total);
    $('rejectionEmpty').hidden = total > 0;
    $('clearRejections').disabled = total === 0;
    $('loadMoreRejections').hidden = items.length >= total;
    $('rejectionCapacity').textContent = rejectionStorageError || `${items.length} de ${total} capturas recientes · ${state.account ? 'Guardadas en la nube y en Historial' : 'Guardadas en este navegador y en Historial'} · se muestran hasta ${RejectionStore.MAX_CAPTURES}`;
    const visible = new Set(items.map(item => item.id));
    for (const [id, card] of rejectionCards) {
      if (!visible.has(id)) { URL.revokeObjectURL(card.url); card.node.remove(); rejectionCards.delete(id); }
    }
    items.forEach((item, index) => {
      let card = rejectionCards.get(item.id);
      if (!card) {
        const url = URL.createObjectURL(item.blob);
        const node = document.createElement('article'); node.className = 'rejection-card'; node.dataset.captureId = item.id;
        const image = document.createElement('img'); image.src = url; image.alt = 'Fotograma clasificado como no apto para exportación'; image.loading = 'lazy';
        const details = document.createElement('div'); details.className = 'rejection-details';
        const title = document.createElement('strong'); title.textContent = 'NO APTO';
        const time = document.createElement('time'); time.dateTime = item.timestamp; time.textContent = formatDate(item.timestamp);
        const confidence = document.createElement('span'); confidence.textContent = `Confianza ${percentage(item.confidence)}`;
        const actions = document.createElement('div'); actions.className = 'rejection-actions';
        const download = document.createElement('a'); download.href = url; download.download = `no-apto-${item.timestamp.replace(/[:.]/g, '-')}-${item.id.slice(0, 8)}.jpg`; download.className = 'text-link'; download.textContent = 'Descargar JPG';
        const remove = document.createElement('button'); remove.className = 'text-button danger-text'; remove.textContent = 'Eliminar'; remove.setAttribute('aria-label', `Eliminar captura del ${formatDate(item.timestamp)}`);
        remove.addEventListener('click', async () => { try { if (state.account) { await cloud.removeRejection(item.id); await refreshCloudHistory(); } else await rejectionStore.remove(item.id); await renderRejections(); } catch { notice('No se pudo eliminar la captura. Inténtalo de nuevo.', 'error'); } });
        actions.append(download, remove); details.append(title, time, confidence, actions); node.append(image, details);
        card = { url, node }; rejectionCards.set(item.id, card);
      }
      const current = $('rejectionGallery').children[index];
      if (current !== card.node) $('rejectionGallery').insertBefore(card.node, current || null);
    });
  } catch {
    if (ticket === rejectionTicket) $('rejectionCapacity').textContent = 'No se pudieron consultar las capturas. Comprueba la conexión y el almacenamiento.';
  }
}

async function saveRejectedReading(reading) {
  // Un análisis manual ya queda en el historial con su fotografía; aquí solo van los fotogramas del modo continuo.
  if (!reading.continuous || reading.data.label !== 'NO APTO') return;
  try { if (!state.account) await rejectionStore.saveReading(reading); rejectionStorageError = ''; await renderRejections(); }
  catch {
    rejectionStorageError = 'Se detectó un NO APTO, pero no se pudo consultar su fotografía guardada.';
    $('rejectionCapacity').textContent = rejectionStorageError;
    notice(rejectionStorageError, 'error');
  }
}

// Presentation only: describe the selected source without changing upload state.
function syncSampleSummary() {
  const selected = state.readings[Number($('readingSelect').value)]?.file || state.files[0];
  const hasFile = !state.stream && !!state.files.length;
  $('sampleSummary').hidden = !hasFile;
  $('sampleSummary').dataset.selected = String(hasFile || !!state.stream);
  $('selectionMeta').hidden = !hasFile;
  $('selectionThumbnail').hidden = !hasFile || !state.previewUrl;
  if (hasFile && selected) {
    const format = selected.type.split('/')[1]?.replace('jpeg', 'JPG').toUpperCase() || selected.name?.split('.').pop()?.toUpperCase() || 'Imagen';
    const useMb = selected.size >= 1024 ** 2;
    const size = (selected.size / (useMb ? 1024 ** 2 : 1024)).toLocaleString('es-PE', { maximumFractionDigits: 2 });
    $('selectionMeta').textContent = `${size} ${useMb ? 'MB' : 'KB'} / ${format}${state.files.length > 1 ? ` · Lote de ${state.files.length}` : ''}`;
  }
  }

function renderDashboard() {
  const items = state.history, total = items.length;
  const apto = items.filter(item => item.label === 'APTO').length;
  $('dashTotal').textContent = total;
  $('dashApto').textContent = apto;
  $('dashAptoShare').textContent = total ? `${percentage(apto / total)} de los resultados` : 'Sin muestras todavía';
  $('dashConfidence').textContent = total ? percentage(items.reduce((sum, item) => sum + item.confidence, 0) / total) : '—';
  $('dashTime').textContent = total ? elapsed(items.reduce((sum, item) => sum + item.inference_time_ms, 0) / total) : '—';
  $('sessionCount').textContent = `${state.sessionTotal} lecturas en esta sesión`;
  $('activityTotal').textContent = renderActivity($('activityChart'), items, Number($('activityPeriod').value));
  renderDistribution($('distributionChart'), $('distributionLegend'), items);
  renderConfidence($('confidenceChart'), items);
  const recent = $('recentReadings'); recent.replaceChildren();
  items.slice(0, 4).forEach(item => {
    const row = document.createElement('div'); row.className = 'recent-row';
    const symbol = document.createElement('span'); symbol.className = 'recent-icon'; symbol.append(icon('scan'));
    const name = document.createElement('div'); name.className = 'recent-name';
    const title = document.createElement('strong'); title.textContent = item.name; title.title = item.name;
    const date = document.createElement('small'); date.textContent = `${formatDate(item.timestamp)} · ${percentage(item.confidence)}`;
    name.append(title, date); row.append(symbol, name, badge(item.label)); recent.append(row);
  });
  if (!total) {
    const empty = document.createElement('div'); empty.className = 'recent-empty';
    const text = document.createElement('p'); text.textContent = 'Tu primera muestra inicia el historial.';
    const link = document.createElement('a'); link.href = '#capturar'; link.className = 'text-link'; link.textContent = 'Analizar una muestra ↗';
    empty.append(icon('leaf'), text, link); recent.append(empty);
  }
}

function filteredHistory() {
  return filterHistory(state.history, { query: $('historySearch').value, label: $('historyStatus').value, date: $('historyDate').value });
}

function renderHistory() {
  const items = filteredHistory();
  const pagination = paginateHistory(items, state.historyPage);
  state.historyPage = pagination.page;
  $('historyPagination').hidden = !items.length;
  $('historyPageStatus').textContent = `Página ${pagination.page} de ${pagination.pages} · ${pagination.start}–${pagination.end} de ${items.length}`;
  $('historyPrevious').disabled = pagination.page === 1;
  $('historyNext').disabled = pagination.page === pagination.pages;
  const body = $('historyBody'); body.replaceChildren();
  const columns = ['Muestra', 'Evaluación para exportación', 'Confianza', 'Inferencia', 'Fecha y hora'];
  pagination.items.forEach(item => {
    const row = document.createElement('tr');
    // Explicit roles preserve table semantics after the mobile card transformation.
    row.setAttribute('role', 'row');
    row.classList.add('history-reading');
    row.addEventListener('click', () => openHistoryDetail(item));
    const values = [item.name, item.label, percentage(item.confidence), elapsed(item.inference_time_ms), formatDate(item.timestamp)];
    values.forEach((value, index) => {
      const cell = document.createElement('td'); cell.dataset.label = columns[index]; cell.setAttribute('role', 'cell');
      if (index === 1) cell.append(badge(item.label));
      else if (index === 2) {
        const confidence = document.createElement('span'); confidence.className = 'history-confidence';
        const track = document.createElement('i'); track.setAttribute('aria-hidden', 'true');
        const fill = document.createElement('span'); fill.style.width = `${item.confidence * 100}%`; track.append(fill);
        confidence.append(document.createTextNode(value), track); cell.append(confidence);
      } else if (index === 0) {
        const button = document.createElement('button'); button.className = 'history-open'; button.textContent = value;
        button.title = value; button.setAttribute('aria-label', `Ver imagen y datos de ${value}`);
        button.setAttribute('aria-haspopup', 'dialog');
        cell.append(button);
      } else { cell.textContent = value; }
      row.append(cell);
    }); body.append(row);
  });
  $('navCount').textContent = state.history.length;
  $('historyCapacity').textContent = `${state.history.length} / ${CONFIG.MAX_HISTORY} registros`;
  $('filteredCount').textContent = `${items.length} ${items.length === 1 ? 'resultado' : 'resultados'}${items.length !== state.history.length ? ` de ${state.history.length}` : ''}`;
  $('historyEmpty').hidden = items.length > 0;
  $('historyEmptyTitle').textContent = state.history.length ? 'No encontramos lecturas con estos filtros' : 'Tu historia empieza con una muestra';
  $('historyEmptyText').textContent = state.history.length ? 'Prueba otro nombre, clasificación o fecha.' : 'Los resultados aparecerán aquí después del primer análisis.';
  $('historyEmptyAction').hidden = state.history.length > 0;
  $('exportHistory').disabled = !items.length;
  $('exportHistory').title = 'Exportar los resultados que coinciden con los filtros actuales';
  $('clearHistory').disabled = !state.history.length;
}

function refreshData() { renderHistory(); renderDashboard(); }

function resetHistoryDetailImage() {
  $('historyDetailImage').hidden = true;
  $('historyDetailImage').removeAttribute('src');
  $('historyDetailDownload').hidden = true;
  $('historyDetailDownload').removeAttribute('href');
  if (historyDetailUrl) URL.revokeObjectURL(historyDetailUrl);
  historyDetailUrl = null;
}

async function openHistoryDetail(item) {
  const ticket = ++historyDetailTicket;
  resetHistoryDetailImage();
  $('historyDetailName').textContent = item.name;
  $('historyDetailLabel').textContent = item.label;
  $('historyDetailLabel').className = `badge ${badgeClass(item.label)}`;
  $('historyDetailDate').textContent = formatDate(item.timestamp);
  $('historyDetailConfidence').textContent = percentage(item.confidence);
  $('historyDetailTime').textContent = elapsed(item.inference_time_ms);
  $('historyDetailRecommendations').hidden = true;
  $('historyDetailImageStatus').hidden = false;
  $('historyDetailImageStatus').textContent = item.id ? 'Cargando fotografía…' : 'Imagen no disponible para este registro anterior.';
  if (!$('historyDetailDialog').open) $('historyDetailDialog').showModal();
  try {
    const stored = state.account
      ? { data: (await cloud.detail(item.id)).data, blob: await cloud.historyPhoto(item.id).catch(() => null) }
      : await historyImages.get(item.id);
    if (ticket !== historyDetailTicket || !$('historyDetailDialog').open) return;
    if (!stored?.blob) {
      $('historyDetailImageStatus').textContent = 'Imagen no disponible para este registro.';
    } else {
      historyDetailUrl = URL.createObjectURL(stored.blob);
      $('historyDetailImage').src = historyDetailUrl;
      $('historyDetailImage').hidden = false;
      $('historyDetailImageStatus').hidden = true;
      $('historyDetailDownload').href = historyDetailUrl;
      const extension = stored.blob.type === 'image/png' ? 'png' : stored.blob.type === 'image/webp' ? 'webp' : 'jpg';
      $('historyDetailDownload').download = `muestra-${item.id}.${extension}`;
      $('historyDetailDownload').hidden = false;
    }
    const recommendation = stored.data?.recommendation;
    if (recommendation) {
      $('historyDetailDestination').textContent = recommendation.destination || 'Consulta el destino con el responsable del lote.';
      $('historyDetailTiming').textContent = recommendation.timing || 'Según madurez y conservación.';
      $('historyDetailStorage').textContent = recommendation.storage;
      $('historyDetailAction').textContent = recommendation.action;
      $('historyDetailRecommendations').hidden = false;
    }
  } catch {
    if (ticket === historyDetailTicket) $('historyDetailImageStatus').textContent = 'No se pudo cargar la fotografía. Cierra y vuelve a abrir el registro.';
  }
}

function persistHistory() {
  if (state.account) return; // Saved atomically on the server before prediction is returned.
  if (!saveHistory(state.history)) notice('No se pudo guardar el historial en este navegador. Puedes exportarlo a CSV.', 'error');
}

function resetPreview() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  $('preview').hidden = true; $('preview').removeAttribute('src');
  $('selectionThumbnail').hidden = true; $('selectionThumbnail').removeAttribute('src');
  $('previewTag').hidden = true; $('cropGuide').hidden = true;
}

function clearResults() {
  alertVoice.stop();
  state.readings = [];
  if (state.thumbnailUrl) URL.revokeObjectURL(state.thumbnailUrl);
  state.thumbnailUrl = null; $('resultThumbnail').removeAttribute('src');
  $('readingPicker').hidden = true; $('readingSelect').replaceChildren();
  $('resultContent').hidden = true; $('resultEmpty').hidden = false;
}

function showPreview(file, tag = 'VISTA PREVIA') {
  resetPreview();
  state.previewUrl = URL.createObjectURL(file);
  $('preview').src = state.previewUrl; $('preview').hidden = false;
  $('selectionThumbnail').src = state.previewUrl;
  $('previewTag').textContent = tag; $('previewTag').hidden = false;
}

function updateCropGuide() {
  const media = state.stream ? $('video') : $('preview');
  const width = state.stream ? media.videoWidth : media.naturalWidth;
  const height = state.stream ? media.videoHeight : media.naturalHeight;
  if (!width || !height || media.hidden || !$('stage').clientWidth) { $('cropGuide').hidden = true; return; }
  const scale = Math.min($('stage').clientWidth / width, $('stage').clientHeight / height);
  $('cropGuide').style.width = `${Math.min(width, height) * scale}px`;
  $('cropGuideText').textContent = 'Área analizada';
  $('cropGuide').classList.toggle('crop-guide-live', !!state.stream);
  $('cropGuide').hidden = false;
}

function showReading(index) {
  const reading = state.readings[index];
  if (!reading) return;
  const data = reading.data;
  $('readingSelect').value = String(index);
  $('resultEmpty').hidden = true; $('resultContent').hidden = false;
  $('classificationPanel').dataset.verdict = data.label;
  const copy = resultCopy(data.label);
  $('resultLabel').textContent = exportLabel(data.label);
  $('resultHeadline').textContent = copy.title;
  $('resultMessage').textContent = copy.description;
  $('recommendationOneTitle').textContent = copy.recommendations[0].title;
  $('recommendationOneText').textContent = copy.recommendations[0].text;
  $('recommendationTwoTitle').textContent = copy.recommendations[1].title;
  $('recommendationTwoText').textContent = copy.recommendations[1].text;
  $('probApto').textContent = percentage(data.probabilities.APTO);
  $('probNoApto').textContent = percentage(data.probabilities['NO APTO']);
  $('thresholdValue').textContent = percentage(data.threshold);
  $('inferenceTime').textContent = elapsed(data.inference_time_ms);
  $('resultDisclaimer').textContent = DISCLAIMER;
  $('confidenceValue').textContent = percentage(data.confidence);
  $('confidenceProgress').setAttribute('aria-valuenow', (data.confidence * 100).toFixed(1));
  $('confidenceProgress').setAttribute('aria-valuetext', percentage(data.confidence));
  $('confidenceBar').style.width = `${data.confidence * 100}%`;
  $('thresholdMarker').style.left = `${data.threshold * 100}%`;
  $('resultSource').textContent = reading.name; $('resultSource').title = reading.name;
  if (state.thumbnailUrl) URL.revokeObjectURL(state.thumbnailUrl);
  state.thumbnailUrl = URL.createObjectURL(reading.file); $('resultThumbnail').src = state.thumbnailUrl;
  if (!state.stream && !reading.fromCamera) {
    showPreview(reading.file, state.readings.length > 1 ? `MUESTRA ${index + 1} DE ${state.readings.length}` : 'MUESTRA ANALIZADA');
    $('selectionText').textContent = reading.name;
  }
  syncSampleSummary();
}

function cancelAnalysis(message = 'Análisis cancelado. Puedes volver a intentarlo.') {
  alertVoice.stop();
  $('realtime').checked = false;
  if (state.job) {
    const job = state.job; state.job = null; job.controller.abort();
    if (message) notice(message);
  }
  syncControls();
}

function stopCamera() {
  alertVoice.stop();
  state.cameraTicket++;
  state.cameraPending = false;
  $('realtime').checked = false;
  if (state.job?.fromCamera) cancelAnalysis();
  if (state.stream) state.stream.getTracks().forEach(track => track.stop());
  state.stream = null; $('video').srcObject = null; $('video').hidden = true;
  $('cropGuide').hidden = true;
  if (!state.files.length) $('previewTag').hidden = true;
  $('selectionText').textContent = state.files.length ? `${state.files.length} ${state.files.length === 1 ? 'imagen seleccionada' : 'imágenes seleccionadas'}` : 'Ninguna imagen seleccionada';
  syncControls();
  if (state.files.length) updateCropGuide();
}

function validateFiles(files) {
  const limits = state.limits;
  if (files.length > limits.batch_files) throw new Error(`Selecciona como máximo ${limits.batch_files} imágenes.`);
  if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && !(file.type === '' && /\.(jpe?g|png|webp)$/i.test(file.name)))) throw new Error('Selecciona imágenes JPG, PNG o WebP.');
  if (files.some(file => !file.size || file.size > limits.image_mb * 1024 ** 2)) throw new Error(`Cada imagen debe pesar entre 1 byte y ${limits.image_mb} MB.`);
  if (files.reduce((sum, file) => sum + file.size, 0) > limits.batch_mb * 1024 ** 2) throw new Error(`El lote debe pesar como máximo ${limits.batch_mb} MB.`);
}

function switchSourceMode(mode) {
  if (state.sourceMode === mode) return;
  state.sourceMode = mode;
  cancelAnalysis(null);
  stopCamera();
  clearResults();
  syncControls();
}

function selectFiles(files) {
  if (state.job) return;
  const list = Array.from(files);
  if (!list.length) return;
  try { validateFiles(list); } catch (error) { notice(error.message, 'error'); return; }
  state.sourceMode = 'images';
  stopCamera(); state.files = list; clearResults();
  showPreview(list[0], list.length > 1 ? `LOTE · ${list.length} IMÁGENES` : 'VISTA PREVIA');
  $('selectionText').textContent = list.length > 1 ? `${list.length} imágenes · ${list[0].name}` : list[0].name;
  $('notice').hidden = true; syncControls();
}

async function startCamera() {
  if (state.sourceMode !== 'camera' || state.job || state.cameraPending || state.stream) return;
  if (!navigator.mediaDevices?.getUserMedia) return notice('La cámara requiere localhost o HTTPS y un navegador compatible.', 'error');
  unlockVoice();
  stopCamera(); state.files = []; resetPreview(); clearResults();
  const ticket = state.cameraTicket;
  state.cameraPending = true; $('selectionText').textContent = 'Esperando permiso de cámara…'; syncControls();
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (ticket !== state.cameraTicket) { acquired.getTracks().forEach(track => track.stop()); return; }
    state.stream = acquired; $('video').srcObject = acquired; $('video').hidden = false;
    await $('video').play();
    if (ticket !== state.cameraTicket) return;
    $('selectionText').textContent = '';
    $('previewTag').hidden = true;
    $('notice').hidden = true; updateCropGuide();
    acquired.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      if (state.stream === acquired) { stopCamera(); notice('La cámara se desconectó. Puedes activarla de nuevo.', 'error'); }
    }));
  } catch (error) {
    if (ticket === state.cameraTicket) {
      stopCamera();
      notice(error.name === 'NotAllowedError' ? 'Permite el acceso a la cámara y vuelve a intentarlo.' : 'No se pudo iniciar la cámara. Comprueba que esté conectada y libre.', 'error');
    }
  } finally {
    if (ticket === state.cameraTicket) {
      state.cameraPending = false;
      if (state.stream && state.apiReady) { $('realtime').checked = true; realtimeLoop(); }
    }
    syncControls();
  }
}

async function capture() {
  const video = $('video'), canvas = $('canvas');
  if (!video.videoWidth || !video.videoHeight) throw new Error('La cámara todavía no está lista. Inténtalo de nuevo.');
  const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', CONFIG.JPEG_QUALITY));
  if (!blob) throw new Error('No se pudo capturar la fotografía.');
  return blob;
}

async function analyze(continuous = false) {
  if (state.job || state.cameraPending || !state.apiReady) return;
  const fromCamera = !!state.stream;
  if (!fromCamera && !state.files.length) return;
  const job = { controller: new AbortController(), fromCamera };
  state.job = job; syncControls(); $('notice').hidden = true;
  try {
    if (!fromCamera) validateFiles(state.files);
    const inputs = fromCamera ? [await capture()] : state.files.slice();
    const timestamp = new Date().toISOString();
    if (state.job !== job) return;
    const options = { signal: job.controller.signal, ...(state.account ? { persist: continuous ? 'rejection' : 'analysis' } : {}) };
    const results = inputs.length > 1 ? await api.batch(inputs, options) : [await api.predict(inputs[0], false, options)];
    if (state.job !== job) return;
    if (!Array.isArray(results) || results.length !== inputs.length) throw new Error('El servidor devolvió un lote incompleto.');
    results.forEach(validateResult);
    state.readings = results.map((data, index) => ({ id: data.record_id || data.capture_id || crypto.randomUUID(), data, file: inputs[index], name: fromCamera ? 'Captura de cámara' : inputs[index].name, timestamp, fromCamera, continuous }));
    state.readings.forEach(reading => {
      state.sessionTotal++; // lecturas de la sesión (incluye las automáticas)
      // A NO APTO continuous frame is a recorded event; other frames are transient.
      if ((!continuous || reading.data.label === 'NO APTO') && !state.account) {
        state.history.unshift({ id: reading.id, name: reading.name.slice(0, 200),
          label: reading.data.label, confidence: reading.data.confidence,
          inference_time_ms: reading.data.inference_time_ms, timestamp });
      }
      saveRejectedReading(reading);
    });
    if (!state.account) state.history = state.history.slice(0, CONFIG.MAX_HISTORY);
    $('readingSelect').replaceChildren(...state.readings.map((reading, index) => {
      const option = document.createElement('option'); option.value = String(index); option.textContent = `${index + 1}. ${reading.name} · ${exportLabel(reading.data.label)}`; return option;
    }));
    $('readingPicker').hidden = state.readings.length < 2; showReading(0);
    alertExportResults(results, continuous);
    if (continuous && results.some(data => data.label === 'NO APTO')) {
      if (state.account) {
        if (!results.filter(data => data.label === 'NO APTO').every(data => typeof data.capture_id === 'string' && data.capture_id)) {
          throw new Error('Un NO APTO no pudo guardarse en el servidor. Comprueba la conexión.');
        }
        await refreshCloudHistory();
      } else {
        persistHistory();
        refreshData();
        const rejected = state.readings.filter(reading => reading.data.label === 'NO APTO');
        try { await historyImages.save(rejected, state.history); }
        catch { notice('El NO APTO figura en Historial, pero no se pudo guardar su fotografía local.', 'error'); }
      }
    }
    if (!continuous) {
      if (state.account) {
        if (!results.every(data => typeof data.record_id === 'string' && data.record_id)) {
          throw new Error('No se confirmó el guardado en la nube. No se añadirá un registro ficticio al historial.');
        }
        await refreshCloudHistory();
        notice('Muestra guardada en el historial privado de este navegador, sin iniciar sesión.');
      } else {
        persistHistory();
        refreshData();
      }
    }
    if (!continuous) $('resultAnnouncement').textContent = results.length > 1 ? `Lote completado: ${results.length} muestras. Selecciona un resultado para revisar sus recomendaciones.` : `${exportLabel(results[0].label)}. Confianza ${percentage(results[0].confidence)}. Análisis y recomendaciones disponibles.`;
    if (results.length > 1) notice(`Lote completado: ${results.length} muestras. Selecciona cada lectura para revisar su imagen y recomendaciones.`);
    if (!continuous && !state.account) {
      try {
        await historyImages.save(state.readings, state.history);
        notice('Muestra guardada en el historial local de este navegador, sin iniciar sesión.');
      } catch {
        notice('La muestra figura en el historial local, pero no se pudo guardar su fotografía.', 'error');
      }
    }
  } catch (error) {
    if (state.job === job && !error.cancelled) {
      notice(`${error.message} Tu muestra sigue disponible para reintentar.`, 'error');
      $('realtime').checked = false;
      if (error.status === 401) refreshCloudSession();
      if (error.status === 503 || error.connection) health();
    }
  } finally { if (state.job === job) { state.job = null; syncControls(); } }
}


async function saveCameraSampleToHistory() {
  if (!state.stream || state.cameraPending || !state.apiReady) return;
  // Pause the automatic frame loop. One deliberate capture corresponds to
  // exactly one physical sample and must go through normal persistent analysis.
  state.realtimeWanted = false;
  $('realtime').checked = false;
  if (state.job?.fromCamera) cancelAnalysis(null);
  syncControls();
  await analyze(false);
}

async function realtimeLoop() {
  if (state.realtimeRunning) return;
  state.realtimeRunning = true;
  const ticket = state.cameraTicket;
  try {
    while ($('realtime').checked && state.stream && ticket === state.cameraTicket) {
      if (document.visibilityState !== 'hidden') await analyze(true);
      if (!$('realtime').checked || !state.stream || ticket !== state.cameraTicket) break;
      await new Promise(resolve => setTimeout(resolve, CONFIG.STREAM_INTERVAL_MS));
    }
  } finally {
    state.realtimeRunning = false; syncControls();
    if ($('realtime').checked && state.stream && ticket !== state.cameraTicket) realtimeLoop();
  }
}

let healthBusy = null;
async function health() {
  const client = api;
  if (healthBusy === client) return;
  healthBusy = client;
  try {
    const data = await client.health();
    if (client !== api) return;
    state.apiReady = data.model_loaded === true;
    $('statusDot').className = `dot ${state.apiReady ? 'ok' : 'error'}`;
    $('statusText').textContent = state.apiReady ? 'Modelo conectado' : 'Modelo no disponible';
    $('serviceBanner').hidden = state.apiReady;
    if (!state.apiReady) {
      $('realtime').checked = false;
      $('serviceMessage').textContent = 'El servidor está conectado, pero el modelo no pudo cargar. Ejecuta python app.py y reinicia la aplicación.';
    }
    if (data.limits && ['image_mb', 'batch_files', 'batch_mb'].every(key => Number.isInteger(data.limits[key]) && data.limits[key] > 0)) state.limits = data.limits;
    // Si la cámara arrancó antes de que el modelo respondiera, el análisis en vivo se activa en cuanto el modelo está disponible.
    if (state.apiReady && state.stream && state.view === 'capturar' && state.realtimeWanted && !state.job && !state.cameraPending && !$('realtime').checked) { $('realtime').checked = true; syncControls(); realtimeLoop(); }
  } catch (error) {
    if (client === api && !error.cancelled) {
      state.apiReady = false; $('realtime').checked = false;
      $('statusDot').className = 'dot error'; $('statusText').textContent = 'Sin conexión';
      $('serviceMessage').textContent = 'Inicia python app.py o revisa la dirección en Conexión y modelo. Tu muestra permanece disponible.';
      $('serviceBanner').hidden = false;
    }
  } finally {
    if (healthBusy === client) healthBusy = null;
    $('sidebarStatusText').textContent = $('statusText').textContent;
    $('sidebarStatusDot').className = $('statusDot').className;
    syncControls();
  }
}

let detailsTicket = 0;
async function openSettings() {
  const ticket = ++detailsTicket, client = api;
  $('apiUrl').value = api.baseUrl; $('settingsError').hidden = true;
  $('settingsDialog').showModal(); $('modelDetails').textContent = 'Comprobando modelo…';
  try {
    const model = await client.modelInfo();
    if (ticket !== detailsTicket || client !== api || !$('settingsDialog').open) return;
    if (!Array.isArray(model.input_shape) || !Number.isFinite(model.parameters)) throw new Error('Metadatos inválidos');
    $('modelDetails').textContent = `${model.model_name} · ${model.parameters.toLocaleString('es-PE')} parámetros · Entrada ${model.input_shape.join(' × ')} · Sin métricas de validación independiente.`;
  } catch {
    if (ticket === detailsTicket && client === api && $('settingsDialog').open) $('modelDetails').textContent = 'No se pudo consultar el modelo. Comprueba que el servidor esté iniciado.';
  }
}


$('importLocalHistory').addEventListener('click', async () => {
  if (!state.account) return;
  const local = loadHistory();
  const previousCamera = await rejectionStore.snapshot(RejectionStore.MAX_CAPTURES)
    .catch(() => ({items: [], total: 0}));
  if (!local.length && !previousCamera.items.length) {
    notice('No se encontraron análisis ni capturas NO APTO anteriores en este navegador.');
    return;
  }
  const button = $('importLocalHistory');
  button.disabled = true;
  let saved = 0, failed = 0;
  // Explicit import only; original local records are never removed.
  try {
    const oldRecords = local.map(item => ({item, loadImage: () => historyImages.get(item.id)}));
    const oldRejections = previousCamera.items.map(capture => ({
      item: {
        id: capture.id, name: 'Captura NO APTO anterior', label: 'NO APTO',
        confidence: capture.confidence, inference_time_ms: 0,
        timestamp: capture.timestamp,
      },
      loadImage: async () => ({blob: capture.blob, data: {label: 'NO APTO'}}),
    }));
    for (const record of [...oldRecords, ...oldRejections]) {
      try {
        if (!record.item.id) { failed++; continue; }
        const stored = await record.loadImage().catch(() => null);
        await cloud.importHistoryItem(record.item, stored);
        saved++;
      } catch { failed++; }
    }
    await refreshCloudHistory();
    notice(`Importación: ${saved} registros incorporados${failed ? `; ${failed} no se pudieron importar` : ''}. Los originales siguen en este navegador.`,
      failed ? 'error' : 'success');
  } catch (error) {
    notice('La importación se interrumpió: ' + error.message, 'error');
  } finally { button.disabled = false; }
});

window.addEventListener('hashchange', () => navigate());
$('activityPeriod').addEventListener('change', renderDashboard);
['historySearch', 'historyStatus', 'historyDate'].forEach(id => $(id).addEventListener('input', () => { state.historyPage = 1; renderHistory(); }));
$('resetFilters').addEventListener('click', () => { $('historySearch').value = ''; $('historyStatus').value = ''; $('historyDate').value = ''; state.historyPage = 1; renderHistory(); });
$('historyPrevious').addEventListener('click', () => { state.historyPage--; renderHistory(); });
$('historyNext').addEventListener('click', () => { state.historyPage++; renderHistory(); });
$('clearHistory').addEventListener('click', () => { $('clearHistoryDialog').returnValue = ''; $('clearHistoryDialog').showModal(); });
$('historyDetailDialog').addEventListener('close', () => { historyDetailTicket++; resetHistoryDetailImage(); });
$('historyDetailImage').addEventListener('error', () => {
  resetHistoryDetailImage();
  $('historyDetailImageStatus').hidden = false;
  $('historyDetailImageStatus').textContent = 'No se pudo mostrar la fotografía de este registro.';
});
$('clearHistoryDialog').addEventListener('close', async () => {
  if ($('clearHistoryDialog').returnValue !== 'clear') return;
  try {
    if (state.account) {
      await cloud.clearHistory();
      clearRejectionCards();
      await refreshCloudHistory();
      await renderRejections();
    } else {
      state.history = []; persistHistory(); refreshData();
      await historyImages.clear();
    }
    $('historyDetailDialog').close();
    notice('Historial borrado. El panel se ha actualizado.');
  } catch (error) { notice('No se pudo borrar todo el historial: ' + error.message, 'error'); }
});
$('exportHistory').addEventListener('click', () => {
  const blob = new Blob([csvContent(filteredHistory())], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'bananavision-ai-historial.csv'; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('fileInput').addEventListener('change', event => { selectFiles(event.target.files); event.target.value = ''; });
[$('stage'), $('cameraIdle')].forEach(target => {
  ['dragenter', 'dragover'].forEach(name => target.addEventListener(name, event => { event.preventDefault(); if (!state.job) target.classList.add('dragover'); }));
  target.addEventListener('dragleave', event => { if (!target.contains(event.relatedTarget)) target.classList.remove('dragover'); });
  target.addEventListener('drop', event => { event.preventDefault(); target.classList.remove('dragover'); selectFiles(event.dataTransfer.files); });
});
$('preview').addEventListener('load', updateCropGuide);
$('preview').addEventListener('error', () => { $('cropGuide').hidden = true; notice('No se pudo mostrar la imagen. Comprueba que el archivo sea válido antes de analizarlo.', 'error'); });
$('video').addEventListener('loadedmetadata', updateCropGuide);
new ResizeObserver(updateCropGuide).observe($('stage'));
let chartWidth = 0;
new ResizeObserver(entries => {
  const width = Math.round(entries[0].contentRect.width);
  if (width !== chartWidth) { chartWidth = width; if (state.view === 'dashboard') renderDashboard(); }
}).observe($('mainContent'));
$('cameraMode').addEventListener('click', () => switchSourceMode('camera'));
$('imageMode').addEventListener('click', () => switchSourceMode('images'));
$('selectImages').addEventListener('click', () => $('fileInput').click());
$('startLiveCamera').addEventListener('click', startCamera);
$('stopCamera').addEventListener('click', stopCamera);
$('analyzeButton').addEventListener('click', () => { unlockVoice(); analyze(); });
$('saveCameraSample').addEventListener('click', () => { unlockVoice(); saveCameraSampleToHistory(); });
$('realtime').addEventListener('change', () => {
  state.realtimeWanted = $('realtime').checked;
  if ($('realtime').checked) { unlockVoice(); realtimeLoop(); }
  else if (state.job?.fromCamera) cancelAnalysis('Análisis en vivo pausado. La solicitud pendiente se canceló.');
  syncControls();
});
$('loadMoreRejections').addEventListener('click', () => { rejectionLimit += 50; renderRejections(); });
$('clearRejections').addEventListener('click', () => { $('clearRejectionsDialog').returnValue = ''; $('clearRejectionsDialog').showModal(); });
$('clearRejectionsDialog').addEventListener('close', async () => {
  if ($('clearRejectionsDialog').returnValue !== 'clear') return;
  try { if (state.account) { await cloud.clearRejections(); await refreshCloudHistory(); } else await rejectionStore.clear(); clearRejectionCards(); rejectionLimit = 50; await renderRejections(); }
  catch { notice('No se pudieron borrar las capturas. Inténtalo de nuevo.', 'error'); }
});
$('voiceEnabled').addEventListener('change', () => {
  alertVoice.setEnabled($('voiceEnabled').checked);
  try { localStorage.setItem(VOICE_KEY, String(alertVoice.enabled)); } catch { /* Preference still applies to this session. */ }
  if (alertVoice.enabled) unlockVoice(); else syncVoiceStatus();
});
alertVoice.speech?.addEventListener?.('voiceschanged', syncVoiceStatus);
$('readingSelect').addEventListener('change', event => showReading(Number(event.target.value)));
$('dismissNotice').addEventListener('click', () => { $('notice').hidden = true; });
$('retryConnection').addEventListener('click', health);
$('connectionStatus').addEventListener('click', health);
$('openHelp').addEventListener('click', () => $('helpDialog').showModal());
document.querySelectorAll('[data-settings]').forEach(button => button.addEventListener('click', openSettings));
$('settingsDialog').addEventListener('close', () => { detailsTicket++; });
$('settingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const url = validApiUrl($('apiUrl').value.trim());
    if (state.account && new URL(url).origin !== location.origin) throw new Error('El historial anónimo utiliza exclusivamente el servidor de esta página.');
    stopCamera(); cancelAnalysis(null); api.cancel(); api = new ApiClient(url); state.apiReady = false;
    state.limits = { image_mb: CONFIG.MAX_IMAGE_SIZE_MB, batch_files: CONFIG.MAX_BATCH_FILES, batch_mb: CONFIG.MAX_BATCH_SIZE_MB };
    try { localStorage.setItem(API_KEY, url); } catch { /* The session still uses this server. */ }
    $('statusText').textContent = 'Conectando…'; $('statusDot').className = 'dot';
    $('settingsDialog').close(); syncControls(); await health();
  } catch (error) { $('settingsError').textContent = error.message; $('settingsError').hidden = false; }
});
window.addEventListener('storage', event => { if (!state.account && (event.key === HISTORY_KEY || event.key === null)) { state.history = loadHistory(); refreshData(); } });
window.addEventListener('pagehide', () => { cancelAnalysis(null); stopCamera(); api.cancel(); resetPreview(); });
window.addEventListener('pageshow', event => {
  if (event.persisted) { if (state.files.length) showPreview(state.files[0]); syncControls(); health(); }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { renderDashboard(); health(); if (state.account) refreshCloudHistory().catch(() => {}); } });
$('todayLabel').textContent = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
syncVoiceStatus(); syncStorageUI(); refreshData(); syncControls(); navigate(true); health(); refreshCloudSession({ quiet: true });
setInterval(() => { if (document.visibilityState !== 'hidden') health(); }, 30000);
