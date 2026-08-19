import Phaser from 'phaser';
import { sparkleBurst, starShower } from '../particles.js';
import * as sfx from '../sfx.js';
import { levelTint, makeCanvas, publish, SUPERSAMPLE } from './canvas.js';

/**
 * A glass that fills with juice, a swallow at a time.
 *
 * The same information as the bar and much more of a thing: a glass has a top
 * to reach, filling one is an everyday event a three-year-old already
 * understands, and finishing a level drinks it and pours a different colour.
 *
 * The juice is the glass's own inside, drawn once and revealed from the bottom
 * by cropping, which is what lets the glass taper without the fill having to
 * know that it does. A crop is in texture space, so it stays right however the
 * container is placed or scaled — a geometry mask is in world coordinates and
 * does neither. The glass itself is two baked pieces: the hollow behind the
 * juice, and the wall and shine in front of it.
 */

/** The tumbler, measured up from its base. Slightly tapered, like a real one. */
const GLASS = { topWidth: 132, baseWidth: 104, wall: 9 };

function glassPath(ctx, height, inset) {
  const halfTop = GLASS.topWidth / 2 - inset;
  const halfBase = GLASS.baseWidth / 2 - inset;
  ctx.beginPath();
  ctx.moveTo(-halfTop, -height + inset);
  ctx.lineTo(halfTop, -height + inset);
  ctx.lineTo(halfBase, -inset);
  ctx.quadraticCurveTo(0, -inset + 12, -halfBase, -inset);
  ctx.closePath();
}

/** The inside of the glass, filled. Cropped from the bottom to pour it. */
function juiceTexture(scene, height) {
  const key = `glass:juice:${Math.round(height)}`;
  if (scene.textures.exists(key)) return key;
  const inside = height - GLASS.wall * 2;
  const { canvas, ctx } = makeCanvas(GLASS.topWidth, inside, GLASS.topWidth / 2, inside);
  const halfTop = GLASS.topWidth / 2 - GLASS.wall;
  const halfBase = GLASS.baseWidth / 2 - GLASS.wall;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-halfTop, -inside);
  ctx.lineTo(halfTop, -inside);
  ctx.lineTo(halfBase, 0);
  ctx.lineTo(-halfBase, 0);
  ctx.closePath();
  ctx.fill();
  return publish(scene, key, canvas);
}

function backTexture(scene, height) {
  const key = `glass:back:${Math.round(height)}`;
  if (scene.textures.exists(key)) return key;
  const { canvas, ctx } = makeCanvas(GLASS.topWidth + 24, height + 24, (GLASS.topWidth + 24) / 2, height + 12);
  ctx.fillStyle = 'rgba(43,48,71,0.10)';
  glassPath(ctx, height, -3);
  ctx.fill();
  ctx.fillStyle = '#eef4f8';
  glassPath(ctx, height, 0);
  ctx.fill();
  return publish(scene, key, canvas);
}

function frontTexture(scene, height) {
  const key = `glass:front:${Math.round(height)}`;
  if (scene.textures.exists(key)) return key;
  const { canvas, ctx } = makeCanvas(GLASS.topWidth + 24, height + 24, (GLASS.topWidth + 24) / 2, height + 12);

  // The wall, drawn as the outline minus the inside.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  glassPath(ctx, height, 0);
  ctx.fill('evenodd');
  ctx.globalCompositeOperation = 'destination-out';
  glassPath(ctx, height, GLASS.wall);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // A rim, and one long highlight down the left, which is what makes it glass
  // rather than a bucket.
  ctx.strokeStyle = 'rgba(43,48,71,0.20)';
  ctx.lineWidth = 3;
  glassPath(ctx, height, 1);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.roundRect(-GLASS.baseWidth / 2 + 16, -height + 26, 12, height - 62, 6);
  ctx.fill();

  return publish(scene, key, canvas);
}

export function create(scene, { width, height }) {
  const root = scene.add.container(0, 0);
  // Leaves room above the rim for the level-up burst.
  const tall = Math.min(height - 40, 330);

  root.add(
    scene.add
      .image(0, 0, backTexture(scene, tall))
      .setOrigin(0.5, 1)
      .setScale(1 / SUPERSAMPLE)
  );

  const juice = scene.add
    .image(0, -GLASS.wall, juiceTexture(scene, tall))
    .setOrigin(0.5, 1)
    .setScale(1 / SUPERSAMPLE);
  root.add(juice);
  const frame = { width: juice.frame.width, height: juice.frame.height };

  // The wall and its shine go over the juice, so the fill looks like it is
  // inside the glass rather than painted on the front of it.
  root.add(
    scene.add
      .image(0, 0, frontTexture(scene, tall))
      .setOrigin(0.5, 1)
      .setScale(1 / SUPERSAMPLE)
  );

  const bubbles = [];
  for (let i = 0; i < 5; i++) {
    const bubble = scene.add.circle(0, 0, Phaser.Math.Between(3, 6), 0xffffff, 0.5);
    bubble.setVisible(false);
    root.add(bubble);
    bubbles.push(bubble);
  }

  let level = 0;
  let filled = 0;
  const inside = tall - GLASS.wall * 2;

  const draw = (fraction, forLevel) => {
    level = forLevel;
    filled = Math.max(0, Math.min(1, fraction));
    juice.setTint(levelTint(level));
    const visible = Math.round(frame.height * filled);
    juice.setCrop(0, frame.height - visible, frame.width, visible);
    juice.setVisible(visible > 0);
    root.drawn = `glass:${level}:${filled.toFixed(3)}`;
  };

  const glideTo = (fraction, forLevel, duration = 460) => {
    scene.tweens.killTweensOf(juice);
    const from = filled;
    scene.tweens.addCounter({
      from,
      to: Math.max(0, Math.min(1, fraction)),
      duration,
      ease: 'Cubic.easeOut',
      onUpdate: (t) => draw(t.getValue(), forLevel),
    });
  };

  /** A few bubbles rising through whatever is in there. */
  const fizz = () => {
    const surface = -GLASS.wall - filled * inside;
    bubbles.forEach((bubble, i) => {
      const x = Phaser.Math.Between(-30, 30);
      bubble.setPosition(x, -GLASS.wall - 6).setVisible(true).setAlpha(0.6);
      scene.tweens.add({
        targets: bubble,
        y: surface + 6,
        alpha: 0,
        delay: i * 70,
        duration: 520,
        ease: 'Sine.easeOut',
        onComplete: () => bubble.setVisible(false),
      });
    });
  };

  root.focus = { x: 0, y: -tall * 0.5 };

  root.apply = (next, previous) => {
    if (next.levelledUp) {
      sfx.tada();
      glideTo(1, previous.level, 280);
      sparkleBurst(scene, 0, -tall, {
        count: 26,
        tint: [levelTint(previous.level), 0xffffff],
      });
      starShower(scene, { duration: 1400 });
      // Drunk, then poured again in a different colour.
      scene.time.delayedCall(950, () => {
        if (!scene.scene.isActive()) return;
        glideTo(0, previous.level, 420);
      });
      scene.time.delayedCall(1420, () => {
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
    fizz();
  };

  root.land = () =>
    sparkleBurst(scene, 0, -GLASS.wall - filled * inside, {
      count: 10,
      tint: [levelTint(level), 0xffffff],
    });

  root.cheer = () => fizz();

  root.wonder = () =>
    scene.tweens.add({
      targets: root,
      angle: { from: -4, to: 4 },
      duration: 90,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => root.setAngle(0),
    });

  return root;
}

export function still(scene, box, { fraction, level }) {
  const el = create(scene, box);
  el.apply({ fraction, level, reset: true }, { fraction, level });
  return el;
}

export const NAME = 'Glass of juice';
