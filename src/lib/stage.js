/**
 * The furniture every game screen has, built once.
 *
 * Six scenes were each opening with the same forty lines: paint the sky, plant
 * the meadow, put a home button in the top-left corner, hang the instruction
 * ribbon, stand the garden at the left, and stop any voice that is still
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
import { starShower } from './particles.js';
import { addRail } from './rail.js';
import { addScenery } from './scenery.js';
import { COLORS, RAIL, makeButton } from './theme.js';

/** The rail, and everything the rail carries, sits above the game. */
const RAIL_DEPTH = 3;

/**
 * Progress has its own strip down the left of every game screen, and the way
 * out sits at the top of it. See src/lib/rail.js.
 *
 * There are no per-scene overrides any more. Every screen had its own idea of
 * where the character stood — nine different x, y and height triples — and the
 * whole point of a rail is that it is in the same place on all of them.
 */

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
 * @param {boolean} [options.rail=true] false for the one screen that is a
 *   letter and its word with no furniture at all.
 * @returns {{banner: *, rail: *}} both possibly null
 */
export function addStage(scene, options = {}) {
  const { hills = true, instruction, roman, rail: wantRail = true } = options;

  scene.cameras.main.setBackgroundColor(COLORS.bg);
  addScenery(scene, { hills });

  const rail = wantRail ? addRail(scene, { depth: RAIL_DEPTH }) : null;

  // Above the rail, not merely after it: the rail is drawn at a depth so that
  // the game passes behind it, and being added later is not enough to beat a
  // depth. The way out disappearing under the panel is the one bug this layout
  // makes easy.
  const home = makeButton(scene, {
    x: RAIL.width / 2,
    y: 62,
    width: 96,
    height: 68,
    color: COLORS.panel,
    rim: false,
    // Through the history rather than starting Home directly, so this button
    // and the phone's back button are the same single path. See
    // src/lib/history.js.
    onTap: () => goBack(),
  });
  home.setDepth(RAIL_DEPTH + 1).setName('home-button');
  home.add(
    scene.add.text(0, 0, '⌂', { fontSize: '34px', color: COLORS.ink }).setOrigin(0.5)
  );

  const banner = instruction ? addBanner(scene, { ui: instruction, roman }) : null;

  // Leaving mid-word should not leave a voice talking over the menu.
  scene.events.once('shutdown', stopAll);

  return { banner, rail };
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
 * @param {{banner: *, rail: *}} stage what addStage returned
 * @param {object} [options]
 * @param {number} [options.duration] how long the stars keep falling
 */
export function wellDone(scene, { banner, rail }, options = {}) {
  paperFall(scene);
  starShower(scene, options.duration ? { duration: options.duration } : {});
  rail?.cheer();
  if (banner) {
    // Said before the jumping starts: a ribbon still reading "find the letter"
    // while it dances is celebrating the wrong thing.
    banner.setInstruction('well-done', 'Well done!');
    jig(scene, banner, { angle: 4, repeats: 5 });
  }
}
