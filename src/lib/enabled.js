/* What content is currently in play. */

const BAND_KEY = 'urdu-games:numbers-band';
const OFF_KEY = 'urdu-games:disabled';

/* The four things that can be switched off, and nothing else. */
export const KINDS = ['letter', 'word', 'number', 'game'];

/* The bands offered, in the order Settings lists them. */
export const BANDS = [10, 20, 100];

const DEFAULT_BAND = 10;

/* Everyone who wants telling when this changes mid-session. */
const listeners = new Set();

/* How high the numbers go, as a value rather than an index. */
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

/* The disabled ids, by kind. */
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
 * @param {'letter'|'word'|'number'|'game'} kind
 * @param {string} id a content id, or a scene key for a game
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

/* How many of a kind are switched off, for the Settings row. */
export function disabledCount(kind) {
  return off[kind]?.size ?? 0;
}

/* Everything of one kind back on, or of every kind when none is named. */
export function enableAll(kind) {
  for (const each of kind ? [kind] : KINDS) off[each] = new Set();
  save();
  for (const listener of listeners) listener();
}

/* Re-reads storage. */
export function reloadEnabled() {
  off = load();
  for (const listener of listeners) listener();
}

/** Called whenever what is in play changes.
 * @returns {() => void} unsubscribe
 */
export function onContentChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
