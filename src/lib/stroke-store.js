import { glyphFont, glyphUpem } from './content.js';
import { deleteMeta, getMeta, putMeta, requestPersistence } from './clip-store.js';

/* Pen paths corrected on this device, in IndexedDB. */

const KEY = 'strokes';

/* Which font these paths were drawn against; see tools/font.mjs. */
const font = () => glyphFont();

const empty = () => ({ font: font(), letters: {} });

/** Everything corrected on this device, for the current font.
 * @returns {Promise<{font: object|null, letters: Record<string, {strokes: object[], editedAt: number}>}>}
 */
export async function deviceStrokes() {
  try {
    const stored = await getMeta(KEY);
    if (!stored?.letters) return empty();
    if (stored.font?.sha !== font()?.sha) return empty();
    return stored;
  } catch {
    return empty();
  }
}

/* Saves one letter, stamped with the font it was drawn against. */
export async function saveLetter(letterId, strokes) {
  const stored = await deviceStrokes();
  stored.font = font();
  stored.letters[letterId] = { strokes, editedAt: Date.now() };
  await putMeta(KEY, stored);
  // Ask for permission only when recording is first saved.
  requestPersistence().catch(() => {});
  return stored;
}

/* Removes the device correction for this letter. */
export async function clearLetter(letterId) {
  const stored = await deviceStrokes();
  delete stored.letters[letterId];
  await putMeta(KEY, stored);
  return stored;
}

export async function clearAll() {
  await deleteMeta(KEY);
  return empty();
}

/* What an export file looks like: the device's letters and the font they belong to, and nothing else. */
export function exportShape(stored) {
  return {
    kind: 'urdu-traces',
    version: 1,
    exportedAt: new Date().toISOString(),
    upem: glyphUpem(),
    font: stored.font ?? font(),
    letters: Object.fromEntries(
      Object.entries(stored.letters).map(([id, entry]) => [
        id,
        { strokes: entry.strokes, corrected: true },
      ])
    ),
  };
}
