import { letterGlyph } from './content.js';

/**
 * Which games exist. Nothing about where they go.
 *
 * Plain data, and *only* data. There used to be three castes in here — eight
 * `featured` on the front page, three in a `spelling` group behind their own
 * tile, and everything else behind a "more games" tile — and the distinction
 * was invisible to a child and had stopped meaning much to anybody. It is one
 * flat list now, and which games appear and in what order is a preference:
 * src/lib/menu.js owns the order, src/lib/enabled.js owns the on and off.
 *
 * The order below is still the order a fresh device gets, so it is worth
 * keeping as a sensible learning path rather than shuffling it about.
 */

/** Games ready to play. Unfinished games are simply absent rather than greyed
 *  out: a tile that does nothing when tapped is worse than no tile. */
export const GAMES = [
  {
    scene: 'Flashcards',
    ui: 'letters',
    roman: 'Letters',
    color: 0x3f7fd4,
    // Tiles are illustrated with a real Urdu letter rather than an emoji. The
    // obvious pick, 🔤, is a picture of the Latin alphabet.
    icon: { letter: 'be', form: 'isolated' },
  },
  {
    scene: 'Trace',
    ui: 'trace',
    roman: 'Write',
    color: 0xd4762f,
    icon: { letter: 'alif', form: 'isolated' },
  },
  {
    scene: 'FindLetter',
    ui: 'find-letter',
    roman: 'Find the letter',
    color: 0x5f9e5a,
    icon: { letter: 'sin', form: 'isolated' },
  },
  {
    scene: 'WordPictures',
    ui: 'words',
    roman: 'Words',
    color: 0x7a5bbd,
    icon: { letter: 'alif', form: 'isolated' },
  },
  {
    scene: 'StartsWith',
    ui: 'first-letter',
    roman: 'Starts with',
    color: 0xc9713f,
    icon: { letter: 'pe', form: 'isolated' },
  },
  {
    scene: 'Numbers',
    ui: 'numbers',
    roman: 'Numbers',
    color: 0x2f8f8a,
    number: 'n3',
  },
  {
    scene: 'Balloons',
    ui: 'balloons',
    roman: 'Balloons',
    color: 0xb4576d,
    icon: { letter: 'mim', form: 'isolated' },
  },
  {
    scene: 'Memory',
    ui: 'memory',
    roman: 'Pairs',
    color: 0xc2557f,
    icon: { letter: 'jim', form: 'isolated' },
  },
  {
    scene: 'JoinForms',
    ui: 'forms',
    roman: 'Shapes',
    color: 0x8a6ad0,
    // The initial form, because the tile is advertising the thing the game is
    // about: a letter wearing a face the flashcards never showed.
    icon: { letter: 'be', form: 'initial' },
  },
  {
    scene: 'Sequence',
    ui: 'order',
    roman: 'Order',
    color: 0x4f8f3f,
    icon: { letter: 'te', form: 'isolated' },
  },
  {
    scene: 'Doors',
    ui: 'doors',
    roman: 'Doors',
    color: 0x3f8f7a,
    icon: { letter: 'dal', form: 'isolated' },
  },
  {
    scene: 'TapAll',
    ui: 'find-all',
    roman: 'Find them all',
    color: 0xb05fa8,
    icon: { letter: 'sin', form: 'initial' },
  },
  {
    scene: 'Caterpillar',
    ui: 'gaps',
    roman: 'Gaps',
    color: 0x5b8f2f,
    icon: { letter: 'nun', form: 'isolated' },
  },
  {
    scene: 'LetterPuzzle',
    ui: 'puzzle',
    roman: 'Puzzle',
    color: 0xc25f3f,
    icon: { letter: 'suad', form: 'isolated' },
  },
  {
    scene: 'Fishing',
    ui: 'fishing',
    roman: 'Fishing',
    color: 0x2f7fa8,
    icon: { letter: 'mim', form: 'initial' },
  },
  {
    scene: 'Baskets',
    ui: 'baskets',
    roman: 'Sorting',
    color: 0x7d6a3f,
    icon: { letter: 'te', form: 'initial' },
  },
  {
    scene: 'Whack',
    ui: 'whack',
    roman: 'Quick tap',
    color: 0x6a5f8f,
    icon: { letter: 'kaf', form: 'isolated' },
  },
  {
    scene: 'OddOne',
    ui: 'different',
    roman: 'Odd one out',
    color: 0x9f4f6a,
    icon: { letter: 'choti-he', form: 'isolated' },
  },
  {
    scene: 'InOrder',
    ui: 'bubbles',
    roman: 'In order',
    color: 0x2f9e8a,
    icon: { letter: 'alif', form: 'isolated' },
  },
  {
    scene: 'Paint',
    ui: 'colours',
    roman: 'Colouring',
    color: 0xd45f95,
    icon: { letter: 'ain', form: 'isolated' },
  },
  {
    scene: 'ConnectPairs',
    ui: 'joining',
    roman: 'Join up',
    color: 0x4f7f5f,
    icon: { letter: 'wao', form: 'isolated' },
  },
  {
    scene: 'NumberLine',
    ui: 'counting',
    roman: 'Counting order',
    color: 0x2f7f9e,
    number: 'n5',
  },
  {
    scene: 'Hidden',
    ui: 'hiding',
    roman: 'Hide and seek',
    color: 0x4f7f3f,
    icon: { letter: 'khe', form: 'isolated' },
  },
  {
    scene: 'Bounce',
    ui: 'bouncing',
    roman: 'Bouncing',
    color: 0xd4913f,
    icon: { letter: 'lam', form: 'isolated' },
  },
  // --- Spelling: the first games here that are about *words* rather than
  // letters. See src/lib/spelling.js for why spelling is a different job in
  // Urdu than it is in English. They sat behind a tile of their own until the
  // menu became one ordered list; where they come is a matter for
  // Settings -> Games now, like every other game.
  {
    scene: 'FillLetter',
    ui: 'missing',
    roman: 'Missing letter',
    color: 0x2f8f8a,
    icon: { letter: 'kaf', form: 'isolated' },
  },
  {
    scene: 'BuildWord',
    ui: 'spell',
    roman: 'Build the word',
    color: 0x3f7fd4,
    icon: { letter: 'be', form: 'isolated' },
  },
  {
    scene: 'JoinWord',
    ui: 'joined',
    roman: 'Joined up',
    color: 0x8a6ad0,
    icon: { letter: 'jim', form: 'isolated' },
  },
];

/**
 * What a game's drawing is filed under in tile-faces.js.
 *
 * The scene key. `art` survives as an override because a tile's picture and its
 * scene are not the same fact, and one of them may want renaming without the
 * other.
 */
export function artName(game) {
  return game.art ?? game.scene;
}

/** A game by its scene key, or undefined. */
export const gameFor = (scene) => GAMES.find((game) => game.scene === scene);

/**
 * Every letter a tile asks for, resolved.
 *
 * A tile whose `icon.letter` is not a real id draws its name with a hole above
 * it and says nothing — `sad` and `he` sat there for weeks before a screenshot
 * caught them (the ids are `suad` and `choti-he`). The menu shouts about it at
 * runtime; this is the same question asked from a test.
 */
export function missingIcons() {
  return GAMES.filter((game) => game.icon && !letterGlyph(game.icon.letter, game.icon.form)).map(
    (game) => `${game.ui}: ${game.icon.letter} ${game.icon.form}`
  );
}
