import CONFIG from './config.js?v=20261006-11';

// Keep the existing key so an upgrade preserves previous readings.
export const HISTORY_KEY = 'bananaStudioHistoryV2';
export const API_KEY = 'bananaStudioApi';
// The stored name is preserved so a previous mute preference survives the switch to voice alerts.
export const VOICE_KEY = 'bananaVisionAlarmEnabled';
export const LABELS = ['APTO', 'NO APTO', 'NO CONCLUYENTE'];
export const exportLabel = label => label;

// Presentación al usuario; las etiquetas internas siguen siendo APTO / NO APTO / NO CONCLUYENTE.
export const DISCLAIMER = 'Evaluación visual asistida por IA. Este resultado es una estimación del modelo basada en la imagen proporcionada. No constituye una certificación de calidad y debe complementarse con inspección manual y los controles requeridos para exportación.';
const RESULT_COPY = {
  'APTO': {
    title: 'Apto para continuar',
    description: 'La muestra cumple con los criterios visuales evaluados por el modelo. Puede continuar con la inspección manual correspondiente antes de tomar una decisión final sobre el lote.',
    recommendations: [
      { title: 'Continuar evaluación', text: 'La muestra presenta una evaluación visual favorable. Continúa con la revisión manual del producto.' },
      { title: 'Inspección manual', text: 'Verifica estado físico, madurez, daños visibles y demás criterios requeridos antes de aprobar el lote.' },
    ],
  },
  'NO APTO': {
    title: 'Revisión requerida',
    description: 'La muestra presenta características visuales que no cumplen con los criterios evaluados por el modelo. Se recomienda revisar el producto antes de continuar.',
    recommendations: [
      { title: 'Revisar muestra', text: 'Se recomienda separar temporalmente la muestra y realizar una inspección manual antes de continuar.' },
      { title: 'Evaluar nuevamente', text: 'Verifica daños visibles y estado físico. Si es necesario, captura una nueva fotografía.' },
    ],
  },
  'NO CONCLUYENTE': {
    title: 'Resultado no concluyente',
    description: 'La confianza del modelo no alcanza el umbral mínimo requerido. Capture una nueva fotografía en mejores condiciones y repita el análisis.',
    recommendations: [
      { title: 'Repetir análisis', text: 'Vuelve a ejecutar el análisis con la misma muestra o con una nueva captura.' },
      { title: 'Mejorar captura', text: 'Centra un solo plátano en el área marcada, con luz uniforme y fondo neutro.' },
    ],
  },
};
export const resultCopy = label => RESULT_COPY[label] || RESULT_COPY['NO CONCLUYENTE'];

export function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function loadHistory() {
  try {
    const stored = JSON.parse(storageGet(HISTORY_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter(item => item && LABELS.includes(item.label)
      && typeof item.name === 'string' && item.name.length <= 200
      && Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1
      && Number.isFinite(item.inference_time_ms) && item.inference_time_ms >= 0
      && typeof item.timestamp === 'string' && Number.isFinite(Date.parse(item.timestamp)))
      .slice(0, CONFIG.MAX_HISTORY)
      .map(({ id, name, label, confidence, inference_time_ms, timestamp }) => ({
        ...(typeof id === 'string' && id.length <= 100 ? { id } : {}),
        name, label, confidence, inference_time_ms, timestamp,
      }));
  } catch { return []; }
}

export function saveHistory(history) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, CONFIG.MAX_HISTORY))); return true; }
  catch { return false; }
}

export function paginateHistory(history, requestedPage = 1) {
  const pages = Math.max(1, Math.ceil(history.length / CONFIG.HISTORY_PAGE_SIZE));
  const page = Math.max(1, Math.min(pages, Math.trunc(requestedPage) || 1));
  const offset = (page - 1) * CONFIG.HISTORY_PAGE_SIZE;
  return {
    items: history.slice(offset, offset + CONFIG.HISTORY_PAGE_SIZE), page, pages,
    start: history.length ? offset + 1 : 0,
    end: Math.min(offset + CONFIG.HISTORY_PAGE_SIZE, history.length),
  };
}

export function validApiUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Utiliza una dirección HTTP o HTTPS sin credenciales ni parámetros.');
  }
  if (location.protocol === 'https:' && url.protocol === 'http:') {
    throw new Error('Esta página HTTPS requiere una API HTTPS.');
  }
  return url.href.replace(/\/$/, '');
}

export function validateResult(data) {
  const probabilityKeys = ['APTO', 'NO APTO'];
  if (!data || !LABELS.includes(data.label)
    || !Number.isFinite(data.confidence) || data.confidence < 0 || data.confidence > 1
    || !Number.isFinite(data.inference_time_ms) || data.inference_time_ms < 0
    || !Number.isFinite(data.threshold) || data.threshold < .5 || data.threshold > 1
    || !data.probabilities || !data.recommendation
    || !['message', 'action', 'storage'].every(key => typeof data.recommendation[key] === 'string')
    || !probabilityKeys.every(key => Number.isFinite(data.probabilities[key]) && data.probabilities[key] >= 0 && data.probabilities[key] <= 1)) {
    throw new Error('El servidor devolvió un resultado incompleto o inválido.');
  }
  const maximum = Math.max(...probabilityKeys.map(key => data.probabilities[key]));
  if (!probabilityKeys.includes(data.predicted_class)
    || data.conclusive !== (data.confidence >= data.threshold)
    || data.label !== (data.conclusive ? data.predicted_class : 'NO CONCLUYENTE')
    || Math.abs(data.probabilities.APTO + data.probabilities['NO APTO'] - 1) > .001
    || Math.abs(data.confidence - data.probabilities[data.predicted_class]) > .001
    || Math.abs(maximum - data.probabilities[data.predicted_class]) > .001) {
    throw new Error('El servidor devolvió probabilidades inconsistentes.');
  }
}

export const percentage = value => `${(value * 100).toFixed(1)}%`;
export const elapsed = value => value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s`;
export const badgeClass = label => label === 'NO APTO' ? 'bad' : label === 'NO CONCLUYENTE' ? 'uncertain' : '';
export const formatDate = timestamp => new Date(timestamp).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });

export function dayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function filterHistory(history, { query = '', label = '', date = '' } = {}) {
  const search = query.trim().toLocaleLowerCase('es');
  return history.filter(item => (!search || item.name.toLocaleLowerCase('es').includes(search))
    && (!label || item.label === label) && (!date || dayKey(item.timestamp) === date));
}

export function csvContent(history) {
  const cell = value => {
    let text = String(value);
    if (/^[\s]*[=+\-@]|^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [['Muestra', 'Evaluación visual para exportación', 'Confianza (%)', 'Inferencia (ms)', 'Fecha ISO'],
    ...history.map(item => [item.name, exportLabel(item.label), (item.confidence * 100).toFixed(2), item.inference_time_ms.toFixed(2), item.timestamp])];
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}
