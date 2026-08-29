/* Paul Tol's vibrant, colour-blind-safe qualitative hues, expressed as HSL. */

export const WORD_COLORS = Object.freeze([
  'hsl(173, 100%, 30%)',
  'hsl(202, 100%, 37%)',
  'hsl(22, 85%, 57%)',
  'hsl(338, 85%, 51%)',
  'hsl(11, 85%, 38%)',
]);

/* A thin edge keeps the brighter fills readable on the white word plate. */
export const WORD_OUTLINE = Object.freeze({
  stroke: '#2b3047',
  strokeWidth: 1.5,
});

export function wordColor(index) {
  return WORD_COLORS[index % WORD_COLORS.length];
}

/** Returns one paint instruction for each shaped source-letter cluster. */
export function coloredWordParts(glyph) {
  return (glyph?.clusters ?? [])
    .filter((cluster) => cluster.d)
    .map((cluster, index) => ({ d: cluster.d, color: wordColor(index) }));
}
