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
 * **The switches** turn any individual letter, word or number off. A child
 * working through the first ten letters still meets ژ in every game otherwise,
 * and a parent has no way to say "not this week". What is switched off must
 * appear nowhere — not as an answer, not as a wrong answer, and not inside a
 * sequence a game generates, which is the part that is easy to miss.
 *
 * ## Off, not on
 *
 * The set stored is the *disabled* ids, not the enabled ones. Everything is on
 * unless somebody said otherwise, so a fresh device stores nothing, and — more
 * importantly — a letter added to `content/letters.json` next month is on for
 * everybody who already has the app rather than silently missing for them.
 *
 * Written here rather than in `content.js` because these are preferences, and
 * preferences in this app live beside the thing they switch — see `music.js`
 * and `indicators/index.js` for the same shape.
 */

const BAND_KEY = 'urdu-games:numbers-band';
const OFF_KEY = 'urdu-games:disabled';

/** The three things that can be switched off, and nothing else. */
export const KINDS = ['letter', 'word', 'number'];

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

// ------------------------------------------------------------- the switches

/**
 * The disabled ids, by kind. Read once and kept, because `isEnabled` is called
 * inside deal loops and `JSON.parse` on every letter of every round is waste.
 */
let off = load();

function load() {
  const empty = Object.fromEntries(KINDS.map((kind) => [kind, new Set()]));
  try {
    const saved = JSON.parse(localStorage.getItem(OFF_KEY) ?? '{}');
    for (const kind of KINDS) {
      if (Array.isArray(saved[kind])) empty[kind] = new Set(saved[kind]);
    }
  } catch {
    /* nothing saved, or something unparseable; everything is on */
  }
  return empty;
}

function save() {
  try {
    localStorage.setItem(
      OFF_KEY,
      JSON.stringify(Object.fromEntries(KINDS.map((kind) => [kind, [...off[kind]]])))
    );
  } catch {
    /* private browsing; it just will not be remembered */
  }
}

/**
 * @param {'letter'|'word'|'number'} kind
 * @param {string} id
 */
export function isEnabled(kind, id) {
  return !off[kind]?.has(id);
}

export function setEnabled(kind, id, on) {
  if (!off[kind]) return;
  if (on) off[kind].delete(id);
  else off[kind].add(id);
  save();
  for (const listener of listeners) listener();
}

/** How many of a kind are switched off, for the Settings row. */
export function disabledCount(kind) {
  return off[kind]?.size ?? 0;
}

/** Everything of one kind back on, or of every kind when none is named. */
export function enableAll(kind) {
  for (const each of kind ? [kind] : KINDS) off[each] = new Set();
  save();
  for (const listener of listeners) listener();
}

/**
 * Re-reads storage. For the checks, which write localStorage directly and then
 * need the running app to notice without a reload.
 */
export function reloadEnabled() {
  off = load();
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
