import { glyphFont, glyphUpem } from './content.js';
import { deleteMeta, getMeta, putMeta, requestPersistence } from './clip-store.js';

/**
 * Pen paths corrected on this device, in IndexedDB.
 *
 * The bundled paths in content/strokes.json are the ones I have got round to
 * fixing at a computer. These are the ones somebody fixed on the sofa with the
 * tablet in hand, which is the only place there are ever ten spare minutes for
 * it, and they take precedence — see strokes.js.
 *
 * They never leave the device on their own. Moving them anywhere is an explicit
 * export from the settings screen, and the file that comes out is meant to be
 * sent to me and merged into the repo, at which point everybody gets them.
 *
 * ## One record, not thirty-eight
 *
 * All the letters live under a single key in the `meta` store that
 * clip-store.js already opens. Thirty-eight letters of paths is tens of
 * kilobytes — smaller than one recording — so a store of its own would be
 * ceremony, and a whole-file read means the app can decide whether a letter is
 * guided without waiting on a lookup per letter.
 *
 * Every read degrades to "no device strokes" rather than throwing, like
 * clip-store, because IndexedDB is missing in some private-browsing modes and
 * that should make the app quiet rather than broken.
 */

const KEY = 'strokes';

/**
 * Which font these paths were drawn against; see tools/font.mjs.
 *
 * A function rather than a constant: the outlines are fetched, so there is no
 * fingerprint to read until Preload has loaded them. Everything here runs long
 * after that.
 */
const font = () => glyphFont();

const empty = () => ({ font: font(), letters: {} });

/**
 * Everything corrected on this device, for the current font.
 *
 * Paths drawn against another typeface are dropped rather than returned: a
 * stroke is a centreline through one font's outlines, and against another it
 * sits beside the letter and teaches a child to write it wrongly. Dropped on
 * read rather than deleted, because a font can be switched back and there is no
 * reason to destroy somebody's work in the meantime.
 *
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

/**
 * Saves one letter, stamped with the font it was drawn against.
 *
 * Read-modify-write over the whole record. Two saves cannot race here — there
 * is one editor and it is in front of the person doing the saving — and the
 * alternative is a key per letter, which buys nothing at this size.
 */
export async function saveLetter(letterId, strokes) {
  const stored = await deviceStrokes();
  stored.font = font();
  stored.letters[letterId] = { strokes, editedAt: Date.now() };
  await putMeta(KEY, stored);
  // Asked for at the first save, when somebody has just shown the intent that
  // makes it worth asking for.
  requestPersistence().catch(() => {});
  return stored;
}

/** Back to whatever shipped for this letter. */
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

/**
 * What an export file looks like: the device's letters and the font they belong
 * to, and nothing else.
 *
 * Small enough to read, and refusable on the other end — the studio's import
 * checks this fingerprint before it merges anything, so a file drawn against
 * the old font cannot quietly become the repo's paths.
 */
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
