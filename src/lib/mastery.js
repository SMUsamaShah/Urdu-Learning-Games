/**
 * Which letters he finds hard, and dealing them more often.
 *
 * Every game used to deal from `activeLetters()` with uniform odds. A letter he
 * had missed six times running was exactly as likely to come up next as one he
 * had never got wrong, in a session where he answers a hundred questions. The
 * app watched all of it and remembered none of it.
 *
 * ## Not a curriculum
 *
 * Everything switched on stays in rotation and nothing is ever withheld. This
 * only changes *how often*, between about 1 and about 4. A letter he has
 * mastered still comes round regularly, which is how it stays mastered, and a
 * letter he cannot do never becomes the only thing on the screen.
 *
 * That also keeps this out of the way of the switches in Settings. Those decide
 * what may be dealt; this decides how often among them. A letter a parent has
 * switched off is never passed in here, so it cannot be weighted back into play.
 *
 * ## The record is a window, not a tally
 *
 * Ten outcomes per item, oldest first, as a string: `"1101011011"`. Not counts,
 * because a window forgets on its own. A letter he could not do a month ago and
 * can do now stops looking hard after ten answers, and there is no timestamp to
 * store, no half-life to pick and no clock to get wrong.
 *
 * There is deliberately no "he has not seen this for a fortnight" term. Every
 * item keeps a weight of at least 1, so everything is reviewed anyway, and the
 * only thing a staleness term would add is another number to tune.
 *
 * ## One formula, and the unseen letters fall out of it
 *
 * A plain `wrong / seen` says a letter answered right twice is as mastered as
 * one answered right fifty times, which is how a lucky guess retires a letter
 * he cannot do. So the miss rate is blended in as the evidence arrives, from
 * `NEW` at no answers to the full rate by `CONFIDENT_AT` of them. A letter he
 * has never met needs no special case: it is the `seen = 0` end of the same
 * line.
 *
 * ## Storage
 *
 * localStorage, on one device, never sent anywhere, like progress.js. Any
 * failure to read lands on an empty record instead of throwing, for the reason
 * given there: losing this is a disappointment, and being unable to open the
 * app is not.
 */

/** Where the records live. Versioned, so the shape can change later. */
const KEY = 'urdu-games:mastery:v1';

/**
 * How many answers are remembered per item.
 *
 * Ten is about two sittings with one letter. Short enough that getting better
 * shows up within a day or two, long enough that one unlucky tap does not
 * rewrite what the app thinks of a letter.
 */
export const WINDOW = 10;

/**
 * What an item he has never answered is worth.
 *
 * Above a mastered letter, below a struggling one. A new letter *should* come
 * up more than one he has nailed, or he would meet the alphabet in whatever
 * order chance allowed. It should not outrank a letter he is actually getting
 * wrong, because that is the thing he needs.
 */
const NEW = 2;

/**
 * How much the miss rate is worth on top of the base of 1.
 *
 * Three, so an item he gets wrong every time lands on 4 and comes up four times
 * as often as one he always gets right. Turn this down if a hard letter starts
 * feeling like nagging, and up if the weighting is too quiet to notice. It is
 * the only number in this file worth arguing about.
 */
const MISS_PULL = 3;

/** Answers before the record is believed outright. See the note above. */
const CONFIDENT_AT = 6;

/** @type {{[kind: string]: {[id: string]: string}}} */
let records = load();

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    // Anything that is not the shape this writes is treated as nothing. A
    // half-written or hand-edited record must not be able to crash a game.
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch (error) {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch (error) {
    // Private browsing. The session still adapts, it just will not remember
    // tomorrow, which is a better answer than refusing to notice at all.
  }
}

/**
 * One answer.
 *
 * Called from `rightAnswer` and `wrongAnswer` in flourish.js rather than from
 * the scenes, so that reporting an outcome and recording it cannot come apart.
 *
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

/** The last few outcomes for an item, oldest first. '' if never answered. */
export function historyOf(kind, id) {
  const seen = records[kind]?.[id];
  return typeof seen === 'string' ? seen : '';
}

/**
 * How badly an item is wanted, from 1 (always right) to 4 (always wrong).
 *
 * Pure in its argument so it can be reasoned about and tested without a store
 * behind it.
 */
export function weightFrom(history) {
  const seen = history.length;
  if (!seen) return NEW;

  let wrong = 0;
  for (const mark of history) if (mark === '0') wrong++;

  // Where the record would put it if the record were believed, and how far it
  // is believed. Two answers move it a third of the way there; six or more move
  // it all the way.
  const settled = 1 + MISS_PULL * (wrong / seen);
  const confidence = Math.min(seen, CONFIDENT_AT) / CONFIDENT_AT;
  return NEW + (settled - NEW) * confidence;
}

/** @see weightFrom */
export function weightOf(kind, id) {
  return weightFrom(historyOf(kind, id));
}

/**
 * How an item is doing, for a person reading the Settings page.
 *
 * Read off the record rather than off the weight, because the weight is blended
 * with `NEW` and a letter answered wrong twice would come out in the same band
 * as one answered right twice. A band is a sentence about what happened; the
 * weight is a knob for the dealer.
 *
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

/** Fisher-Yates. Not Phaser's, so this module stays importable in a test. */
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * One of anything, drawn with probability proportional to its weight.
 *
 * Generic in what it is choosing between, because two screens do not choose
 * between letters at all. Caterpillar and InOrder deal a *contiguous run* of
 * the alphabet and choose where it starts, so what they weigh is a window: a
 * run is worth picking to the extent that the letters inside it are wanted.
 * Written here rather than in those scenes so there is one roulette wheel in
 * the app and not three.
 *
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
  // Floating point landed past the end. The last one is as right as any.
  return items[items.length - 1];
}

/** One id, drawn with probability proportional to its weight. */
function draw(kind, ids) {
  return chooseWeighted(ids, (id) => weightOf(kind, id));
}

/**
 * One item, weighted. Replaces `Phaser.Utils.Array.GetRandom(pool)`.
 *
 * `avoid` carries the rule every scene already had, that a round never repeats
 * the one before it. If avoiding would leave nothing, the rule is dropped
 * rather than returning null — which is the `pool.length ? pool : this.pool`
 * the scenes were each writing for themselves.
 *
 * @param {string} kind
 * @param {string[]} ids what the game may deal, already filtered by Settings
 * @param {{avoid?: string[]}} [options]
 */
export function pickWeighted(kind, ids, { avoid = [] } = {}) {
  const pool = avoid.length ? ids.filter((id) => !avoid.includes(id)) : ids;
  return draw(kind, pool.length ? pool : ids);
}

/**
 * `count` distinct items, weighted, in no particular order.
 *
 * Replaces `Phaser.Utils.Array.Shuffle([...pool]).slice(0, count)`, and returns
 * shuffled for the same reason that did: drawn in order, the letter he is worst
 * at would land in the same seat on the board every time, and a child would
 * learn the seat instead of the letter.
 */
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

/**
 * Forget everything.
 *
 * Offered next to the progress reset in Settings, and for the same reason: a
 * second child eventually uses the same tablet, and the first child's record of
 * which letters are hard is worse than no record at all for them.
 */
export function reset() {
  records = {};
  save();
}
