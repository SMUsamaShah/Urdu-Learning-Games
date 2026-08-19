import Phaser from 'phaser';
import { GAMES } from './games.js';

/**
 * چلو — "let's go". One tap, and the app plays itself.
 *
 * ## Why this is the front door
 *
 * The menu asks a three-year-old to choose between twenty-four pictures, in a
 * script they cannot read, before anything happens. They cannot, so they tap
 * whichever tile they tapped last time, and fifteen of the games are never seen
 * by the person the app was built for. A parent handing over a phone wants to
 * hand over something that is already going.
 *
 * So چلو starts a random activity, and when that activity is *finished* — not
 * when it is quit — moves straight into a different one. Nothing announces the
 * change; the screen swooshes and there is a new game. That is the whole
 * feature, and it is meant to be how the app is normally played.
 *
 * ## What counts as finished
 *
 * Every game already says so, and this listens rather than asking each screen
 * to learn a new trick. `wellDone()` in stage.js is called at exactly one
 * moment: a board matched, a letter traced, five right in a row. Eleven games
 * reach it through `finished()` and the rest through `milestone()` on the fifth
 * correct answer, so a turn is somewhere between half a minute and a couple of
 * minutes — long enough to be an activity, short enough that a child who is not
 * enjoying this one only has to wait a little.
 *
 * Flashcards is the one screen that never finishes: it is a thing to browse,
 * with no round and no win. In a run it gets a clock instead.
 *
 * ## Never the same one twice
 *
 * A shuffled bag rather than a die: a random pick repeats about one turn in
 * twenty-four, and a repeat immediately after the same game reads as the button
 * being broken. The bag refills when it empties, minus whatever was last
 * played, so the join between two bags cannot repeat either.
 */

/** How long a browsing screen gets before the run moves on. */
const BROWSE_MS = 45000;

/** Games a run can choose. Everything with a scene — the panel tile has none. */
const PLAYABLE = GAMES.filter((game) => game.scene).map((game) => game.scene);

/** Screens with no finish of their own, and how long they get instead. */
const BROWSING = new Set(['Flashcards']);

/** @type {{bag: string[], last: string|null}|null} */
let run = null;

export function running() {
  return run !== null;
}

/** The scene a run is currently on, for the checks. */
export function currentGame() {
  return run?.last ?? null;
}

/** Draws the next game, never the one just played. */
function nextGame() {
  if (!run.bag.length) {
    run.bag = Phaser.Utils.Array.Shuffle(
      PLAYABLE.filter((key) => key !== run.last)
    );
  }
  return run.bag.pop();
}

/**
 * Starts a run.
 *
 * @param {(key: string, first: boolean) => void} open how to open a game —
 *   `Home.openGame`, which owns what leaving one means. `first` says whether
 *   this is the game the button started, so Home can push a history entry for
 *   it and *replace* that one entry for every game after: a run must be one
 *   back press deep however many games it has been through, or a child who has
 *   played six of them has six presses between here and the menu.
 * @param {() => void} onEnd called when the run stops, so Home can tidy up.
 */
export function startRun(open, onEnd) {
  run = { bag: [], last: null, open, onEnd, started: false };
  advance();
}

export function stopRun() {
  if (!run) return;
  const { onEnd } = run;
  run = null;
  onEnd?.();
}

/** Opens the next game in the run. */
function advance() {
  if (!run) return;
  const key = nextGame();
  const first = !run.started;
  run.started = true;
  run.last = key;
  run.open(key, first);
}

/**
 * A screen finished something. Called from wellDone(), so every game reports
 * it without knowing this exists.
 *
 * Delayed by the length of the celebration: the paper is still falling when
 * this arrives, and cutting away from a child's own fanfare to a new screen is
 * the one way this feature could feel like a punishment for winning.
 *
 * @param {Phaser.Scene} scene the screen that finished
 */
export function noteFinished(scene) {
  if (!run) return;
  // Only the screen the run is actually on. A stale timer from a game the
  // child left by hand must not drag the run somewhere new.
  if (scene.scene.key !== run.last) return;
  scene.time.delayedCall(2600, () => {
    if (!run || scene.scene.key !== run.last) return;
    advance();
  });
}

/**
 * Gives a screen with no finish of its own a clock, if a run is going.
 *
 * Called from addStage, so a scene does not have to know whether it is being
 * played on its own or as part of a run.
 */
export function armBrowseTimer(scene) {
  if (!run || !BROWSING.has(scene.scene.key)) return;
  scene.time.delayedCall(BROWSE_MS, () => {
    if (!run || scene.scene.key !== run.last) return;
    advance();
  });
}
