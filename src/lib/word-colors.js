/* Supplied palette, kept in source-letter order. */

export const WORD_COLORS = Object.freeze([
  '#FF0000',
  '#FFFF00',
  '#00EAFF',
  '#AA00FF',
  '#FF7F00',
  '#0095FF',
  '#FF00AA',
  '#FFD400',
  '#0040FF',
  '#EDB9B9',
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
