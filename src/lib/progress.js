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
 * This is the other thing — a running total saved on the device, shown as
 * whatever is standing in the rail (src/lib/indicators/). Coming back tomorrow
 * starts where yesterday stopped. Every level is a small ceremony and the next
 * one starts immediately, which is the loop that makes these apps hard to put
 * down and is worth being deliberate about rather than accidental.
 *
 * ## A wrong answer takes some of it back
 *
 * It did not, for a long time, and the reasoning was good: a three-year-old who
 * watches a reward vanish learns that the safe move is to stop playing. What
 * changed is what the total *looks* like. A number going down is a punishment;
 * a vine that loses its top leaf and droops is a plant that wants watering,
 * which is an invitation to have another go rather than a telling-off.
 *
 * So a wrong answer costs `SETBACK` against the one a right answer earns, and
 * it is allowed to cross back into the previous level. It is bounded at zero
 * and nothing else in the app is gated on it — no round ends, nothing locks.
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
 * What one wrong answer costs.
 *
 * Two, against the one a right answer earns. One would be invisible — the
 * drawing would come back to where it was on the next answer and nothing would
 * have happened. Three costs a quarter of an early level for a single slip,
 * which over-punishes a child who tapped the wrong thing because their finger
 * landed badly. Two is the number at which a run of guesses visibly loses
 * ground and one mistake does not.
 */
export const SETBACK = 2;

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
  return move(Math.max(0, Math.floor(amount)));
}

/**
 * Takes some back, for a wrong answer.
 *
 * Floored at zero and at nothing else: it may drop a level, which takes a
 * finished flower off the row in the rail. That is the strongest thing a
 * mistake does and it is the whole reason the setback is visible at all.
 *
 * @param {number} [amount]
 * @returns {object} the new state, with `levelledDown` on it
 */
export function setback(amount = SETBACK) {
  return move(-Math.max(0, Math.floor(amount)));
}

/** The one place the total changes, so a move can never skip the listeners. */
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

/**
 * Back to nothing.
 *
 * Offered in the settings screen because a second child eventually uses the
 * same tablet, and "this is not mine" is a real reason to want it gone.
 */
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
