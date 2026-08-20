import { letterGlyph } from './content.js';

/**
 * Which games exist, and which of them the menu shows first.
 *
 * Data, in its own file, because three places read it: the menu, the panel of
 * extra games behind it, and the verifier that checks every one of them starts
 * a scene that exists. It was inline in Home.js until the menu split in two.
 */

/** Games ready to play. Unfinished games are simply absent rather than greyed
 *  out: a tile that does nothing when tapped is worse than no tile. */
export const GAMES = [
  {
    scene: 'Flashcards',
    ui: 'letters',
    roman: 'Letters',
    color: 0x3f7fd4,
    featured: true,
    // Tiles are illustrated with a real Urdu letter rather than an emoji. The
    // obvious pick, 🔤, is a picture of the Latin alphabet.
    icon: { letter: 'be', form: 'isolated' },
  },
  {
    scene: 'Trace',
    ui: 'trace',
    roman: 'Write',
    color: 0xd4762f,
    featured: true,
    icon: { letter: 'alif', form: 'isolated' },
  },
  {
    scene: 'FindLetter',
    ui: 'find-letter',
    roman: 'Find the letter',
    color: 0x5f9e5a,
    featured: true,
    icon: { letter: 'sin', form: 'isolated' },
  },
  {
    scene: 'WordPictures',
    ui: 'words',
    roman: 'Words',
    color: 0x7a5bbd,
    featured: true,
    icon: { letter: 'alif', form: 'isolated' },
  },
  {
    scene: 'StartsWith',
    ui: 'first-letter',
    roman: 'Starts with',
    color: 0xc9713f,
    featured: true,
    icon: { letter: 'pe', form: 'isolated' },
  },
  {
    scene: 'Numbers',
    ui: 'numbers',
    roman: 'Numbers',
    color: 0x2f8f8a,
    featured: true,
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
    featured: true,
    icon: { letter: 'jim', form: 'isolated' },
  },
  {
    scene: 'JoinForms',
    ui: 'forms',
    roman: 'Shapes',
    color: 0x8a6ad0,
    featured: true,
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
  // --- Spelling. Behind their own tile rather than out here with the rest: a
  // child arrives at these after the alphabet, and mixing them into a menu of
  // twenty-four letter games would bury them.
  {
    scene: 'FillLetter',
    ui: 'missing',
    roman: 'Missing letter',
    color: 0x2f8f8a,
    group: 'spelling',
    icon: { letter: 'kaf', form: 'isolated' },
  },
  {
    scene: 'BuildWord',
    ui: 'spell',
    roman: 'Build the word',
    color: 0x3f7fd4,
    group: 'spelling',
    icon: { letter: 'be', form: 'isolated' },
  },
  {
    scene: 'JoinWord',
    ui: 'joined',
    roman: 'Joined up',
    color: 0x8a6ad0,
    group: 'spelling',
    icon: { letter: 'jim', form: 'isolated' },
  },
];

/**
 * What a game's drawing is filed under in tile-faces.js.
 *
 * The scene key, except for the tile that opens the panel of extra games —
 * that one starts no scene, so it carries an explicit `art` instead.
 */
export function artName(game) {
  return game.art ?? game.scene;
}

export const FEATURED = GAMES.filter((game) => game.featured);

/**
 * Spelling: its own group behind its own tile.
 *
 * The first games in this app that are about *words* rather than letters, and
 * they want to be found together. See src/lib/spelling.js for what makes
 * spelling a different job in Urdu than it is in English.
 */
export const SPELLING = GAMES.filter((game) => game.group === 'spelling');

/** Everything not on the front page and not in a group of its own. */
export const MORE = GAMES.filter((game) => !game.featured && !game.group);

/**
 * The ninth tile: the one that opens the spelling games.
 *
 * Shaped like a game so the grid stays one grid. It costs a place on the front
 * page and Balloons is the one that gave it up — the most arcade and the least
 * teaching of the nine that were there, and it has only moved one tap away.
 */
export const SPELLING_TILE = {
  art: 'Spelling',
  ui: 'spelling',
  roman: `Spelling (${SPELLING.length})`,
  color: 0xc9713f,
  icon: { letter: 'be', form: 'initial' },
};

/**
 * The tenth tile: the one that opens the rest.
 *
 * Shaped exactly like a game so the grid stays one grid — same size, same three
 * lines, same Urdu name over a roman gloss. It is only told apart by its colour
 * and by the pile of letters on it, which is the honest thing to draw for
 * "there are more of these".
 */
export const MORE_TILE = {
  art: 'More',
  ui: 'more-games',
  roman: `More games (${MORE.length})`,
  color: 0x6a6f8c,
  icon: { letter: 'kaf', form: 'initial' },
};


/**
 * Every letter a tile asks for, resolved.
 *
 * A tile whose `icon.letter` is not a real id draws its name with a hole above
 * it and says nothing — `sad` and `he` sat there for weeks before a screenshot
 * caught them (the ids are `suad` and `choti-he`). The menu shouts about it at
 * runtime; this is the same question asked from a test.
 */
export function missingIcons() {
  // The More tile too: it is not a game, and it is still a tile with a letter
  // on it when its picture is missing.
  return [...GAMES, SPELLING_TILE, MORE_TILE]
    .filter((game) => game.icon && !letterGlyph(game.icon.letter, game.icon.form))
    .map((game) => `${game.ui}: ${game.icon.letter} ${game.icon.form}`);
}
