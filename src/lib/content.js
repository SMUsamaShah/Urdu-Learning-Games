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
import { numberBand, BANDS } from './enabled.js';

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
  return null;
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
 * The numbers currently in play: whatever the Settings band allows.
 *
 * Everything that deals a number goes through this rather than through the raw
 * `numbers` export, so a band of ten cannot be undermined by one game reading
 * the whole file. The raw export stays for Settings and the recorder, which
 * both need the complete list whatever is being taught this week.
 */
export function activeNumbers() {
  const band = numberBand();
  // A thousand and a lakh ride along with the widest band rather than sitting
  // above it. They are not the next numbers after a hundred — nothing between
  // 101 and 999 exists here — they are the two round numbers Urdu actually
  // counts big things in, and a band that says "up to 100" and then hides them
  // would be hiding them for ever.
  const cap = band === BANDS[BANDS.length - 1] ? Infinity : band;
  return numbers.filter((number) => number.value <= cap);
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
