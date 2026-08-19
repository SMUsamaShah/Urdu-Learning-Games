import * as vine from './vine.js';
import * as bar from './bar.js';
import * as glass from './glass.js';

/**
 * The things that can stand in the progress rail, and which one is chosen.
 *
 * The rail exists so that this list can grow without any of it having to fight
 * the meadow for space — a climber going up a cliff, a character who falls back
 * a step on a wrong answer, a tower being built. Each one is a module with a
 * single `create(scene, box)`; none of them knows what a level is or subscribes
 * to anything. The rail reads the total and hands each change down.
 *
 * ## What an indicator has to do
 *
 * `create(scene, { width, height })` returns a Phaser container whose origin is
 * the **bottom centre** of the box it has been given — everything here grows
 * upwards, so that is the useful corner to measure from — carrying:
 *
 *   - `apply(next, previous)` — the total moved. Both are progress states; the
 *     indicator decides whether that was a step, a level, or a step backwards.
 *   - `focus` — `{ x, y }`, local, where a star thrown from an answer should
 *     land. Roughly "the part that is filling".
 *   - `land()` — something thrown has arrived.
 *   - `cheer()` / `wonder()` — a right and a wrong answer, in the scene's terms.
 *
 * Nothing here is optional; the rail calls all of them.
 */
export const INDICATORS = [
  { id: 'vine', name: 'Vine', module: vine },
  { id: 'bar', name: 'Bar', module: bar },
  { id: 'glass', name: 'Glass of juice', module: glass },
];

const KEY = 'urdu-games:indicator';
/**
 * Which one a device with no preference gets.
 *
 * Also what anyone whose stored preference is `plant` now gets: that indicator
 * is gone, and `currentIndicator()` already answers with this for an id it does
 * not recognise, so no migration is owed.
 */
const DEFAULT = 'vine';

export function indicatorNames() {
  return INDICATORS.map(({ id, name }) => ({ id, name }));
}

export function currentIndicator() {
  try {
    const saved = localStorage.getItem(KEY);
    return INDICATORS.some((i) => i.id === saved) ? saved : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setIndicator(id) {
  if (!INDICATORS.some((i) => i.id === id)) return;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private browsing; it just will not be remembered */
  }
}

/** The chosen one's module, falling back rather than throwing. */
export function indicatorModule(id = currentIndicator()) {
  return (INDICATORS.find((i) => i.id === id) ?? INDICATORS[0]).module;
}
