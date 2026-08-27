import { sparkleBurst, starShower } from '../particles.js';
import * as sfx from '../sfx.js';
import { levelColour, levelTint, makeCanvas, publish, SUPERSAMPLE } from './canvas.js';

/* A tube that fills from the bottom, one pour per right answer. */

const TUBE = { width: 96, radius: 46, inset: 8 };

function trackTexture(scene, height) {
  const key = `bar:track:${Math.round(height)}`;
  if (scene.textures.exists(key)) return key;

  const { canvas, ctx } = makeCanvas(TUBE.width + 16, height + 16, (TUBE.width + 16) / 2, 8);

  // A soft drop under the tube, so it sits on the panel rather than in it.
  ctx.fillStyle = 'rgba(43,48,71,0.10)';
  ctx.beginPath();
  ctx.roundRect(-TUBE.width / 2, 4, TUBE.width, height, TUBE.radius);
  ctx.fill();

  ctx.fillStyle = '#e6d9be';
  ctx.beginPath();
  ctx.roundRect(-TUBE.width / 2, 0, TUBE.width, height, TUBE.radius);
  ctx.fill();

  ctx.fillStyle = '#d8c8a6';
  ctx.beginPath();
  ctx.roundRect(-TUBE.width / 2 + TUBE.inset, TUBE.inset, TUBE.width - TUBE.inset * 2, height - TUBE.inset * 2, TUBE.radius - TUBE.inset);
  ctx.fill();

  return publish(scene, key, canvas);
}

/* The column of liquid, at the tube's inner shape. */
function fillTexture(scene, height) {
  const key = `bar:fill:${Math.round(height)}`;
  if (scene.textures.exists(key)) return key;
  const width = TUBE.width - TUBE.inset * 2;
  const column = height - TUBE.inset * 2;
  const { canvas, ctx } = makeCanvas(width, column, width / 2, 0);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(-width / 2, 0, width, column, TUBE.radius - TUBE.inset);
  ctx.fill();
  return publish(scene, key, canvas);
}

/* The glassy highlight, over the fill. */
function shineTexture(scene, height) {
  const key = `bar:shine:${Math.round(height)}`;
  if (scene.textures.exists(key)) return key;
  const { canvas, ctx } = makeCanvas(TUBE.width, height, TUBE.width / 2, 0);
  const grad = ctx.createLinearGradient(-TUBE.width / 2, 0, TUBE.width / 2, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.34)');
  grad.addColorStop(0.36, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(43,48,71,0.10)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(-TUBE.width / 2, 0, TUBE.width, height, TUBE.radius);
  ctx.fill();
  return publish(scene, key, canvas);
}

export function create(scene, { width, height }) {
  const root = scene.add.container(0, 0);

  root.add(
    scene.add
      .image(0, 0, trackTexture(scene, height))
      .setOrigin(0.5, 1)
      .setScale(1 / SUPERSAMPLE)
  );

  // The whole column, drawn once at the tube's inner shape, and revealed from the bottom by cropping.
  const fillKey = fillTexture(scene, height);
  const fill = scene.add
    .image(0, -TUBE.inset, fillKey)
    .setOrigin(0.5, 1)
    .setScale(1 / SUPERSAMPLE);
  root.add(fill);
  const frame = { width: fill.frame.width, height: fill.frame.height };

  root.add(
    scene.add
      .image(0, 0, shineTexture(scene, height))
      .setOrigin(0.5, 1)
      .setScale(1 / SUPERSAMPLE)
  );

  let level = 0;
  let filled = 0;

  const draw = (fraction, forLevel) => {
    level = forLevel;
    filled = Math.max(0, Math.min(1, fraction));
    fill.setTint(levelTint(level));
    const visible = Math.round(frame.height * filled);
    fill.setCrop(0, frame.height - visible, frame.width, visible);
    fill.setVisible(visible > 0);
    root.drawn = `bar:${level}:${filled.toFixed(3)}`;
  };

  const glideTo = (fraction, forLevel, duration = 460) => {
    scene.tweens.killTweensOf(fill);
    const from = filled;
    scene.tweens.addCounter({
      from,
      to: Math.max(0, Math.min(1, fraction)),
      duration,
      ease: 'Cubic.easeOut',
      onUpdate: (t) => draw(t.getValue(), forLevel),
    });
  };

  root.focus = { x: 0, y: -height * 0.5 };

  root.apply = (next, previous) => {
    if (next.levelledUp) {
      sfx.tada();
      // All the way to the top, held, then emptied into the new colour.
      glideTo(1, previous.level, 300);
      sparkleBurst(scene, 0, -height, { count: 26, tint: [levelTint(previous.level), 0xffffff] });
      starShower(scene, { duration: 1400 });
      scene.time.delayedCall(900, () => {
        if (!scene.scene.isActive()) return;
        draw(0, next.level);
        glideTo(next.fraction, next.level);
      });
      return;
    }
    if (next.levelledDown || next.fraction < previous.fraction) {
      sfx.nudge();
      draw(previous.fraction, next.level);
      glideTo(next.fraction, next.level, 320);
      return;
    }
    if (next.reset) return void draw(next.fraction, next.level);
    sfx.water();
    glideTo(next.fraction, next.level);
  };

  root.land = () =>
    sparkleBurst(scene, 0, -filled * (height - TUBE.inset * 2) - 20, {
      count: 10,
      tint: [levelTint(level), 0xffffff],
    });

  root.cheer = () =>
    scene.tweens.add({
      targets: fill,
      scaleX: fill.scaleX * 1.1,
      duration: 130,
      yoyo: true,
      ease: 'Quad.easeOut',
    });

  root.wonder = () =>
    scene.tweens.add({
      targets: root,
      x: root.x + 5,
      duration: 70,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
    });

  return root;
}

/* Used by the preview sheet, which draws a frame without a progress event. */
export function still(scene, box, { fraction, level }) {
  const el = create(scene, box);
  el.apply({ fraction, level, reset: true }, { fraction, level });
  return el;
}

export const NAME = 'Bar';
export const COLOUR_FOR = levelColour;
