import { numberGlyph } from './content.js';
import { addGlyph, fitEmAlone } from './glyph.js';
import { onProgress, state, tierFor } from './progress.js';
import { ringBurst, sparkleBurst, starShower } from './particles.js';
import { hop, squash } from './liveliness.js';
import * as sfx from './sfx.js';
import { COLORS } from './theme.js';

/**
 * The ring that fills up, in the corner of every screen.
 *
 * ## Why a ring and not a bar
 *
 * A bar has to be long to read as nearly-full, and there is no long empty strip
 * on any of these screens — the top edge carries a home button, an instruction
 * ribbon and a mascot. A ring says the same thing in a square, sits in the one
 * corner that is free on every screen, and has a middle to put something in.
 *
 * What goes in the middle is the level, written as an Urdu numeral. That is the
 * part worth the trouble: it is the one number a child sees constantly, it is
 * always the number they have most reason to care about, and the app happens to
 * be teaching exactly those ten shapes two screens away. A ۳ that means "I got
 * to three" teaches ۳ better than any flashcard.
 *
 * ## Why it never goes down
 *
 * The row of stars this replaced was a streak, and reset on a wrong answer. A
 * three-year-old getting one wrong and watching four stars vanish learns that
 * the safe move is to stop. Nothing here is ever taken away; a wrong answer
 * simply is not an award. See progress.js.
 *
 * ## Drawing
 *
 * The arc is a Graphics redrawn as it fills, which is the one case where that
 * is the right tool — the shape genuinely changes every frame of the animation
 * and there is exactly one of them on screen. Everything static around it is
 * drawn once into the same object.
 */

const RADIUS = 46;
const THICKNESS = 13;
/** How far out the orbiting stars sit. */
const ORBIT = RADIUS + 16;
const RING_SUPERSAMPLE = 2;

/** The white disc and the empty track, baked once for the whole app. */
function ringPlateTexture(scene) {
  const key = 'progress-ring-plate';
  if (scene.textures.exists(key)) return key;

  const size = (RADIUS + THICKNESS / 2 + 4) * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.ceil(size * RING_SUPERSAMPLE);
  const ctx = canvas.getContext('2d');
  ctx.scale(RING_SUPERSAMPLE, RING_SUPERSAMPLE);
  ctx.translate(size / 2, size / 2);

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.beginPath();
  ctx.arc(0, 0, RADIUS + THICKNESS / 2 + 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(138,122,99,0.18)';
  ctx.lineWidth = THICKNESS;
  ctx.beginPath();
  ctx.arc(0, 0, RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  const texture = scene.textures.createCanvas(key, canvas.width, canvas.height);
  texture.context.drawImage(canvas, 0, 0);
  texture.refresh();
  return key;
}

/**
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @returns {Phaser.GameObjects.Container} with `.flyTo` — where a flying star
 *   should land — and cleanup wired to the scene's shutdown
 */
export function addProgressRing(scene, x, y) {
  const ring = scene.add.container(x, y).setDepth(40).setName('progress-ring');
  ring.flyTo = { x, y };

  // The disc behind everything and the empty track never change, so they are
  // baked into one texture and shared by every screen's ring — a Graphics
  // re-tessellates every frame whether or not it moved. Only the arc is left
  // as one, because that genuinely does change while it fills.
  ring.add(scene.add.image(0, 0, ringPlateTexture(scene)).setScale(1 / RING_SUPERSAMPLE));
  const arc = scene.add.graphics();
  ring.add(arc);

  const stars = scene.add.container(0, 0);
  ring.add(stars);

  const crown = scene.add
    .text(0, -RADIUS - 16, '👑', { fontSize: '28px' })
    .setOrigin(0.5)
    .setVisible(false);
  ring.add(crown);

  /** The level, in Urdu numerals. Two digits is as far as this needs to go. */
  const digits = scene.add.container(0, 0);
  ring.add(digits);

  let shown = state();
  /** Animated separately from the model, so the arc can catch up smoothly. */
  let drawn = shown.fraction;

  const drawArc = () => {
    // Published so a verifier can see the arc actually move. Reading the
    // model instead would pass on a ring that draws nothing at all.
    ring.drawn = drawn;
    ring.level = shown.level;
    arc.clear();
    if (drawn <= 0) return;
    arc.lineStyle(THICKNESS, tierFor(shown.level).color, 1);
    // From the top, clockwise. Phaser's arc takes radians and measures from
    // three o'clock, hence the quarter turn.
    arc.beginPath();
    arc.arc(
      0,
      0,
      RADIUS,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * Math.min(drawn, 1),
      false
    );
    arc.strokePath();
  };

  const drawDigits = () => {
    digits.removeAll(true);
    const text = String(shown.level + 1);
    const glyphs = [...text].map((d) => numberGlyph(`n${d}`)).filter(Boolean);
    if (!glyphs.length) return;
    // Fitted across all ten numerals rather than to whichever is on screen, so
    // ۱ and ۵ come out the same size and the ring does not appear to breathe
    // as the level changes.
    const all = [...Array(10)].map((unused, i) => numberGlyph(`n${i}`)).filter(Boolean);
    const box = text.length > 1 ? 30 : 46;
    const { em } = fitEmAlone(all, box, 46);
    glyphs.forEach((glyph, index) => {
      // Right to left, like every other number in the app.
      const offset = ((glyphs.length - 1) / 2 - index) * box;
      digits.add(
        addGlyph(scene, offset, 2, `ring:em${Math.round(em)}:${text[index]}`, glyph, {
          em,
          color: COLORS.ink,
        })
      );
    });
  };

  const drawStars = () => {
    stars.removeAll(true);
    const tier = tierFor(shown.level);
    crown.setVisible(tier.crown);
    for (let i = 0; i < tier.stars; i++) {
      // Spread around the lower arc, clear of the crown at the top.
      const angle = Math.PI / 2 + ((i - (tier.stars - 1) / 2) * Math.PI) / 4;
      const star = scene.add
        .text(Math.cos(angle) * ORBIT, Math.sin(angle) * ORBIT, '★', {
          fontSize: '20px',
          color: COLORS.accentCss,
        })
        .setOrigin(0.5);
      stars.add(star);
    }
  };

  const redrawAll = () => {
    drawArc();
    drawDigits();
    drawStars();
  };

  redrawAll();

  /**
   * The ceremony.
   *
   * Deliberately long — a second and a half — and deliberately not the same as
   * a right answer's flourish. This is the thing the whole ring exists to build
   * up to, and if it feels like just another correct answer then filling the
   * ring meant nothing.
   */
  const levelUp = () => {
    sfx.tada();
    ringBurst(scene, ring.x, ring.y, tierFor(shown.level).color);
    sparkleBurst(scene, ring.x, ring.y, {
      count: 34,
      tint: [tierFor(shown.level).color, 0xffffff, 0xffc93c],
    });
    starShower(scene, { duration: 1600 });
    // The arc runs all the way round, holds full for a beat, then empties into
    // the new tier's colour. Emptying instantly would look like it was taken
    // away rather than banked.
    drawn = 1;
    drawArc();
    scene.tweens.add({
      targets: ring,
      scale: 1.24,
      duration: 260,
      yoyo: true,
      ease: 'Back.easeOut',
      onYoyo: () => {
        redrawAll();
        hop(scene, digits, { height: 12 });
      },
    });
    scene.time.delayedCall(620, () => {
      drawn = 0;
      scene.tweens.addCounter({
        from: 0,
        to: shown.fraction,
        duration: 520,
        ease: 'Cubic.easeOut',
        onUpdate: (tween) => {
          drawn = tween.getValue();
          drawArc();
        },
      });
    });
  };

  const apply = (next) => {
    const wasLevel = shown.level;
    shown = next;
    if (next.levelledUp) {
      levelUp();
      return;
    }
    if (next.reset || next.level !== wasLevel) {
      drawn = next.fraction;
      redrawAll();
      return;
    }
    // Delayed and slow enough to still be moving when the flying star lands.
    // Several games throw a star from the answer to here, and it takes 720ms to
    // arrive; a fill that finished at 420ms was over before the star it was
    // supposed to be caused by got there. On the screens that throw no star the
    // delay reads as the answer's own burst getting the first beat.
    scene.tweens.addCounter({
      from: drawn,
      to: next.fraction,
      delay: 260,
      duration: 520,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => {
        drawn = tween.getValue();
        drawArc();
      },
    });
  };

  /** Something thrown at the ring has landed. */
  ring.catch = () => {
    squash(scene, ring, { scale: 1.12 });
    sparkleBurst(scene, ring.x, ring.y, {
      count: 10,
      tint: [tierFor(shown.level).color, 0xffffff],
    });
  };

  const stop = onProgress(apply);
  scene.events.once('shutdown', stop);
  scene.events.once('destroy', stop);

  return ring;
}
