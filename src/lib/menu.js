/* Which games the menu shows, in what order, and how they fall into pages. */

import { GAMES } from './games.js';
import { enableAll, isEnabled, onContentChange } from './enabled.js';

const KEY = 'urdu-games:menu-order';

/* Tiles on one page. */
export const PER_PAGE = 10;

/* Everyone who wants telling when the order changes mid-session. */
const listeners = new Set();

/** @type {string[]} */
let order = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((key) => typeof key === 'string') : [];
  } catch {
    // Nothing saved, or something unparseable.
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

/* Every game, in the order the menu would use, switched-off ones included. */
export function orderedGames() {
  const byKey = new Map(GAMES.map((game) => [game.scene, game]));
  const placed = [];
  for (const key of order) {
    const game = byKey.get(key);
    if (!game) continue;
    byKey.delete(key);
    placed.push(game);
  }
  // Whatever the saved order never mentioned, in the order games.js authored it.
  return [...placed, ...byKey.values()];
}

/* The games the menu actually deals: in order, switched-on only. */
export function menuGames() {
  const on = orderedGames().filter((game) => isEnabled('game', game.scene));
  return on.length ? on : orderedGames();
}

/* Chunks of `PER_PAGE`, at least one page even when there is nothing in it. */
export function pagesOf(games) {
  if (!games.length) return [[]];
  const pages = [];
  for (let at = 0; at < games.length; at += PER_PAGE) pages.push(games.slice(at, at + PER_PAGE));
  return pages;
}

/* How many pages the menu has right now. */
export const pageCount = () => pagesOf(menuGames()).length;

/** Moves a game to a position in the full ordered list.
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

/* Back to the order games.js authors, with everything switched on. */
export function resetMenu() {
  order = [];
  enableAll('game');
  changed();
}

/** Wired to enabled.js as well.
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function onMenuChange(listener) {
  listeners.add(listener);
  const stopContent = onContentChange(listener);
  return () => {
    listeners.delete(listener);
    stopContent();
  };
}
