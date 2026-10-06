// Photos and full model responses are kept outside the lightweight history index.
export default class HistoryImages {
  constructor() { this.connection = null; this.queue = Promise.resolve(); }

  open() {
    if (!globalThis.indexedDB) return Promise.reject(new Error('El navegador no permite guardar fotografías.'));
    if (!this.connection) {
      this.connection = new Promise((resolve, reject) => {
        const request = indexedDB.open('bananaVisionHistoryImages', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('readings', { keyPath: 'id' });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); this.connection = null; };
          resolve(db);
        };
      }).catch(error => { this.connection = null; throw error; });
    }
    return this.connection;
  }

  write(action) {
    const operation = this.queue.then(async () => {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('readings', 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('No se pudo guardar la fotografía.'));
        action(transaction.objectStore('readings'));
      });
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  save(readings, retainedHistory) {
    const retained = new Set(retainedHistory.map(item => item.id).filter(Boolean));
    return this.write(store => {
      for (const reading of readings) {
        if (retained.has(reading.id)) store.put({ id: reading.id, blob: reading.file, data: reading.data });
      }
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        if (!cursor.result) return;
        if (!retained.has(cursor.result.key)) cursor.result.delete();
        cursor.result.continue();
      };
    });
  }

  async get(id) {
    if (!id) return null;
    await this.queue;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('readings', 'readonly').objectStore('readings').get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  clear() { return this.write(store => store.clear()); }
}
