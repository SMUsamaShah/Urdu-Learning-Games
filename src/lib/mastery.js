/* Which letters he finds hard, and dealing them more often. */

/* Where the records live. */
const KEY = 'urdu-games:mastery:v1';

/* How many answers are remembered per item. */
export const WINDOW = 10;

/* What an item he has never answered is worth. */
const NEW = 2;

/* How much the miss rate is worth on top of the base of 1. */
const MISS_PULL = 3;

/* Answers before the record is believed outright. */
const CONFIDENT_AT = 6;

/** @type {{[kind: string]: {[id: string]: string}}} */
let records = load();

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    // Anything that is not the shape this writes is treated as nothing.
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch (error) {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch (error) {
    // Private browsing.
  }
}

/** One answer.
 * @param {string} kind 'letter', 'number' or 'word'
 * @param {string} id
 * @param {boolean} correct
 */
export function record(kind, id, correct) {
  if (!kind || !id) return;
  const bucket = (records[kind] ??= {});
  bucket[id] = `${bucket[id] ?? ''}${correct ? '1' : '0'}`.slice(-WINDOW);
  save();
}

/* The last few outcomes for an item, oldest first. */
export function historyOf(kind, id) {
  const seen = records[kind]?.[id];
  return typeof seen === 'string' ? seen : '';
}

/* How badly an item is wanted, from 1 (always right) to 4 (always wrong). */
export function weightFrom(history) {
  const seen = history.length;
  if (!seen) return NEW;

  let wrong = 0;
  for (const mark of history) if (mark === '0') wrong++;

  // Where the record would put it if the record were believed, and how far it is believed.
  const settled = 1 + MISS_PULL * (wrong / seen);
  const confidence = Math.min(seen, CONFIDENT_AT) / CONFIDENT_AT;
  return NEW + (settled - NEW) * confidence;
}

/** @see weightFrom */
export function weightOf(kind, id) {
  return weightFrom(historyOf(kind, id));
}

/** How an item is doing, for a person reading the Settings page.
 * @returns {'new'|'solid'|'getting-there'|'missing'}
 */
export function bandOf(kind, id) {
  const history = historyOf(kind, id);
  if (!history.length) return 'new';
  let wrong = 0;
  for (const mark of history) if (mark === '0') wrong++;
  if (!wrong) return 'solid';
  return wrong / history.length <= 0.34 ? 'getting-there' : 'missing';
}

/* Fisher-Yates. */
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** One of anything, drawn with probability proportional to its weight.
 * @param {T[]} items
 * @param {(item: T) => number} weigh
 * @returns {T|null}
 * @template T
 */
export function chooseWeighted(items, weigh) {
  if (!items.length) return null;
  const weights = items.map(weigh);
  let roll = Math.random() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  // Floating point landed past the end.
  return items[items.length - 1];
}

/* One id, drawn with probability proportional to its weight. */
function draw(kind, ids) {
  return chooseWeighted(ids, (id) => weightOf(kind, id));
}

/** One item, weighted.
 * @param {string} kind
 * @param {string[]} ids what the game may deal, already filtered by Settings
 * @param {{avoid?: string[]}} [options]
 */
export function pickWeighted(kind, ids, { avoid = [] } = {}) {
  const pool = avoid.length ? ids.filter((id) => !avoid.includes(id)) : ids;
  return draw(kind, pool.length ? pool : ids);
}

/* `count` distinct items, weighted, in no particular order. */
export function pickSomeWeighted(kind, ids, count) {
  const left = [...ids];
  const picked = [];
  while (picked.length < count && left.length) {
    const chosen = draw(kind, left);
    picked.push(chosen);
    left.splice(left.indexOf(chosen), 1);
  }
  return shuffle(picked);
}

/* Forget everything. */
export function reset() {
  records = {};
  save();
}
