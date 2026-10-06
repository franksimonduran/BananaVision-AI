import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { protocol: 'http:', port: '8000', hostname: '127.0.0.1', origin: 'http://127.0.0.1:8000' };
const { default: ApiClient } = await import('../api.js');

async function withFetch(fetch, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fetch;
  try { await run(); } finally { globalThis.fetch = original; }
}

test('una cancelación externa aborta la petición y limpia el controlador', async () => {
  await withFetch((url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))), async () => {
    const api = new ApiClient(location.origin), controller = new AbortController();
    const request = api.request('/predict', { signal: controller.signal });
    controller.abort();
    await assert.rejects(request, error => error.cancelled === true);
    assert.equal(api.controllers.size, 0);
  });
});

test('un JSON inválido no se transforma silenciosamente en un objeto vacío', async () => {
  await withFetch(async () => new Response('<html>Error</html>', { status: 502 }), async () => {
    const api = new ApiClient(location.origin);
    await assert.rejects(api.health(), error => error.status === 502 && /JSON válido/.test(error.message));
    assert.equal(api.controllers.size, 0);
  });
});

test('health admite el 503 explícito de modelo no disponible', async () => {
  await withFetch(async () => new Response(JSON.stringify({ model_loaded: false }), { status: 503 }), async () => {
    const api = new ApiClient(location.origin);
    assert.deepEqual(await api.health(), { model_loaded: false });
    await assert.rejects(api.modelInfo(), error => error.status === 503);
  });
});
