/**
 * Device-local recordings, in IndexedDB.
 *
 * These never leave the device. They are not uploaded, and the app has no
 * server to upload them to. Moving them somewhere else is an explicit export —
 * see clip-archive.js.
 *
 * ## Why persistence is requested
 *
 * "Stored on the device" is weaker than it sounds. Safari deletes a site's
 * storage after seven days of non-use unless the site has been added to the
 * home screen, and any browser may evict under storage pressure. Somebody could
 * record a hundred clips of their own voice and lose them without ever seeing an
 * error.
 *
 * So the store asks for persistent storage as soon as the first clip is saved,
 * and reports honestly whether it got it. The recorder UI shows that state and
 * nudges towards exporting, because a backup the user controls is the only real
 * protection.
 *
 * Every read degrades to "no device clips" rather than throwing: IndexedDB is
 * unavailable in some private-browsing modes, and that should make the app quiet
 * rather than broken.
 */

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

// ------------------------------------------------------------------- clips

/** @returns {Promise<{key,slug,ext,mime,blob,bytes,recordedAt}|null>} */
export function getClip(key) {
  return run(CLIPS, 'readonly', (s) => s.get(key)).then((r) => r ?? null);
}

/** Every device-recorded key, for deciding what overrides the bundled clips. */
export async function allKeys() {
  const keys = await run(CLIPS, 'readonly', (s) => s.getAllKeys());
  return keys ?? [];
}

/** Full records, for export. Blobs included, so do not call this casually. */
export async function allClips() {
  const clips = await run(CLIPS, 'readonly', (s) => s.getAll());
  return clips ?? [];
}

/** Sizes and dates without loading a single audio blob into memory. */
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

/**
 * Saves a recording, replacing any previous take for the same clip.
 * Requests persistent storage the first time, when the user has just shown the
 * intent that makes it worth asking for.
 */
export async function putClip({ key, slug, ext, mime, blob, recordedAt }) {
  const record = {
    key,
    slug,
    ext,
    mime: mime ?? blob.type ?? '',
    blob,
    bytes: blob.size,
    recordedAt: recordedAt ?? Date.now(),
  };
  await run(CLIPS, 'readwrite', (s) => s.put(record));
  requestPersistence().catch(() => {});
  return record;
}

export function deleteClip(key) {
  return run(CLIPS, 'readwrite', (s) => s.delete(key));
}

export function clearClips() {
  return run(CLIPS, 'readwrite', (s) => s.clear());
}

// -------------------------------------------------------------------- meta

export async function getLastExport() {
  const value = await run(META, 'readonly', (s) => s.get('lastExportedAt'));
  return value ?? null;
}

export function setLastExport(when = Date.now()) {
  return run(META, 'readwrite', (s) => s.put(when, 'lastExportedAt'));
}

// ------------------------------------------------------------- persistence

/**
 * Asks the browser not to evict this data.
 *
 * Chrome grants it based on engagement or installation; Safari grants it to
 * installed web apps. Calling it repeatedly is harmless — it resolves with the
 * current state once already granted.
 *
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

export async function isPersisted() {
  if (!navigator.storage?.persisted) return false;
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

/** @returns {Promise<{usage: number, quota: number}|null>} */
export async function estimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}

/**
 * How safe the recordings currently are, for showing the user plainly.
 *
 * @returns {Promise<{persisted: boolean, installed: boolean, count: number,
 *   bytes: number, lastExportedAt: number|null, unexported: number}>}
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
