// Store camera rejections as Blobs, independently of the existing text history.
export default class RejectionStore {
  static MAX_CAPTURES = 200;

  constructor() { this.connection = null; }

  open() {
    if (!globalThis.indexedDB) return Promise.reject(new Error('El navegador no permite guardar capturas.'));
    if (!this.connection) {
      this.connection = new Promise((resolve, reject) => {
        const request = indexedDB.open('bananaVisionRejections', 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore('captures', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp');
        };
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

  async write(action) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('captures', 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('No se pudo guardar la captura.'));
      action(transaction.objectStore('captures'));
    });
  }

  async saveReading(reading) {
    if (!reading.fromCamera || reading.data.label !== 'NO APTO') return null;
    const capture = { id: crypto.randomUUID(), timestamp: reading.timestamp, confidence: reading.data.confidence, blob: reading.file };
    await this.write(store => {
      store.add(capture);
      // Tope sencillo: al superar el máximo se eliminan las capturas más antiguas.
      const count = store.count();
      count.onsuccess = () => {
        let excess = count.result - RejectionStore.MAX_CAPTURES;
        if (excess <= 0) return;
        const cursor = store.index('timestamp').openCursor(null, 'next');
        cursor.onsuccess = () => {
          if (!cursor.result || excess-- <= 0) return;
          cursor.result.delete(); cursor.result.continue();
        };
      };
    });
    return capture;
  }

  async snapshot(limit = 50) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('captures', 'readonly');
      const store = transaction.objectStore('captures'), items = [];
      let total = 0;
      const count = store.count(); count.onsuccess = () => { total = count.result; };
      const cursor = store.index('timestamp').openCursor(null, 'prev');
      cursor.onsuccess = () => {
        if (cursor.result && items.length < limit) { items.push(cursor.result.value); if (items.length < limit) cursor.result.continue(); }
      };
      transaction.oncomplete = () => resolve({ items, total });
      transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('No se pudieron leer las capturas.'));
    });
  }

  remove(id) { return this.write(store => store.delete(id)); }
  clear() { return this.write(store => store.clear()); }
}
