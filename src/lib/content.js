/**
 * Loads and indexes everything under content/.
 *
 * The JSON files are the contribution surface of this project: adding a letter,
 * a word or a new ordering should never require touching game code. Everything
 * here is lookup helpers over that data, with no content of its own.
 */

import letterData from '../../content/letters.json';
import numberData from '../../content/numbers.json';
import wordData from '../../content/words.json';
import orderingData from '../../content/orderings.json';
import { isEnabled, numberBand, BANDS } from './enabled.js';

// Glyph outlines are fetched rather than imported so the bundler emits them as
// a separate cacheable asset instead of inlining ~220 KB into the main bundle.
const GLYPHS_URL = new URL('../../content/glyphs.json', import.meta.url).href;

export const letters = letterData.letters;
export const numbers = numberData.numbers;
export const words = wordData.words;
export const orderings = orderingData.orderings;

export const lettersById = new Map(letters.map((l) => [l.id, l]));
export const numbersById = new Map(numbers.map((n) => [n.id, n]));
export const wordsById = new Map(words.map((w) => [w.id, w]));

/** Which letter a character belongs to. See brokenWord(). */
const lettersByChar = new Map(letters.map((l) => [l.char, l]));

/** @type {{upem:number, letters:object, numbers:object, words:object}|null} */
let glyphs = null;

/** Fetches the baked outlines. Called once, from the Preload scene. */
export async function loadGlyphs() {
  if (glyphs) return glyphs;
  const response = await fetch(GLYPHS_URL);
  if (!response.ok) {
    throw new Error(
      `Could not load glyphs.json (${response.status}). Run \`npm run bake\`.`
    );
  }
  glyphs = await response.json();
  return glyphs;
}

/**
 * @param {string} letterId
 * @param {'isolated'|'initial'|'medial'|'final'} [form='isolated']
 * @returns {import('./glyph.js').Glyph|null} null when the letter has no such
 *   form, which is normal: non-joiners have no initial or medial, and hamza has
 *   only an isolated form. Callers must handle null rather than assume four.
 */
export function letterGlyph(letterId, form = 'isolated') {
  return glyphs?.letters[letterId]?.[form] ?? null;
}

/** The positional forms a letter actually has, in teaching order. */
export function letterForms(letterId) {
  return Object.keys(glyphs?.letters[letterId] ?? {});
}

export function numberGlyph(numberId) {
  return glyphs?.numbers[numberId] ?? null;
}

/**
 * Every letter glyph, for measuring a set before drawing any of it.
 *
 * Sizing letters by the em means the size is decided by the most demanding
 * letter in whatever set will appear in that space, not by the one currently on
 * screen — see fitEmLine() and fitEmAlone() in glyph.js. So the caller needs
 * the whole set, and the whole set is what a game draws over its lifetime rather
 * than what it draws in this round.
 *
 * @param {'isolated'|'initial'|'medial'|'final'} [form] one form, or every form
 *   of every letter when omitted.
 */
export function allLetterGlyphs(form) {
  const all = Object.values(glyphs?.letters ?? {});
  if (form) return all.map((forms) => forms[form]).filter(Boolean);
  return all.flatMap((forms) => Object.values(forms));
}

/**
 * Every number glyph *that is currently in play*. See allLetterGlyphs.
 *
 * The one place a filtered set is used for sizing rather than the full one, and
 * deliberately. Letters are all about the same width, so sizing them against
 * the full alphabet costs nothing and keeps a letter the same size whatever
 * else is switched on. Numbers are not: the set runs to ۱۰۰۰۰۰, and sizing a
 * screen showing ۰ to ۹ against a six-digit number would draw every digit at a
 * fifth of the size it should be. The band is a different curriculum rather
 * than a filter over one, so it decides the sizing too.
 */
export function allNumberGlyphs() {
  return activeNumbers()
    .map((number) => glyphs?.numbers[number.id])
    .filter(Boolean);
}

/** Every word glyph. See allLetterGlyphs. */
export function allWordGlyphs() {
  return Object.values(glyphs?.words ?? {});
}

/** The named UI strings, as glyphs. See allLetterGlyphs. */
export function uiGlyphs(stringIds) {
  return stringIds.map((id) => glyphs?.ui[id]).filter(Boolean);
}

/** A letter's name written out ("بے"), as opposed to the letter itself ("ب"). */
export function nameGlyph(letterId) {
  return glyphs?.names[letterId] ?? null;
}

/**
 * Resolves the `glyph` descriptor on a clip from src/lib/clip-list.js.
 * Kept here so the recorder draws prompts from the same outlines the game uses,
 * and what you read while recording is exactly what the child will see.
 */
export function glyphForClip({ kind, id, form }) {
  if (kind === 'letter') return glyphs?.letters[id]?.[form] ?? null;
  if (kind === 'name') return nameGlyph(id);
  if (kind === 'word') return wordGlyph(id);
  if (kind === 'number') return numberGlyph(id);
  // Praise phrases are ui strings: they are shown on the ribbon as well as
  // spoken, so they are baked the way every other piece of on-screen Urdu is.
  if (kind === 'ui') return uiGlyph(id);
  return null;
}

/**
 * The outline of the taught letter *inside* its word, when the face leaves it
 * separable, and null when it does not.
 *
 * AlQalam Taj fuses joined letters into single glyphs: پتنگ is one outline for
 * all four letters, and there is no honest way to colour the ت in it. The bake
 * records which source characters each glyph covers (see clustersOf() in
 * tools/bake-glyphs.mjs), so this asks for a cluster that is *exactly* the
 * taught letter and gives back nothing otherwise. Nine of the app's
 * thirty-seven words have one.
 *
 * Deliberately all-or-nothing. A cluster that covers the taught letter and its
 * neighbour would colour two letters and say the second one was the first,
 * which is worse than saying nothing.
 *
 * @returns {string|null} an SVG path, in the same coordinates as the word
 */
export function taughtCluster(wordId) {
  const word = wordsById.get(wordId);
  const glyph = glyphs?.words[wordId];
  if (!word || !glyph?.clusters) return null;
  const at = word.letterIndex;
  const exact = glyph.clusters.find((c) => c.from === at && c.to === at + 1);
  return exact?.d || null;
}

/**
 * A word taken apart into the letters it is written with.
 *
 * بکری is ب ک ر ی — four letters that the typeface then joins and reshapes
 * until none of them looks like the letter on its own flashcard. That is the
 * hardest thing about learning to read Urdu and the app was showing only the
 * joined-up result, so a child who knows ب had no way to see it in the word.
 *
 * Returns letter ids in writing order, so the first letter is the one drawn
 * furthest right.
 *
 * **All or nothing.** چائے is written with ئ — hamza sitting on a ی — which is
 * not one of the thirty-eight letters and has no glyph of its own. Rather than
 * drop that character and show a word with a letter missing, the whole word
 * gives back null and the screen simply does not offer the row, the same way
 * taughtCluster() declines a word it cannot colour honestly.
 *
 * @returns {string[]|null}
 */
export function brokenWord(wordId) {
  const word = wordsById.get(wordId);
  if (!word) return null;
  const ids = [];
  for (const char of word.word) {
    const letter = lettersByChar.get(char);
    if (!letter) return null;
    ids.push(letter.id);
  }
  return ids;
}

export function wordGlyph(wordId) {
  return glyphs?.words[wordId] ?? null;
}

/**
 * The font's units per em.
 *
 * Baked path coordinates are in these units, so anything that wants to size
 * something relative to the *letterforms* rather than to the box they were
 * scaled into has to work in them. See the outline in src/lib/glyph.js.
 */
export function glyphUpem() {
  return glyphs?.upem ?? 1000;
}

/**
 * The whole baked sheet, for the two things that want it entire rather than a
 * glyph at a time: the stroke editor, which draws any letter's outline straight
 * into an SVG, and anything comparing what was baked against what it was baked
 * from. Everything else should ask for the one glyph it needs.
 */
export function glyphSheet() {
  return glyphs;
}

/**
 * Which typeface these outlines were baked from, as `{file, sha}`.
 *
 * Read from the fetched file rather than imported, because importing
 * glyphs.json to reach one field puts all 500 KB of it in the bundle as well as
 * on the network. Anything derived from a glyph belongs to the font that drew
 * it, and the tracing paths are the case where getting that wrong is visible to
 * a child — see src/lib/strokes.js.
 */
export function glyphFont() {
  return glyphs?.font ?? null;
}

/** A baked Urdu UI string (menu labels, headings). See content/ui.json. */
export function uiGlyph(stringId) {
  return glyphs?.ui[stringId] ?? null;
}

/**
 * The fewest of a kind a game can be dealt before the switches are ignored.
 *
 * A parent who turns off all but one letter has not asked for a matching game
 * with one card in it; they have asked for something the app cannot give. It
 * falls back to everything rather than dealing an impossible round, because a
 * game that cannot be finished looks like a broken app and a game that ignores
 * a setting looks like a setting that did not save — and the second is the
 * easier of the two to work out.
 */
const ENOUGH = 3;

/** `chosen` unless there is not enough of it to play with. */
const orAll = (chosen, all) => (chosen.length >= ENOUGH ? chosen : all);

/**
 * The letters currently in play.
 *
 * Everything that *deals* a letter goes through this rather than through the
 * raw `letters` export. The raw export stays for Settings, the recorder and the
 * tracing editor, which all need the complete list whatever is being taught
 * this week — a letter you have switched off is still a letter you might want
 * to record or draw a stroke path for.
 */
export function activeLetters() {
  return orAll(
    letters.filter((letter) => isEnabled('letter', letter.id)),
    letters
  );
}

/** The words currently in play. See activeLetters. */
export function activeWords() {
  return orAll(
    words.filter((word) => isEnabled('word', word.id)),
    words
  );
}

/**
 * The numbers currently in play: what the Settings band allows, less anything
 * switched off individually.
 *
 * The two filters are here together rather than in two places, because "what
 * may this game deal" has to have one answer.
 */
export function activeNumbers() {
  const band = numberBand();
  // A thousand and a lakh ride along with the widest band rather than sitting
  // above it. They are not the next numbers after a hundred — nothing between
  // 101 and 999 exists here — they are the two round numbers Urdu actually
  // counts big things in, and a band that says "up to 100" and then hides them
  // would be hiding them for ever.
  const cap = band === BANDS[BANDS.length - 1] ? Infinity : band;
  const banded = numbers.filter((number) => number.value <= cap);
  return orAll(
    banded.filter((number) => isEnabled('number', number.id)),
    banded
  );
}

/**
 * The ids in play, as sets, for filtering a list that came from somewhere else.
 *
 * `illustratedWords()` in images.js knows which words have a picture and
 * nothing about which are being taught this week; the games that start from
 * that list intersect it with this rather than each writing the same filter.
 */
export const inPlay = {
  letters: () => new Set(activeLetters().map((letter) => letter.id)),
  words: () => new Set(activeWords().map((word) => word.id)),
  numbers: () => new Set(activeNumbers().map((number) => number.id)),
};

/**
 * The word taught alongside a letter, or null where none is suitable.
 *
 * Null also when the word itself is switched off, which is why this is not a
 * two-line lookup any more: a game that pairs a letter with its picture has to
 * hear "there is no word for this one" rather than be handed a word the parent
 * has taken out.
 */
export function wordForLetter(letterId) {
  const letter = lettersById.get(letterId);
  if (!letter?.word) return null;
  const word = wordsById.get(letter.word) ?? null;
  if (!word) return null;
  return activeWords().some((active) => active.id === word.id) ? word : null;
}

/**
 * Flattens an ordering into a plain list of letter ids.
 * Both orderings are views over the same letters, so games can switch between
 * them without knowing which is which.
 *
 * @param {'alphabetical'|'shape-families'} name
 * @returns {string[]}
 */
export function sequenceFor(name) {
  const ordering = orderings[name];
  if (!ordering) throw new Error(`Unknown ordering: ${name}`);
  const full = ordering.sequence ?? ordering.groups.flatMap((g) => g.letters);
  // Filtered here rather than by every caller, because this is the one that
  // matters most: the games that ask a child to put letters in order build
  // their run out of a *slice* of this, and a switched-off letter left in
  // would be dealt as part of a sequence nobody chose to teach.
  const inPlay = new Set(activeLetters().map((letter) => letter.id));
  const chosen = full.filter((id) => inPlay.has(id));
  return orAll(chosen, full);
}

/**
 * Letters sharing a skeleton with the given one, excluding it.
 *
 * This is what makes listen-and-tap hard in a useful way: distractors drawn
 * from the same family differ only in their dots, which is exactly the
 * distinction Urdu learners get wrong.
 *
 * @param {string} letterId
 * @returns {string[]}
 */
export function shapeFamilySiblings(letterId) {
  const letter = lettersById.get(letterId);
  if (!letter) return [];
  // Not `orAll`: an empty family is a normal answer here — plenty of letters
  // have no sibling at all — and callers already deal with getting none. What
  // must not happen is a switched-off letter arriving as a wrong answer, which
  // is exactly where a distractor would hide.
  const inPlay = new Set(activeLetters().map((l) => l.id));
  return letters
    .filter((l) => l.shapeFamily === letter.shapeFamily && l.id !== letterId)
    .filter((l) => inPlay.has(l.id))
    .map((l) => l.id);
}
