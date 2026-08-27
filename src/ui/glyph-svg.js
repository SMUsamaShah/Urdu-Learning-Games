/* A baked outline as inline SVG. */

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
