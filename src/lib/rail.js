import { onProgress, state } from './progress.js';
import { indicatorModule } from './indicators/index.js';
import { DESIGN, RAIL } from './theme.js';

/* The strip down the left of every game screen, which belongs to progress. */

/* Where the indicator's box starts, leaving the home button its corner. */
const TOP = 132;
/* A little air at the bottom, so nothing sits flush on the edge. */
const FOOT = 18;

const PANEL_TEX = 'rail:panel';
const SUPERSAMPLE = 2;

/* The panel, baked once for the whole app. */
function panelTexture(scene) {
  if (scene.textures.exists(PANEL_TEX)) return PANEL_TEX;

  const width = RAIL.width + 18; // room for the shadow past the edge
  const height = DESIGN.height;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * SUPERSAMPLE);
  canvas.height = Math.ceil(height * SUPERSAMPLE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SUPERSAMPLE, SUPERSAMPLE);

  // The shadow first, so the panel is drawn over its own edge and the gradient only shows to the right of it.
  const shade = ctx.createLinearGradient(RAIL.width, 0, RAIL.width + 18, 0);
  shade.addColorStop(0, 'rgba(43,48,71,0.20)');
  shade.addColorStop(1, 'rgba(43,48,71,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(RAIL.width, 0, 18, height);

  // A rounded right edge.
  ctx.fillStyle = '#f6ecd8';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(RAIL.width - 26, 0);
  ctx.quadraticCurveTo(RAIL.width, 0, RAIL.width, 26);
  ctx.lineTo(RAIL.width, height - 26);
  ctx.quadraticCurveTo(RAIL.width, height, RAIL.width - 26, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  // A hairline down the inside of that edge.
  ctx.strokeStyle = 'rgba(43,48,71,0.10)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(RAIL.width - 1, 26);
  ctx.lineTo(RAIL.width - 1, height - 26);
  ctx.stroke();

  const texture = scene.textures.createCanvas(PANEL_TEX, canvas.width, canvas.height);
  if (!texture) return PANEL_TEX;
  texture.context.drawImage(canvas, 0, 0);
  texture.refresh();
  return PANEL_TEX;
}

/** Puts the rail on a screen and keeps what stands in it in step with the total.
 * @param {Phaser.Scene} scene
 * @param {{depth?: number, indicator?: string}} [options]
 * @returns {Phaser.GameObjects.Container}
 */
export function addRail(scene, options = {}) {
  const { depth = 3 } = options;

  const root = mount(scene, {
    depth,
    indicator: options.indicator,
    x: RAIL.width / 2,
    y: DESIGN.height - FOOT,
    width: RAIL.width,
    height: DESIGN.height - TOP - FOOT,
  });

  // Behind the indicator, which is the only thing that had to be added first.
  const panel = scene.add
    .image(0, 0, panelTexture(scene))
    .setOrigin(0, 0)
    .setDisplaySize(RAIL.width + 18, DESIGN.height);
  root.addAt(panel, 0);

  return root;
}

/* Builds the indicator, wires it to the total, and hands back the container. */
function mount(scene, { depth = 3, indicator: chosen, x, y, width, height }) {
  const root = scene.add.container(0, 0).setDepth(depth).setName('progress-rail');

  const indicator = indicatorModule(chosen).create(scene, { width, height });
  // Bottom centre of its box, because everything that goes in here grows up.
  indicator.setPosition(x, y);
  root.add(indicator);
  root.indicator = indicator;

  let shown = state();
  // Drawn where the total already is, without the animation: opening a screen is not the moment a plant grew.
  indicator.apply({ ...shown, reset: true }, shown);

  /* Read by tools/verify-rail.mjs. */
  const republish = () => {
    root.total = shown.total;
    root.levels = shown.level;
    root.drawn = indicator.drawn;
  };
  republish();

  /* Where a star thrown from an answer should land. */
  root.flyTo = {
    x: indicator.x + (indicator.focus?.x ?? 0),
    y: indicator.y + (indicator.focus?.y ?? 0),
  };

  root.catch = () => indicator.land?.();
  root.cheer = () => indicator.cheer?.();
  root.wonder = () => indicator.wonder?.();

  const stop = onProgress((next) => {
    const previous = shown;
    shown = next;
    indicator.apply(next, previous);
    republish();
  });
  scene.events.once('shutdown', stop);
  scene.events.once('destroy', stop);

  return root;
}
