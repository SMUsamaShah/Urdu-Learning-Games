/* What the app says out loud, as opposed to how it plays a file. */

import { clipKeys, hasClip, playSequence } from './audio.js';
import { wordForLetter } from './content.js';

/* Gap between the name and the word. */
const GAP_MS = 380;

/** Says a letter's name and then its word.
 * @param {string} letterId
 * @param {{word?: boolean, sound?: boolean}} [options] word:false for the games
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

/* Says several letters' names in a row. */
export function sayLetters(letterIds) {
  return playSequence(
    letterIds.map((id) => clipKeys.letterName(id)).filter(hasClip),
    GAP_MS
  );
}

export function sayWord(wordId) {
  return playSequence([clipKeys.word(wordId)].filter(hasClip), GAP_MS);
}

/* Says one phrase of praise. */
export function sayPraise(praiseId) {
  return playSequence([clipKeys.praise(praiseId)].filter(hasClip), GAP_MS);
}

export function sayNumber(numberId) {
  return playSequence([clipKeys.number(numberId)].filter(hasClip), GAP_MS);
}
