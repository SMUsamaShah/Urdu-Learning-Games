/* What the app says when a child gets something right. */

/**
 * @typedef {object} Praise
 * @property {string} id a string id in content/ui.json
 * @property {string} urdu the phrase, for the recorder's prompt
 * @property {string} roman
 * @property {string} english what the ribbon's gloss says, for the parent
 */

/** @type {Praise[]} */
export const PRAISE = [
  // شاباش first because it is the one the app already used.
  { id: 'well-done', urdu: 'شاباش', roman: 'shabash', english: 'Well done!' },
  { id: 'bohat-achay', urdu: 'بہت اچھے', roman: 'bohat achay', english: 'Very good!' },
  { id: 'kamal', urdu: 'کمال', roman: 'kamal', english: 'Wonderful!' },
  { id: 'zabardast', urdu: 'زبردست', roman: 'zabardast', english: 'Brilliant!' },
  { id: 'wah', urdu: 'واہ', roman: 'wah', english: 'Wow!' },
  { id: 'shandaar', urdu: 'شاندار', roman: 'shandaar', english: 'Splendid!' },
  { id: 'bilkul-theek', urdu: 'بالکل ٹھیک', roman: 'bilkul theek', english: 'Exactly right!' },
  { id: 'aafreen', urdu: 'آفرین', roman: 'aafreen', english: 'Bravo!' },
];

/* The last one used, so the same phrase never lands twice running. */
let previous = null;

/** Picks a phrase without repeating the previous one.
 * @returns {Praise}
 */
export function randomPraise() {
  const pool = PRAISE.length > 1 ? PRAISE.filter((one) => one.id !== previous) : PRAISE;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  previous = chosen.id;
  return chosen;
}
