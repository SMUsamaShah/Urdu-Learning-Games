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
  return null;
}

export function wordGlyph(wordId) {
  return glyphs?.words[wordId] ?? null;
}

/** A baked Urdu UI string (menu labels, headings). See content/ui.json. */
export function uiGlyph(stringId) {
  return glyphs?.ui[stringId] ?? null;
}

/** The word taught alongside a letter, or null where none is suitable. */
export function wordForLetter(letterId) {
  const letter = lettersById.get(letterId);
  return letter?.word ? (wordsById.get(letter.word) ?? null) : null;
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
  return ordering.sequence ?? ordering.groups.flatMap((g) => g.letters);
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
  return letters
    .filter((l) => l.shapeFamily === letter.shapeFamily && l.id !== letterId)
    .map((l) => l.id);
}
