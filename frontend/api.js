import CONFIG from './config.js';
export default class ApiClient {
  constructor(baseUrl) { this.baseUrl = baseUrl.replace(/\/$/, ''); this.controllers = new Set(); }
  cancel() { this.controllers.forEach(c => c.abort()); }
  async request(path, options = {}) {
    const { allowUnavailable = false, signal, ...fetchOptions } = options;
    const controller = new AbortController();
    this.controllers.add(controller);
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, CONFIG.REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { ...fetchOptions, signal: controller.signal });
      let data;
      try { data = await response.json(); }
      catch (error) {
        if (controller.signal.aborted) throw error;
        const invalid = new Error('El servidor devolvió una respuesta que no es JSON válido.');
        invalid.status = response.status;
        throw invalid;
      }
      if (allowUnavailable && response.status === 503 && data.model_loaded === false) return data;
      if (!response.ok) {
        const detail = typeof data.detail === 'string' ? data.detail : `El servidor respondió con un error (${response.status}).`;
        const error = new Error(detail);
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (controller.signal.aborted) {
        const interrupted = new Error(timedOut ? 'El servidor excedió el tiempo de espera. Puedes volver a intentarlo.' : 'La solicitud se canceló.');
        interrupted.cancelled = !timedOut;
        throw interrupted;
      }
      if (error instanceof TypeError) {
        const connectionError = new Error('No se pudo conectar al servidor. Comprueba la conexión y la dirección de la API.');
        connectionError.connection = true;
        throw connectionError;
      }
      throw error;
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); this.controllers.delete(controller); }
  }
  predict(image, isBase64 = false, options = {}) {
    const { persist, ...requestOptions } = options;
    const path = persist ? '/predict?persist=' + encodeURIComponent(persist) : '/predict';
    if (isBase64) return this.request(path, { ...requestOptions, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({image}) });
    const form = new FormData(); form.append('file', image, image.name || 'camera.jpg');
    return this.request(path, { ...requestOptions, method: 'POST', body: form });
  }
  batch(files, options = {}) {
    const { persist, ...requestOptions } = options;
    const path = persist ? '/predict/batch?persist=' + encodeURIComponent(persist) : '/predict/batch';
    const form = new FormData(); files.forEach(f => form.append('files', f, f.name));
    return this.request(path, { ...requestOptions, method: 'POST', body: form });
  }
  health() { return this.request('/health', { allowUnavailable: true, cache: 'no-store' }); }
  modelInfo() { return this.request('/model/info'); }
}
