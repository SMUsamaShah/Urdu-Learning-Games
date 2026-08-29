/* The furniture every game screen has, built once. */

import { stopAll } from './audio.js';
import { goBack } from './history.js';
import { addBanner } from './banner.js';
import { paperFall } from './celebrate.js';
import { jig } from './liveliness.js';
import { starShower } from './particles.js';
import { armBrowseTimer, noteFinished } from './chalo.js';
import { noteActivityEnded } from './time-up.js';
import { addRail } from './rail.js';
import { addScenery } from './scenery.js';
import { COLORS, RAIL, makeButton } from './theme.js';
import { randomPraise } from './praise.js';
import { sayPraise } from './say.js';

/* The rail, and everything the rail carries, sits above the game. */
/* The rail sits above the game, not beside it. */
const RAIL_DEPTH = 40;

/* Progress has its own strip down the left of every game screen, and the way out sits at the top of it. */

/** Builds a game screen's chrome.
 * @param {Phaser.Scene} scene
 * @param {object} [options]
 * @param {boolean} [options.hills=true] Hills behind the meadow.
 * @param {string} [options.instruction] UI string id for the ribbon.
 * @param {string} [options.roman] Roman reading of the instruction.
 * @param {boolean} [options.rail=true] Whether to show the progress rail.
 * @returns {{banner: *, rail: *}} both possibly null
 */
export function addStage(scene, options = {}) {
  const { hills = true, instruction, roman, rail: wantRail = true } = options;

  scene.cameras.main.setBackgroundColor(COLORS.bg);
  addScenery(scene, { hills });

  const rail = wantRail ? addRail(scene, { depth: RAIL_DEPTH }) : null;

  // Add the rail after the game elements so it renders above them.
  const home = makeButton(scene, {
    x: RAIL.width / 2,
    y: 62,
    width: 96,
    height: 68,
    color: COLORS.panel,
    rim: false,
    // Through the history rather than starting Home directly.
    onTap: () => goBack(),
  });
  home.setDepth(RAIL_DEPTH + 1).setName('home-button');
  home.add(
    scene.add.text(0, 0, '⌂', { fontSize: '34px', color: COLORS.ink }).setOrigin(0.5)
  );

  const banner = instruction ? addBanner(scene, { ui: instruction, roman }) : null;

  // A چلو run moves on when a screen finishes something.
  armBrowseTimer(scene);

  // Leaving mid-word should not leave a voice talking over the menu.
  scene.events.once('shutdown', stopAll);

  return { banner, rail };
}

/** The big one: a whole activity finished.
 * @param {Phaser.Scene} scene
 * @param {{banner: *, rail: *}} stage what addStage returned
 * @param {object} [options]
 * @param {number} [options.duration] how long the stars keep falling
 */
export function wellDone(scene, { banner, rail }, options = {}) {
  // The one moment every game agrees is an ending.
  noteActivityEnded();
  paperFall(scene);
  starShower(scene, options.duration ? { duration: options.duration } : {});
  rail?.cheer();
  // The same moment, for the same reason, is what a چلو run waits on before it moves to the next game.
  noteFinished(scene);
  // One of eight phrases rather than شاباش every time.
  const praise = randomPraise();
  // Keep the spoken prompt and ribbon text in sync.
  sayPraise(praise.id);
  if (banner) {
    // Said before the jumping starts: a ribbon still reading "find the letter" while it dances is celebrating the wrong thing.
    banner.setInstruction(praise.id, praise.english);
    jig(scene, banner, { angle: 4, repeats: 5 });
  }
}
