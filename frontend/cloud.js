/** Private, same-origin cloud history. No login or token in localStorage. */
export default class CloudClient {
  constructor() {
    this.images = new Map();
  }

  async request(path, { responseType = 'json', ...options } = {}) {
    const response = await fetch('/cloud' + path, {
      credentials: 'same-origin', cache: 'no-store', ...options,
    });
    if (responseType === 'blob' && response.ok) return response.blob();
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) {
      const error = new Error(data.detail || 'El servidor no pudo completar la solicitud.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  json(path, payload) {
    return this.request(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  me() { return this.request('/me'); }
  anonymous() { return this.request('/anonymous', { method: 'POST' }); }
  history() { return this.request('/history'); }
  detail(id) { return this.request('/history/' + encodeURIComponent(id)); }
  clearHistory() { return this.request('/history', { method: 'DELETE' }); }
  async historyPhoto(id) {
    return this.request('/history/' + encodeURIComponent(id) + '/image', { responseType: 'blob' });
  }

  async rejections(limit = 50) {
    const result = await this.request('/rejections?limit=' + Math.min(200, Math.max(1, limit)));
    const items = await Promise.all(result.items.map(async record => {
      const key = 'rejection:' + record.id;
      let blob = this.images.get(key);
      if (!blob) {
        blob = await this.request('/rejections/' + encodeURIComponent(record.id) + '/image',
          { responseType: 'blob' });
        this.images.set(key, blob);
      }
      return { ...record, blob };
    }));
    return { items, total: result.total };
  }

  async removeRejection(id) {
    await this.request('/rejections/' + encodeURIComponent(id), { method: 'DELETE' });
    this.images.delete('rejection:' + id);
  }
  async clearRejections() {
    await this.request('/rejections', { method: 'DELETE' });
    this.images.clear();
  }

  async importHistoryItem(item, stored) {
    const form = new FormData();
    form.append('metadata', JSON.stringify({
      id: item.id, name: item.name, label: item.label,
      confidence: item.confidence, inference_time_ms: item.inference_time_ms,
      timestamp: item.timestamp, result: stored?.data || null,
    }));
    if (stored?.blob) form.append('file', stored.blob, 'archivo.jpg');
    return this.request('/import', { method: 'POST', body: form });
  }
}
