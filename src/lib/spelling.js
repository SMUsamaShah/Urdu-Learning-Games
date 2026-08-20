/**
 * What the spelling games are allowed to ask, and how hard.
 *
 * ## Why spelling is a different job in Urdu
 *
 * An English spelling game is mostly about letters you cannot hear — the silent
 * e, the ough, the double consonant. Urdu has almost none of that: if a child
 * can say the word and knows the letters' sounds, they can very nearly spell
 * it. What Urdu has instead is **joining**. Every letter changes shape
 * according to where it sits, so بکری does not visibly contain the ب a child
 * learned from a flashcard, and finding it there is the whole difficulty.
 *
 * So these games are built around the pair: the letters a word is *made of*,
 * which the child knows, and the word as it is *written*, which they do not yet
 * recognise. `brokenWord()` in content.js gives the first, `wordGlyph()` the
 * second, and every game here is some way of putting the two together.
 *
 * ## The ramp
 *
 * Difficulty comes from the progress level, and nothing about it is a setting.
 * A three-year-old cannot ask for an easier game and a parent should not have to
 * think about it — the app already knows how they are doing.
 *
 * Three dials move: how long the word is, whether the empty slots show the
 * letter faintly, and how many letters the tray holds that do not belong. The
 * hint is the important one and it is the one the reference app makes a whole
 * separate activity out of; here it fades out on its own.
 */

import { activeWords, brokenWord, wordsById } from './content.js';
import { isEnabled } from './enabled.js';
import { state } from './progress.js';

/**
 * The bands, by level. Read as: at this level and above, until the next one.
 *
 * The short end is thin and that is a fact about the content rather than a
 * choice: only six of the thirty-seven words are three letters long, against
 * twenty of four and ten of five. Six is enough to repeat over the first few
 * levels — a three-year-old is glad to see سیب again — but it is worth knowing
 * before wondering why the early rounds look familiar.
 */
const BANDS = [
  { from: 0, lengths: [3], hint: true, spare: 0 },
  { from: 3, lengths: [3], hint: false, spare: 1 },
  { from: 6, lengths: [3, 4], hint: false, spare: 2 },
  { from: 10, lengths: [4, 5], hint: false, spare: 2 },
];

/** Wrong taps in one round before the hint comes back for that round only. */
export const HINT_AFTER_MISSES = 2;

/**
 * How the next round should be dealt.
 *
 * @param {number} [level] defaults to the player's
 * @returns {{lengths: number[], hint: boolean, spare: number}}
 */
export function spellingPlan(level = state().level) {
  let band = BANDS[0];
  for (const next of BANDS) if (level >= next.from) band = next;
  return { lengths: band.lengths, hint: band.hint, spare: band.spare };
}

/**
 * Every word a spelling game may deal.
 *
 * Three filters, and they are different questions.
 *
 * `activeWords()` is what the parent left switched on. `brokenWord()` is what
 * the script will allow: چائے is written with ئ, a hamza carried on a ی, which
 * is not one of the thirty-eight letters and has no glyph of its own — so it
 * cannot be spelled out of the letters this app teaches, and no amount of
 * wanting changes that.
 *
 * The third is the one that is easy to forget and impossible to recover from.
 * A word is only spellable if **every letter in it** is switched on: a parent
 * who has turned ک off has not asked for a round where the child must find a ک
 * that is not in the tray and cannot be put there. Switching off a letter has
 * to mean switching off the words that need it.
 */
export function spellableWords() {
  return activeWords().filter((word) => {
    const letters = brokenWord(word.id);
    return letters && letters.every((id) => isEnabled('letter', id));
  });
}

/**
 * The words of a given length, falling back rather than returning nothing.
 *
 * A parent who has switched off most of the alphabet can leave a band with no
 * words in it at all. Dealing a round nobody can play is worse than dealing an
 * easy one, so this widens until it finds something — the same rule
 * `activeLetters()` follows when the switches leave too little.
 */
export function wordsOfLength(lengths) {
  const all = spellableWords();
  const wanted = all.filter((word) => lengths.includes(brokenWord(word.id).length));
  if (wanted.length) return wanted;
  // Nothing at that length: try longer, then anything at all.
  const longer = all.filter((word) => brokenWord(word.id).length >= Math.min(...lengths));
  return longer.length ? longer : all;
}

/**
 * A word to spell, avoiding the one just done.
 *
 * @param {string|null} previous
 * @param {number} [level]
 */
export function pickWord(previous, level) {
  const pool = wordsOfLength(spellingPlan(level).lengths);
  const fresh = pool.filter((word) => word.id !== previous);
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)];
}

/**
 * The letters for the tray: the word's own, plus `spare` that do not belong,
 * shuffled.
 *
 * Spares are drawn from other words rather than from the alphabet at large.
 * A distractor pulled at random is usually a letter the child has never seen
 * next to this one and is dismissed without reading it; a letter that turns up
 * in real words of the same shape has to actually be looked at.
 */
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

/**
 * Other words to offer beside the right one.
 *
 * Same length first, because a line-up where the answer is the only four-letter
 * word is a line-up that can be won by counting.
 */
export function wordDistractors(wordId, count) {
  const length = brokenWord(wordId)?.length ?? 0;
  const pool = spellableWords().filter((word) => word.id !== wordId);
  const same = shuffle(pool.filter((word) => brokenWord(word.id).length === length));
  const rest = shuffle(pool.filter((word) => brokenWord(word.id).length !== length));
  return [...same, ...rest].slice(0, count).map((word) => word.id);
}

/** The word, for anything that wants its text or its picture. */
export function wordFor(id) {
  return wordsById.get(id);
}

/** Fisher-Yates, on a copy. */
export function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
