/* How far the child has got, across every game and every session. */

/* Where the total lives. */
const KEY = 'urdu-games:progress:v1';

/* Right answers for the level after `level` completed levels. */
export function stepsForLevel(level) {
  return Math.min(5 + level, 12);
}

/* What one wrong answer costs. */
export const SETBACK = 2;

let total = 0;
/** @type {Set<(state: object) => void>} */
const listeners = new Set();

/* Reads the saved total. */
function load() {
  try {
    const stored = Number(localStorage.getItem(KEY));
    return Number.isFinite(stored) && stored >= 0 ? Math.floor(stored) : 0;
  } catch (error) {
    return 0;
  }
}

function save() {
  try {
    localStorage.setItem(KEY, String(total));
  } catch (error) {
    // Private browsing.
  }
}

total = load();

/* Where a running total of right answers puts you. */
function unpack(count) {
  let level = 0;
  let left = count;
  while (left >= stepsForLevel(level)) {
    left -= stepsForLevel(level);
    level++;
  }
  const steps = stepsForLevel(level);
  return { total: count, level, step: left, steps, fraction: left / steps };
}

/* The current state. */
export function state() {
  return unpack(total);
}

/** Counts some right answers and tells anyone watching.
 * @param {number} [amount] 1 for an answer, more for finishing something
 * @returns {object} the new state, with `levelledUp` and `gained` on it
 */
export function award(amount = 1) {
  return move(Math.max(0, Math.floor(amount)));
}

/** Takes some back, for a wrong answer.
 * @param {number} [amount]
 * @returns {object} the new state, with `levelledDown` on it
 */
export function setback(amount = SETBACK) {
  return move(-Math.max(0, Math.floor(amount)));
}

/* The one place the total changes, so a move can never skip the listeners. */
function move(delta) {
  const before = unpack(total);
  total = Math.max(0, total + delta);
  save();
  const after = {
    ...unpack(total),
    gained: delta,
    levelledUp: false,
    levelledDown: false,
  };
  after.levelledUp = after.level > before.level;
  after.levelledDown = after.level < before.level;
  for (const listener of listeners) listener(after);
  return after;
}

/* Back to nothing. */
export function reset() {
  total = 0;
  save();
  const after = {
    ...state(),
    gained: 0,
    levelledUp: false,
    levelledDown: false,
    reset: true,
  };
  for (const listener of listeners) listener(after);
  return after;
}

/** @returns {() => void} unsubscribe */
export function onProgress(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
