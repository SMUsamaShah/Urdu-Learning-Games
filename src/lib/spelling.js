/* What the spelling games are allowed to ask, and how hard. */

import { activeWords, brokenWord, wordsById } from './content.js';
import { isEnabled } from './enabled.js';
import { state } from './progress.js';
import { chooseWeighted, weightOf } from './mastery.js';

/* The bands, by level. */
const BANDS = [
  { from: 0, lengths: [3], hint: true, spare: 0 },
  { from: 3, lengths: [3], hint: false, spare: 1 },
  { from: 6, lengths: [3, 4], hint: false, spare: 2 },
  { from: 10, lengths: [4, 5], hint: false, spare: 2 },
];

/* Wrong taps in one round before the hint comes back for that round only. */
export const HINT_AFTER_MISSES = 2;

/** How the next round should be dealt.
 * @param {number} [level] defaults to the player's
 * @returns {{lengths: number[], hint: boolean, spare: number}}
 */
export function spellingPlan(level = state().level) {
  let band = BANDS[0];
  for (const next of BANDS) if (level >= next.from) band = next;
  return { lengths: band.lengths, hint: band.hint, spare: band.spare };
}

/* Every word a spelling game may deal. */
export function spellableWords() {
  return activeWords().filter((word) => {
    const letters = brokenWord(word.id);
    return letters && letters.every((id) => isEnabled('letter', id));
  });
}

/* The words of a given length, falling back rather than returning nothing. */
export function wordsOfLength(lengths) {
  const all = spellableWords();
  const wanted = all.filter((word) => lengths.includes(brokenWord(word.id).length));
  if (wanted.length) return wanted;
  // Nothing at that length: try longer, then anything at all.
  const longer = all.filter((word) => brokenWord(word.id).length >= Math.min(...lengths));
  return longer.length ? longer : all;
}

/** A word to spell, avoiding the one just done.
 * @param {string|null} previous
 * @param {number} [level]
 */
export function pickWord(previous, level, weigh) {
  const pool = wordsOfLength(spellingPlan(level).lengths);
  const fresh = pool.filter((word) => word.id !== previous);
  const from = fresh.length ? fresh : pool;
  // By how much the word is wanted, not evenly.
  return chooseWeighted(from, weigh ?? ((word) => weightOf('word', word.id)));
}

/* The letters for the tray: the word's own, plus `spare` that do not belong, shuffled. */
export function trayFor(wordId, spare) {
  const needed = brokenWord(wordId) ?? [];
  const own = new Set(needed);
  const others = [];
  for (const word of spellableWords()) {
    if (word.id === wordId) continue;
    for (const id of brokenWord(word.id)) if (!own.has(id)) others.push(id);
  }
  const extras = [];
  const seen = new Set();
  while (extras.length < spare && others.length) {
    const pick = others.splice(Math.floor(Math.random() * others.length), 1)[0];
    if (seen.has(pick)) continue;
    seen.add(pick);
    extras.push(pick);
  }
  return shuffle([...needed, ...extras]);
}

/* Other words to offer beside the right one. */
export function wordDistractors(wordId, count) {
  const length = brokenWord(wordId)?.length ?? 0;
  const pool = spellableWords().filter((word) => word.id !== wordId);
  const same = shuffle(pool.filter((word) => brokenWord(word.id).length === length));
  const rest = shuffle(pool.filter((word) => brokenWord(word.id).length !== length));
  return [...same, ...rest].slice(0, count).map((word) => word.id);
}

/* The word, for anything that wants its text or its picture. */
export function wordFor(id) {
  return wordsById.get(id);
}

/* Fisher-Yates, on a copy. */
export function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
