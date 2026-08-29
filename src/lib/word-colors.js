/* Alternate dark and light colours so adjacent letters stay distinct. */

export const WORD_COLORS = Object.freeze([
  '#003b73',
  '#b85c00',
  '#2f2f2f',
  '#006b4f',
  '#d81b60',
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
