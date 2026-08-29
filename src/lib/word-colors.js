/* The fixed palette used to map source letters onto a joined word. */

export const WORD_COLORS = Object.freeze([
  '#0057b8',
  '#b45309',
  '#7a1fa2',
  '#007f4f',
  '#c1123f',
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
