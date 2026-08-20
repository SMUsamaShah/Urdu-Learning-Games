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
import { armBrowseTimer, noteFinished } from './chalo.js';
import { addRail } from './rail.js';
import { addScenery } from './scenery.js';
import { COLORS, RAIL, makeButton } from './theme.js';
import { randomPraise } from './praise.js';
import { sayPraise } from './say.js';

/** The rail, and everything the rail carries, sits above the game. */
/**
 * The rail sits above the game, not beside it.
 *
 * It used to be depth 3, which is under everything a game draws, and the claim
 * the rail was built on — opaque, floor to ceiling, nothing showing through —
 * was only true because most games happen to stay out of its 200 pixels.
 * Fishing does not: its fish are recycled off one edge and back in the other,
 * so they swam straight across the panel.
 *
 * Above the games (which reach depth 30) and below the star thrown from an
 * answer into the rail (60), because that one has to land *on* it.
 */
const RAIL_DEPTH = 40;

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

  // A چلو run moves on when a screen finishes something. The screens that never
  // finish anything get a clock instead, armed here so a scene does not have to
  // know whether it is being played alone or as part of a run. See chalo.js.
  armBrowseTimer(scene);

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
  // The one moment every game agrees is "an activity finished", which is what a
  // چلو run waits for. Nothing in the scenes changes for it.
  noteFinished(scene);
  // One of eight phrases rather than شاباش every time. Twenty times a session,
  // the same word stops being praise and becomes a noise the screen makes —
  // and nobody watching a child play says the same thing twenty times.
  const praise = randomPraise();
  // Shown and said, and they have to be the same phrase: a ribbon reading کمال
  // while the voice says شاباش teaches that the writing and the sound are
  // unrelated, which is the opposite of the lesson.
  sayPraise(praise.id);
  if (banner) {
    // Said before the jumping starts: a ribbon still reading "find the letter"
    // while it dances is celebrating the wrong thing.
    banner.setInstruction(praise.id, praise.english);
    jig(scene, banner, { angle: 4, repeats: 5 });
  }
}
