/**
 * What the app says when a child gets something right.
 *
 * The app had one word of praise — شاباش, on the ribbon, every single time —
 * and one word repeated twenty times a session stops being praise and becomes
 * a noise the screen makes. A person watching a three-year-old play does not
 * say the same thing twenty times; they say شاباش, then کمال, then واہ, and
 * the variety is most of what makes it feel like somebody is watching.
 *
 * ## Ids are ui.json ids
 *
 * Each of these is a string in `content/ui.json`, which is what gets it baked
 * into an outline, because praise is **shown as well as said**: the ribbon
 * carries the same phrase the voice is speaking. That is deliberate. A child
 * who cannot read still learns that the shape on the ribbon and the sound
 * arriving together are the same thing, which is the whole trick the app is
 * built on.
 *
 * The Urdu is repeated here so the recorder can print what to say without
 * loading the baked sheet; `tests/praise.test.mjs` asserts the two copies
 * agree, and fails if somebody edits one of them.
 *
 * ## Nothing here is required
 *
 * Like every other clip: if nobody has recorded کمال, nothing is said and the
 * ribbon still shows it. See src/lib/audio.js.
 */

/**
 * @typedef {object} Praise
 * @property {string} id      a string id in content/ui.json
 * @property {string} urdu    the phrase, for the recorder's prompt
 * @property {string} roman
 * @property {string} english what the ribbon's gloss says, for the parent
 */

/** @type {Praise[]} */
export const PRAISE = [
  // شاباش first because it is the one the app already used, so a device that
  // only ever records one clip records the one it had.
  { id: 'well-done', urdu: 'شاباش', roman: 'shabash', english: 'Well done!' },
  { id: 'bohat-achay', urdu: 'بہت اچھے', roman: 'bohat achay', english: 'Very good!' },
  { id: 'kamal', urdu: 'کمال', roman: 'kamal', english: 'Wonderful!' },
  { id: 'zabardast', urdu: 'زبردست', roman: 'zabardast', english: 'Brilliant!' },
  { id: 'wah', urdu: 'واہ', roman: 'wah', english: 'Wow!' },
  { id: 'shandaar', urdu: 'شاندار', roman: 'shandaar', english: 'Splendid!' },
  { id: 'bilkul-theek', urdu: 'بالکل ٹھیک', roman: 'bilkul theek', english: 'Exactly right!' },
  { id: 'aafreen', urdu: 'آفرین', roman: 'aafreen', english: 'Bravo!' },
];

/** The last one used, so the same phrase never lands twice running. */
let previous = null;

/**
 * One of them, not the one before.
 *
 * Not `Math.random()` alone: with eight phrases, a plain random pick repeats
 * back to back about one time in eight, and a repeat is exactly the thing this
 * list exists to avoid — it reads as the app having got stuck rather than as
 * chance.
 *
 * @returns {Praise}
 */
export function randomPraise() {
  const pool = PRAISE.length > 1 ? PRAISE.filter((one) => one.id !== previous) : PRAISE;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  previous = chosen.id;
  return chosen;
}
