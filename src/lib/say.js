/**
 * What the app says out loud, as opposed to how it plays a file.
 *
 * `audio.js` knows about buffers and contexts. This knows that a letter is said
 * by giving its name and then the word it teaches — "bay ... bakri" — which is
 * what every app of this kind does and what a parent does when they point at a
 * letter. Speaking the name alone is a label; speaking the word after it is the
 * bit that makes the letter mean something.
 *
 * Every function here is safe to call when nothing has been recorded yet. A
 * missing clip is silence, and the games are all playable in silence.
 */

import { clipKeys, hasClip, playSequence } from './audio.js';
import { wordForLetter } from './content.js';

/** Gap between the name and the word. Long enough to hear as two things. */
const GAP_MS = 380;

/**
 * Says a letter's name and then its word.
 *
 * @param {string} letterId
 * @param {{word?: boolean, sound?: boolean}} [options] word:false for the games
 *   where naming the example word would give the answer away; sound:true adds
 *   the phoneme between the two, for the screens where a child is dwelling on
 *   one letter rather than choosing between several.
 * @returns {Promise<void>}
 */
export function sayLetter(letterId, options = {}) {
  const { word = true, sound = false } = options;
  const keys = [clipKeys.letterName(letterId)];
  if (sound) keys.push(clipKeys.letterSound(letterId));

  const example = word ? wordForLetter(letterId) : null;
  if (example) keys.push(clipKeys.word(example.id));

  return playSequence(keys.filter(hasClip), GAP_MS);
}

/**
 * Says several letters' names in a row.
 *
 * For teaching order rather than shape: hearing "alif, bay, pay" as a run is
 * the thing that makes the sequence a sequence rather than a list of pictures.
 */
export function sayLetters(letterIds) {
  return playSequence(
    letterIds.map((id) => clipKeys.letterName(id)).filter(hasClip),
    GAP_MS
  );
}

export function sayWord(wordId) {
  return playSequence([clipKeys.word(wordId)].filter(hasClip), GAP_MS);
}

export function sayNumber(numberId) {
  return playSequence([clipKeys.number(numberId)].filter(hasClip), GAP_MS);
}
