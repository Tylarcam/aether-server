// Shared IndexedDB for moving large files between the side panel and the
// service worker. chrome.runtime.sendMessage caps at 64 MiB, so we store the
// blob here and pass only a key. Same DB as recordings (aether_recordings).

const DB_NAME = 'aether_recordings';
const DB_VERSION = 2;
const STORE = 'blobs';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      if (!e.target.result.objectStoreNames.contains(STORE)) {
        e.target.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putUploadFile(file) {
  const key = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(
      { blob: file, mimeType: file.type || 'application/octet-stream', name: file.name },
      key
    );
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
  return key;
}

export async function deleteUploadFile(key) {
  if (!key) return;
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
