/* Loads and indexes everything under content/. */

import letterData from '../../content/letters.json';
import numberData from '../../content/numbers.json';
import wordData from '../../content/words.json';
import orderingData from '../../content/orderings.json';
import { isEnabled, numberBand, BANDS } from './enabled.js';

// Fetch glyph outlines separately to keep them out of the main bundle.
const GLYPHS_URL = new URL('../../content/glyphs.json', import.meta.url).href;

export const letters = letterData.letters;
export const numbers = numberData.numbers;
export const words = wordData.words;
export const orderings = orderingData.orderings;

export const lettersById = new Map(letters.map((l) => [l.id, l]));
export const numbersById = new Map(numbers.map((n) => [n.id, n]));
export const wordsById = new Map(words.map((w) => [w.id, w]));

/* Which letter a character belongs to. */
const lettersByChar = new Map(letters.map((l) => [l.char, l]));

/** @type {{upem:number, letters:object, numbers:object, words:object}|null} */
let glyphs = null;

/* Fetches the baked outlines. */
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

/** Returns the requested positional form, falling back to isolated when needed.
 * @param {string} letterId
 * @param {'isolated'|'initial'|'medial'|'final'} [form='isolated']
 * @returns {import('./glyph.js').Glyph|null}
 */
export function letterGlyph(letterId, form = 'isolated') {
  return glyphs?.letters[letterId]?.[form] ?? null;
}

/* The positional forms a letter actually has, in teaching order. */
export function letterForms(letterId) {
  return Object.keys(glyphs?.letters[letterId] ?? {});
}

export function numberGlyph(numberId) {
  return glyphs?.numbers[numberId] ?? null;
}

/** Every letter glyph, for measuring a set before drawing any of it.
 * @param {'isolated'|'initial'|'medial'|'final'} [form] one form, or every form
 */
export function allLetterGlyphs(form) {
  const all = Object.values(glyphs?.letters ?? {});
  if (form) return all.map((forms) => forms[form]).filter(Boolean);
  return all.flatMap((forms) => Object.values(forms));
}

/* Every number glyph *that is currently in play*. */
export function allNumberGlyphs() {
  return activeNumbers()
    .map((number) => glyphs?.numbers[number.id])
    .filter(Boolean);
}

/* Every word glyph. */
export function allWordGlyphs() {
  return Object.values(glyphs?.words ?? {});
}

/* The named UI strings, as glyphs. */
export function uiGlyphs(stringIds) {
  return stringIds.map((id) => glyphs?.ui[id]).filter(Boolean);
}

/* A letter's name written out ("بے"), as opposed to the letter itself ("ب"). */
export function nameGlyph(letterId) {
  return glyphs?.names[letterId] ?? null;
}

/* Resolves the `glyph` descriptor on a clip from src/lib/clip-list.js. */
export function glyphForClip({ kind, id, form }) {
  if (kind === 'letter') return glyphs?.letters[id]?.[form] ?? null;
  if (kind === 'name') return nameGlyph(id);
  if (kind === 'word') return wordGlyph(id);
  if (kind === 'number') return numberGlyph(id);
  // Praise phrases are ui strings.
  if (kind === 'ui') return uiGlyph(id);
  return null;
}

/** The outline of the taught letter *inside* its word, when the face leaves it separable, and null when it does not.
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

/** Splits a word into its source letters.
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

/* The font's units per em. */
export function glyphUpem() {
  return glyphs?.upem ?? 1000;
}

/* The whole baked sheet. */
export function glyphSheet() {
  return glyphs;
}

/* Which typeface these outlines were baked from, as `{file, sha}`. */
export function glyphFont() {
  return glyphs?.font ?? null;
}

/* A baked Urdu UI string (menu labels, headings). */
export function uiGlyph(stringId) {
  return glyphs?.ui[stringId] ?? null;
}

/* The fewest of a kind a game can be dealt before the switches are ignored. */
const ENOUGH = 3;

/* `chosen` unless there is not enough of it to play with. */
const orAll = (chosen, all) => (chosen.length >= ENOUGH ? chosen : all);

/* The letters currently in play. */
export function activeLetters() {
  return orAll(
    letters.filter((letter) => isEnabled('letter', letter.id)),
    letters
  );
}

/* The words currently in play. */
export function activeWords() {
  return orAll(
    words.filter((word) => isEnabled('word', word.id)),
    words
  );
}

/* The numbers currently in play: what the Settings band allows, less anything switched off individually. */
export function activeNumbers() {
  const band = numberBand();
  // A thousand and a lakh ride along with the widest band rather than sitting above it.
  const cap = band === BANDS[BANDS.length - 1] ? Infinity : band;
  const banded = numbers.filter((number) => number.value <= cap);
  return orAll(
    banded.filter((number) => isEnabled('number', number.id)),
    banded
  );
}

/* The ids in play, as sets, for filtering a list that came from somewhere else. */
export const inPlay = {
  letters: () => new Set(activeLetters().map((letter) => letter.id)),
  words: () => new Set(activeWords().map((word) => word.id)),
  numbers: () => new Set(activeNumbers().map((number) => number.id)),
};

/* The word taught alongside a letter, or null where none is suitable. */
export function wordForLetter(letterId) {
  const letter = lettersById.get(letterId);
  if (!letter?.word) return null;
  const word = wordsById.get(letter.word) ?? null;
  if (!word) return null;
  return activeWords().some((active) => active.id === word.id) ? word : null;
}

/** Flattens an ordering into a plain list of letter ids.
 * @param {'alphabetical'|'shape-families'} name
 * @returns {string[]}
 */
export function sequenceFor(name) {
  const ordering = orderings[name];
  if (!ordering) throw new Error(`Unknown ordering: ${name}`);
  const full = ordering.sequence ?? ordering.groups.flatMap((g) => g.letters);
  // Filtered here rather than by every caller.
  const inPlay = new Set(activeLetters().map((letter) => letter.id));
  const chosen = full.filter((id) => inPlay.has(id));
  return orAll(chosen, full);
}

/** Letters sharing a skeleton with the given one, excluding it.
 * @param {string} letterId
 * @returns {string[]}
 */
export function shapeFamilySiblings(letterId) {
  const letter = lettersById.get(letterId);
  if (!letter) return [];
  // Shape families may be empty, so do not fall back to all letters.
  const inPlay = new Set(activeLetters().map((l) => l.id));
  return letters
    .filter((l) => l.shapeFamily === letter.shapeFamily && l.id !== letterId)
    .filter((l) => inPlay.has(l.id))
    .map((l) => l.id);
}
