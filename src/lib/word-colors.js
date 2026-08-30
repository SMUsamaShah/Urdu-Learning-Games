/* Kite-inspired hues, ordered so neighbours differ in hue and brightness. */

export const WORD_COLORS = Object.freeze([
  'hsl(202, 100%, 29%)',
  'hsl(355, 86%, 50%)',
  'hsl(98, 68%, 26%)',
  'hsl(289, 70%, 52%)',
  'hsl(38, 100%, 38%)',
]);

export function wordColor(index) {
  return WORD_COLORS[index % WORD_COLORS.length];
}

/** Returns one paint instruction for each shaped source-letter cluster. */
export function coloredWordParts(glyph) {
  return (glyph?.clusters ?? [])
    .filter((cluster) => cluster.d)
    .map((cluster, index) => ({ d: cluster.d, color: wordColor(index) }));
}
