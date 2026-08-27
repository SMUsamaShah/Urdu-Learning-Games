/* Device-local recordings, in IndexedDB. */

const DB_NAME = 'urdu-learning-games';
const DB_VERSION = 1;
const CLIPS = 'clips';
const META = 'meta';

/** @type {Promise<IDBDatabase|null>|null} */
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CLIPS)) {
        db.createObjectStore(CLIPS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('clip-store: IndexedDB unavailable', request.error);
      resolve(null);
    };
  });
  return dbPromise;
}

function run(store, mode, work) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        if (!db) return resolve(null);
        const tx = db.transaction(store, mode);
        const request = work(tx.objectStore(store));
        tx.onabort = tx.onerror = () => reject(tx.error);
        if (request) request.onsuccess = () => resolve(request.result);
        else tx.oncomplete = () => resolve(null);
      })
  );
}

/** @returns {Promise<{key,slug,ext,mime,blob,bytes,recordedAt}|null>} */
export function getClip(key) {
  return run(CLIPS, 'readonly', (s) => s.get(key)).then((r) => r ?? null);
}

/* Every device-recorded key, for deciding what overrides the bundled clips. */
export async function allKeys() {
  const keys = await run(CLIPS, 'readonly', (s) => s.getAllKeys());
  return keys ?? [];
}

/* Full records, for export. */
export async function allClips() {
  const clips = await run(CLIPS, 'readonly', (s) => s.getAll());
  return clips ?? [];
}

/* Sizes and dates without loading a single audio blob into memory. */
export async function summaries() {
  const clips = await allClips();
  return clips.map(({ key, slug, ext, bytes, recordedAt }) => ({
    key,
    slug,
    ext,
    bytes,
    recordedAt,
  }));
}

/* Saves a recording, replacing any previous take for the same clip. */
export async function putClip({ key, slug, ext, mime, blob, recordedAt, profile }) {
  const record = {
    key,
    slug,
    ext,
    mime: mime ?? blob.type ?? '',
    blob,
    bytes: blob.size,
    recordedAt: recordedAt ?? Date.now(),
    // Which microphone settings produced this take.
    profile: profile ?? null,
  };
  await run(CLIPS, 'readwrite', (s) => s.put(record));
  requestPersistence().catch(() => {});
  return record;
}

export function deleteClip(key) {
  return run(CLIPS, 'readwrite', (s) => s.delete(key));
}

/** The plain key-value half of the database, open to anything small.
 * @param {string} key namespaced by its owner, e.g.
 */
export async function getMeta(key) {
  const value = await run(META, 'readonly', (s) => s.get(key));
  return value ?? null;
}

export function putMeta(key, value) {
  return run(META, 'readwrite', (s) => s.put(value, key));
}

export function deleteMeta(key) {
  return run(META, 'readwrite', (s) => s.delete(key));
}

const getLastExport = () => getMeta('lastExportedAt');

export function setLastExport(when = Date.now()) {
  return putMeta('lastExportedAt', when);
}

/** Asks the browser not to evict this data.
 * @returns {Promise<boolean>}
 */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

async function isPersisted() {
  if (!navigator.storage?.persisted) return false;
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

/** How safe the recordings currently are, for showing the user plainly.
 * @returns {Promise<{persisted: boolean, installed: boolean, count: number,
 */
export async function storageStatus() {
  const [persisted, clips, lastExportedAt] = await Promise.all([
    isPersisted(),
    summaries(),
    getLastExport(),
  ]);
  const installed =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true);

  return {
    persisted,
    installed,
    count: clips.length,
    bytes: clips.reduce((n, c) => n + (c.bytes ?? 0), 0),
    lastExportedAt,
    unexported: lastExportedAt
      ? clips.filter((c) => (c.recordedAt ?? 0) > lastExportedAt).length
      : clips.length,
  };
}
