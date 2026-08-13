/**
 * How far the child has got, across every game and every session.
 *
 * ## Why anything more than a streak
 *
 * The app used to show a row of up to five stars that reset to nothing on a
 * wrong answer. That is a *streak*, and a streak is the wrong shape of reward
 * for a three-year-old: it can only go down, it is gone by the next morning,
 * and the fifth star is as good as it ever gets. A child who plays every day
 * for a week sees exactly what they saw on the first minute of the first day.
 *
 * This is the other thing — a total that only ever goes up, saved on the
 * device, shown as a ring that fills. Wrong answers cost nothing. Coming back
 * tomorrow starts where yesterday stopped. Every level is a small ceremony and
 * the ring immediately starts filling again, which is the loop that makes these
 * apps hard to put down and is worth being deliberate about rather than
 * accidental.
 *
 * ## Levels get longer, and that is the whole difficulty curve
 *
 * Five right answers for the first level, one more for each after that, capped
 * at twelve. Early levels arrive fast enough to teach what the ring is for; by
 * level ten they are a proper sitting's work. Nothing else in the app changes
 * with level — this is a reward, not a gate, and there is no version of this
 * app where a child is locked out of the fishing game.
 *
 * ## What this module is not
 *
 * Not a score, not a leaderboard, and never sent anywhere. It is one number in
 * localStorage on one device. See the note on `load` about why losing it is
 * treated as unimportant.
 */

/** Where the total lives. Versioned, so the shape can change later. */
const KEY = 'urdu-games:progress:v1';

/** Right answers for the level after `level` completed levels. */
export function stepsForLevel(level) {
  return Math.min(5 + level, 12);
}

/**
 * The look of each level, and it escalates.
 *
 * The point of the ring is that it visibly becomes more than it was. Colour
 * alone is too quiet for that — a three-year-old will not notice that teal
 * became purple — so each tier also adds a star orbiting the ring, and the
 * later ones add a crown. Past the end of the list the colours cycle and the
 * crown stays, because a child who has got that far has got the message.
 */
export const TIERS = [
  { color: 0x3f9ee0, stars: 0, crown: false },
  { color: 0x2fae74, stars: 1, crown: false },
  { color: 0x9b5fc9, stars: 2, crown: false },
  { color: 0xe98a1f, stars: 3, crown: false },
  { color: 0xd94f8c, stars: 4, crown: true },
  { color: 0xf2c230, stars: 5, crown: true },
];

export function tierFor(level) {
  return TIERS[Math.min(level, TIERS.length - 1)];
}

let total = 0;
/** @type {Set<(state: object) => void>} */
const listeners = new Set();

/**
 * Reads the saved total.
 *
 * Any failure — private browsing refusing storage, a value from a future
 * version, someone editing it by hand — lands on zero rather than throwing.
 * Losing this is a disappointment and nothing more; a child who cannot open
 * the app because their progress file is corrupt is a real problem, and the
 * two are not close in weight.
 */
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
    // Private browsing. The session still counts up, it just will not be there
    // tomorrow, and that is a better answer than refusing to keep score.
  }
}

total = load();

/**
 * Where a running total of right answers puts you.
 *
 * Levels are derived rather than stored, so there is exactly one number to
 * persist and no way for the level and the count to disagree.
 */
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

/** The current state. Cheap; call it whenever. */
export function state() {
  return unpack(total);
}

/**
 * Counts some right answers and tells anyone watching.
 *
 * @param {number} [amount] 1 for an answer, more for finishing something
 * @returns {object} the new state, with `levelledUp` and `gained` on it
 */
export function award(amount = 1) {
  const before = unpack(total);
  total += Math.max(0, Math.floor(amount));
  save();
  const after = { ...unpack(total), gained: amount, levelledUp: false };
  after.levelledUp = after.level > before.level;
  for (const listener of listeners) listener(after);
  return after;
}

/**
 * Back to nothing.
 *
 * Offered in the settings screen because a second child eventually uses the
 * same tablet, and "this is not mine" is a real reason to want it gone.
 */
export function reset() {
  total = 0;
  save();
  const after = { ...state(), gained: 0, levelledUp: false, reset: true };
  for (const listener of listeners) listener(after);
  return after;
}

/** @returns {() => void} unsubscribe */
export function onProgress(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
