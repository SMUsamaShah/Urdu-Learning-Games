/* The home composition, measured afresh for the current landscape canvas. */
export const STUDIO = {
  cream: '#fff9eb', blue: '#0861cd', orange: '#ff861f',
  creamNumber: 0xfff9eb, blueNumber: 0x0861cd,
  pastels: ['#fff0ac', '#c8eafa', '#fbd5df', '#d0f2d6', '#e4d9fb', '#fbd5df'],
};

export function studioLayout(width, height = 720) {
  const leftWidth = width * 0.35;
  const boardLeft = leftWidth + 12;
  const boardRight = width - 28;
  const gap = 18;
  const tileWidth = Math.min(330, (boardRight - boardLeft - gap * 2) / 3);
  const tileHeight = 246;
  const gridWidth = tileWidth * 3 + gap * 2;
  const gridLeft = (boardLeft + boardRight - gridWidth) / 2;
  return {
    width, height, leftX: leftWidth / 2,
    title: { x: leftWidth / 2, y: 144, width: leftWidth - 32, height: 145 },
    character: { x: leftWidth / 2, y: 482, height: 282, width: leftWidth - 28 },
    chalo: { x: leftWidth / 2, y: 554, width: Math.min(370, leftWidth - 54), height: 112 },
    grid: { left: gridLeft, right: gridLeft + gridWidth, top: 112, bottom: 622,
      centerX: (boardLeft + boardRight) / 2, gap, rowGap: 18, tileWidth, tileHeight },
    dotsY: 668,
    music: { x: width - 132, y: 49 },
    fullscreen: { x: width - 52, y: 49 },
    settings: { x: 54, y: height - 51 },
  };
}

/* Even an incomplete last page keeps the same six positions and reading order. */
export function studioPlaces(layout) {
  const g = layout.grid;
  return Array.from({ length: 6 }, (_, i) => ({
    x: g.right - g.tileWidth / 2 - (i % 3) * (g.tileWidth + g.gap),
    y: g.top + g.tileHeight / 2 + Math.floor(i / 3) * (g.tileHeight + g.rowGap),
  }));
}
