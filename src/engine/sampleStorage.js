// IndexedDB persistence for custom drum samples.
//
// Project JSON in localStorage only keeps pad.fileName (display metadata).
// Decoded AudioBuffers stay in sampler.js's in-memory cache. Raw file bytes
// live here so custom samples survive refresh / song reload without stuffing
// large binaries into localStorage or Vue-reactive project state.

const DB_NAME = 'midi-daw-samples';
const DB_VERSION = 1;
const STORE = 'samples';

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'padId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Failed to open sample storage'));
    };
  });
  return dbPromise;
}

function idbReq(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Store raw sample bytes for a pad. Replaces any previous entry.
 * @param {string} padId
 * @param {ArrayBuffer} arrayBuffer
 * @param {{ fileName?: string }} [meta]
 */
export async function putStoredSample(padId, arrayBuffer, meta = {}) {
  if (!padId || !arrayBuffer) return;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await idbReq(
    tx.objectStore(STORE).put({
      padId,
      arrayBuffer,
      fileName: typeof meta.fileName === 'string' ? meta.fileName : '',
      updatedAt: new Date().toISOString(),
    })
  );
}

/**
 * @param {string} padId
 * @returns {Promise<{ arrayBuffer: ArrayBuffer, fileName: string } | null>}
 */
export async function getStoredSample(padId) {
  if (!padId) return null;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const row = await idbReq(tx.objectStore(STORE).get(padId));
    if (!row?.arrayBuffer) return null;
    return {
      arrayBuffer: row.arrayBuffer,
      fileName: typeof row.fileName === 'string' ? row.fileName : '',
    };
  } catch (err) {
    console.warn(`Failed to read stored sample for pad "${padId}":`, err);
    return null;
  }
}

/** @param {string} padId */
export async function deleteStoredSample(padId) {
  if (!padId) return;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    await idbReq(tx.objectStore(STORE).delete(padId));
  } catch (err) {
    console.warn(`Failed to delete stored sample for pad "${padId}":`, err);
  }
}

/** @param {Iterable<string>} padIds */
export async function deleteStoredSamples(padIds) {
  const ids = [...new Set(padIds)].filter(Boolean);
  if (!ids.length) return;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    await Promise.all(ids.map((id) => idbReq(store.delete(id))));
  } catch (err) {
    console.warn('Failed to delete stored samples:', err);
  }
}
