import { onProgress, state } from './progress.js';
import { indicatorModule } from './indicators/index.js';
import { DESIGN, RAIL } from './theme.js';

/**
 * The strip down the left of every game screen, which belongs to progress.
 *
 * ## Why it is a panel and not a corner of the meadow
 *
 * The plant that came before this was drawn onto the grass, and it spent its
 * whole life competing with the grass: a green plant on a green field, behind
 * whatever the game happened to throw past it, at whatever size was left over
 * once the answers had taken what they needed. Every other idea for a progress
 * indicator — a bar, a glass filling up, somebody climbing — would have had the
 * same argument again.
 *
 * So progress gets a room of its own. Opaque, floor to ceiling, no scenery
 * showing through, and the same 200 pixels on all twenty-four screens. What
 * stands in it is a swappable module (src/lib/indicators/) that knows nothing
 * about levels and subscribes to nothing; this owns the subscription and hands
 * each change down.
 *
 * ## It carries the home button too
 *
 * ⌂ used to float over the scenery at the top left, which is inside the strip.
 * Rather than move it, the rail took it: the left edge is now the app's
 * furniture — the way out at the top, how far you have got below it — and the
 * rest of the screen is the game. That is one fewer thing drawn over the play
 * area, and it makes the panel look deliberate rather than like a crop.
 */

/** Where the indicator's box starts, leaving the home button its corner. */
const TOP = 132;
/** A little air at the bottom, so nothing sits flush on the edge. */
const FOOT = 18;

const PANEL_TEX = 'rail:panel';
const SUPERSAMPLE = 2;

/**
 * The panel, baked once for the whole app.
 *
 * A Graphics would re-tessellate this every frame for a picture that never
 * changes — the same reason the meadow is baked. See scenery.js.
 */
function panelTexture(scene) {
  if (scene.textures.exists(PANEL_TEX)) return PANEL_TEX;

  const width = RAIL.width + 18; // room for the shadow past the edge
  const height = DESIGN.height;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * SUPERSAMPLE);
  canvas.height = Math.ceil(height * SUPERSAMPLE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SUPERSAMPLE, SUPERSAMPLE);

  // The shadow first, so the panel is drawn over its own edge and the gradient
  // only shows to the right of it.
  const shade = ctx.createLinearGradient(RAIL.width, 0, RAIL.width + 18, 0);
  shade.addColorStop(0, 'rgba(43,48,71,0.20)');
  shade.addColorStop(1, 'rgba(43,48,71,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(RAIL.width, 0, 18, height);

  // A rounded right edge, square everywhere else: it is attached to three sides
  // of the screen and only the fourth is a real edge.
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

  // A hairline down the inside of that edge. Without it the panel and a pale
  // sky meet with nothing between them and the strip stops reading as a thing.
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

/**
 * Puts the rail on a screen and keeps what stands in it in step with the total.
 *
 * @param {Phaser.Scene} scene
 * @param {{depth?: number, indicator?: string}} [options] indicator names one
 *   explicitly, for the preview sheet; normally it is whichever Settings chose.
 * @returns {Phaser.GameObjects.Container} with `flyTo`, `catch`, `cheer` and
 *   `wonder`, so a scene talks to it the way it talked to the character
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

/**
 * The indicator on its own, with no panel behind it.
 *
 * For the menu, which has no rail — it is not an activity, its left edge is
 * already the character's, and a floor-to-ceiling panel there would evict him.
 * The same component, the same subscription, a smaller box.
 */
export function addIndicator(scene, options) {
  return mount(scene, options);
}

/** Builds the indicator, wires it to the total, and hands back the container. */
function mount(scene, { depth = 3, indicator: chosen, x, y, width, height }) {
  const root = scene.add.container(0, 0).setDepth(depth).setName('progress-rail');

  const indicator = indicatorModule(chosen).create(scene, { width, height });
  // Bottom centre of its box, because everything that goes in here grows up.
  indicator.setPosition(x, y);
  root.add(indicator);
  root.indicator = indicator;

  let shown = state();
  // Drawn where the total already is, without the animation: opening a screen
  // is not the moment a plant grew. `reset` is how an indicator is told to jump
  // rather than move.
  indicator.apply({ ...shown, reset: true }, shown);

  /** Read by tools/verify-rail.mjs. `drawn` is whatever the indicator publishes. */
  const republish = () => {
    root.total = shown.total;
    root.levels = shown.level;
    root.drawn = indicator.drawn;
  };
  republish();

  /** Where a star thrown from an answer should land. */
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
