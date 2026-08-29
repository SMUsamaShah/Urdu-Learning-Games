/* Set both hue and lightness so adjacent letters differ in colour and brightness. */

export const WORD_COLORS = Object.freeze([
  'hsl(210, 100%, 22%)',
  'hsl(32, 100%, 35%)',
  'hsl(0, 0%, 16%)',
  'hsl(158, 100%, 25%)',
  'hsl(335, 90%, 36%)',
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
