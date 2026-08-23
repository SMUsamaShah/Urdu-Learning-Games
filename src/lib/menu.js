/**
 * Which games the menu shows, in what order, and how they fall into pages.
 *
 * `games.js` says what exists. This says where it goes, because that is a
 * preference rather than a fact about the app: a parent decides which of the
 * twenty-seven are worth a place and which order they come in, and it is
 * remembered on the device like every other preference here.
 *
 * The on and off switch is not here — it is the `'game'` kind in enabled.js,
 * which already stores the *disabled* set, already tells its listeners, and
 * already has switch rows in Settings. This file only arranges what that leaves.
 *
 * ## Keys, not indexes, and reconciled on the way out
 *
 * The stored order is a list of scene keys. Storing indexes would mean a
 * saved order silently pointing at the wrong games the moment one is added or
 * removed, and games *will* be removed — the switches exist partly to work out
 * which ones.
 *
 * So `orderedGames()` reconciles against `GAMES` every time: a key that no
 * longer names a game is dropped, and a game with no entry goes to the end in
 * its authored position. That is what makes adding a game next month safe. It
 * appears, at the back, for everybody who already has the app, rather than not
 * appearing at all or throwing.
 *
 * ## Pages, not a popup
 *
 * There used to be a "more games" tile opening a panel, plus a second tile for
 * the spelling group. Both are gone. The menu is one grid of ten that swipes
 * sideways, so where a game sits in this list is the whole of what decides
 * whether it is on the first screen — which is what makes ordering worth doing.
 */

import { GAMES } from './games.js';
import { enableAll, isEnabled, onContentChange } from './enabled.js';

const KEY = 'urdu-games:menu-order';

/**
 * Tiles on one page.
 *
 * Ten, as five across and two down, which is the grid the menu already had. It
 * is one number and Home lays itself out from it; see the note there about
 * COLUMNS deciding the rest.
 */
export const PER_PAGE = 10;

/** Everyone who wants telling when the order changes mid-session. */
const listeners = new Set();

/** @type {string[]} scene keys, in the order a parent put them. */
let order = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((key) => typeof key === 'string') : [];
  } catch {
    // Nothing saved, or something unparseable. The authored order is a good
    // default and a broken preference must not cost anybody their menu.
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    /* private browsing; the session keeps the order, tomorrow does not */
  }
}

function changed() {
  save();
  for (const listener of listeners) listener();
}

/**
 * Every game, in the order the menu would use, switched-off ones included.
 *
 * What Settings lists. The reconciliation described above happens here rather
 * than at write time, so a `GAMES` that changed under a saved order is handled
 * on the next read instead of needing a migration.
 */
export function orderedGames() {
  const byKey = new Map(GAMES.map((game) => [game.scene, game]));
  const placed = [];
  for (const key of order) {
    const game = byKey.get(key);
    if (!game) continue;
    byKey.delete(key);
    placed.push(game);
  }
  // Whatever the saved order never mentioned, in the order games.js authored
  // it. `byKey` is still in insertion order here, which is that order.
  return [...placed, ...byKey.values()];
}

/**
 * The games the menu actually deals: in order, switched-on only.
 *
 * **Everything, if nothing is left on.** The same `orAll` discipline as
 * `activeLetters()` in content.js: a parent who switches off all twenty-seven
 * should get a menu they can undo from, not an empty screen with no way back to
 * Settings. Nothing in the app is allowed to end up with nothing to show.
 */
export function menuGames() {
  const on = orderedGames().filter((game) => isEnabled('game', game.scene));
  return on.length ? on : orderedGames();
}

/** Chunks of `PER_PAGE`, at least one page even when there is nothing in it. */
export function pagesOf(games) {
  if (!games.length) return [[]];
  const pages = [];
  for (let at = 0; at < games.length; at += PER_PAGE) pages.push(games.slice(at, at + PER_PAGE));
  return pages;
}

/** How many pages the menu has right now. */
export const pageCount = () => pagesOf(menuGames()).length;

/**
 * Moves a game to a position in the full ordered list.
 *
 * Indexes into `orderedGames()`, which includes the switched-off ones, because
 * that is the list Settings shows and the list a finger is dragging in. Working
 * in indexes of the *enabled* list would make a drag land somewhere else
 * whenever a disabled row sat between the two ends of it.
 *
 * @param {string} scene the game being moved
 * @param {number} to where it should end up
 */
export function move(scene, to) {
  const keys = orderedGames().map((game) => game.scene);
  const from = keys.indexOf(scene);
  if (from < 0) return;
  keys.splice(from, 1);
  keys.splice(Math.max(0, Math.min(keys.length, to)), 0, scene);
  order = keys;
  changed();
}

/** Back to the order games.js authors, with everything switched on. */
export function resetMenu() {
  order = [];
  enableAll('game');
  changed();
}

/**
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 *
 * Wired to enabled.js as well, because "what the menu shows" changes when
 * either the order or the switches do, and a caller should not have to know
 * that it is two stores.
 */
export function onMenuChange(listener) {
  listeners.add(listener);
  const stopContent = onContentChange(listener);
  return () => {
    listeners.delete(listener);
    stopContent();
  };
}
