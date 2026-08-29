/* A high-contrast warm/cool sequence for adjacent source letters. */

export const WORD_COLORS = Object.freeze([
  '#005a9c',
  '#c45100',
  '#007a55',
  '#d81b60',
  '#806000',
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
