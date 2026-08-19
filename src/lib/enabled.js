/**
 * What content is currently in play.
 *
 * Two settings, and they answer different questions.
 *
 * **The numbers band** is how far the counting goes: ten, twenty, or the whole
 * hundred. `content/numbers.json` holds 0–100 plus a thousand and a lakh, and
 * showing all of that to a three-year-old on their first day would be absurd —
 * ninety-nine turning up in a matching game is not a harder question, it is a
 * different app. Ten is the default, which is what the app did before the rest
 * of the numbers existed.
 *
 * Written here rather than in `content.js` because it is a preference, and
 * preferences in this app live beside the thing they switch — see `music.js`
 * and `indicators/index.js` for the same shape.
 */

const BAND_KEY = 'urdu-games:numbers-band';

/** The bands offered, in the order Settings lists them. */
export const BANDS = [10, 20, 100];

const DEFAULT_BAND = 10;

/** Everyone who wants telling when this changes mid-session. */
const listeners = new Set();

/**
 * How high the numbers go, as a value rather than an index.
 *
 * Falls back rather than throwing: a band written by a future version, or by
 * somebody editing localStorage, should leave the app working.
 */
export function numberBand() {
  try {
    const saved = Number.parseInt(localStorage.getItem(BAND_KEY) ?? '', 10);
    return BANDS.includes(saved) ? saved : DEFAULT_BAND;
  } catch {
    return DEFAULT_BAND;
  }
}

export function setNumberBand(value) {
  if (!BANDS.includes(value)) return;
  try {
    localStorage.setItem(BAND_KEY, String(value));
  } catch {
    /* private browsing; it just will not be remembered */
  }
  for (const listener of listeners) listener();
}

/**
 * Called whenever what is in play changes.
 *
 * @returns {() => void} unsubscribe
 */
export function onContentChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
