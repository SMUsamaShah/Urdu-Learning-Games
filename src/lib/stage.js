/**
 * The furniture every game screen has, built once.
 *
 * Six scenes were each opening with the same forty lines: paint the sky, plant
 * the meadow, put a home button in the top-left corner, hang the instruction
 * ribbon, sit the spider down at the left, and stop any voice that is still
 * talking when the scene closes. They had drifted, too — the home buttons were
 * the same size by luck rather than by anything, and one of them had stopped
 * playing its swoosh.
 *
 * That is furniture, not gameplay. A game scene should open by saying what kind
 * of screen it is, and then get on with the part that is actually its own.
 *
 * ## Two calls, because there are two moments
 *
 * `addStage` is the start of a screen. `wellDone` is the end of an activity —
 * a board matched, every letter traced, five right in a row — and it was four
 * more copies of the same five lines, in an order that mattered (the ribbon has
 * to change what it says *before* it starts jumping about, or it jumps while
 * still reading "find the letter").
 *
 * Both take the scene and one options object, and `wellDone` takes back what
 * `addStage` returned. Anything a scene wants to do differently, it does to the
 * objects it gets handed rather than by passing another flag in here.
 */

import { stopAll } from './audio.js';
import { goBack } from './history.js';
import { addBanner } from './banner.js';
import { paperFall } from './celebrate.js';
import { jig } from './liveliness.js';
import { addMascot } from './mascot.js';
import { starShower } from './particles.js';
import { addProgressRing } from './progress-ring.js';
import { addScenery } from './scenery.js';
import { COLORS, DESIGN, makeButton } from './theme.js';

/**
 * Where the spider sits on a game screen.
 *
 * Left, because the answers read right to left and the last tile of a four-wide
 * line-up would otherwise land on its face. Scenes that draw something large in
 * the middle — tracing, at 400px tall — move it with `mascot: {...}`.
 */
const MASCOT = { x: 122, y: 664, height: 236 };

/**
 * Builds a game screen's chrome.
 *
 * @param {Phaser.Scene} scene
 * @param {object} [options]
 * @param {boolean} [options.hills=true] Hills behind the meadow. Off for the
 *   screens where things travel the full height of the sky and would just
 *   vanish behind them.
 * @param {string} [options.instruction] UI string id for the ribbon. No ribbon
 *   without one — the flashcards have nothing to instruct.
 * @param {string} [options.roman] Roman reading of the instruction.
 * @param {object|false} [options.mascot] Overrides for the spider's placement,
 *   or false for none.
 * @returns {{banner: *, mascot: *}} both possibly null
 */
export function addStage(scene, options = {}) {
  const { hills = true, instruction, roman, mascot = {} } = options;

  scene.cameras.main.setBackgroundColor(COLORS.bg);
  addScenery(scene, { hills });

  makeButton(scene, {
    x: 72,
    y: 56,
    width: 96,
    height: 68,
    color: COLORS.panel,
    rim: false,
    // Through the history rather than starting Home directly, so this button
    // and the phone's back button are the same single path. See
    // src/lib/history.js.
    onTap: () => goBack(),
  }).add(
    scene.add.text(0, 0, '⌂', { fontSize: '34px', color: COLORS.ink }).setOrigin(0.5)
  );

  // Every screen, in the one corner all of them leave free. It is the same
  // ring on all twenty-four because it is the same total — a child does not
  // have a fishing score and a balloon score, they have how far they have got.
  const ring = addProgressRing(scene, DESIGN.width - 100, 100);

  const banner = instruction ? addBanner(scene, { ui: instruction, roman }) : null;

  // After the ribbon and before anything the scene adds, so a tile or a balloon
  // that overlaps the spider draws on top of it. The answers are what matters.
  const { x, y, ...rest } = { ...MASCOT, ...(mascot || {}) };
  const spider = mascot ? addMascot(scene, x, y, rest) : null;

  // Leaving mid-word should not leave a voice talking over the menu.
  scene.events.once('shutdown', stopAll);

  return { banner, mascot: spider, ring };
}

/**
 * The big one: a whole activity finished.
 *
 * Deliberately not the same as a single right answer. Paper across the entire
 * screen every time somebody gets something right turns into wallpaper within a
 * minute, and then there is nothing left to escalate to.
 *
 * The sound is not made here. Which one it is depends on what was finished —
 * `milestone()` for a run of five, `finished()` for a whole board — and the
 * caller knows that where this does not.
 *
 * @param {Phaser.Scene} scene
 * @param {{banner: *, mascot: *}} stage what addStage returned
 * @param {object} [options]
 * @param {number} [options.duration] how long the stars keep falling
 */
export function wellDone(scene, { banner, mascot }, options = {}) {
  paperFall(scene);
  starShower(scene, options.duration ? { duration: options.duration } : {});
  mascot?.cheer();
  if (banner) {
    // Said before the jumping starts: a ribbon still reading "find the letter"
    // while it dances is celebrating the wrong thing.
    banner.setInstruction('well-done', 'Well done!');
    jig(scene, banner, { angle: 4, repeats: 5 });
  }
}
