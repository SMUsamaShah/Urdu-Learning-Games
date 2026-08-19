/**
 * A baked outline as inline SVG.
 *
 * The grown-ups screens are HTML rather than canvas, so they cannot use
 * `src/lib/glyph.js` — but they still have to show the same shapes the games
 * show, or a parent picking ب out of a list is picking it out of a list that
 * might disagree with the app. One `<path>` from the same `content/glyphs.json`
 * the games draw from settles that.
 *
 * Shared because two screens need it: the recorder, which shows what it is
 * recording, and the content pages in Settings, which show what is being
 * switched off.
 */

/**
 * @param {{d: string, bbox: number[]}|null} glyph
 * @param {string} [color]
 * @returns {string} an `<svg>` element, or '' where there is nothing to draw
 */
export function glyphSvg(glyph, color = '#2b3047') {
  if (!glyph?.d) return '';
  const [x, y, w, h] = glyph.bbox;
  const pad = Math.max(w, h) * 0.06;
  return `<svg viewBox="${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}"
    xmlns="http://www.w3.org/2000/svg"><path d="${glyph.d}" fill="${color}"/></svg>`;
}
