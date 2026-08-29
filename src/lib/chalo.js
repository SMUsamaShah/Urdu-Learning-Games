import Phaser from 'phaser';
import { menuGames } from './menu.js';

/* چلو — "let's go". */

/* How long a browsing screen gets before the run moves on. */
const BROWSE_MS = 45000;

/* Games a run can choose: whatever is switched on, asked fresh every time. */
const playable = () => menuGames().map((game) => game.scene);

/* Screens with no finish of their own, and how long they get instead. */
const BROWSING = new Set(['Flashcards']);

/** @type {{bag: string[], last: string|null}|null} */
let run = null;

export function running() {
  return run !== null;
}

/* The scene a run is currently on, for the checks. */
export function currentGame() {
  return run?.last ?? null;
}

/* Draws the next game, never the one just played. */
function nextGame() {
  if (!run.bag.length) {
    const pool = playable();
    const fresh = pool.filter((key) => key !== run.last);
    run.bag = Phaser.Utils.Array.Shuffle(fresh.length ? fresh : pool);
  }
  return run.bag.pop();
}

/** Starts a run.
 * @param {(key: string, first: boolean) => void} open how to open a game
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

/* Opens the next game in the run. */
function advance() {
  if (!run) return;
  const key = nextGame();
  const first = !run.started;
  run.started = true;
  run.last = key;
  run.open(key, first);
}

/** A screen finished something.
 * @param {Phaser.Scene} scene the screen that finished
 */
export function noteFinished(scene) {
  if (!run) return;
  // Notify only the active screen.
  if (scene.scene.key !== run.last) return;
  scene.time.delayedCall(2600, () => {
    if (!run || scene.scene.key !== run.last) return;
    advance();
  });
}

/* Gives a screen with no finish of its own a clock, if a run is going. */
export function armBrowseTimer(scene) {
  if (!run || !BROWSING.has(scene.scene.key)) return;
  scene.time.delayedCall(BROWSE_MS, () => {
    if (!run || scene.scene.key !== run.last) return;
    advance();
  });
}
