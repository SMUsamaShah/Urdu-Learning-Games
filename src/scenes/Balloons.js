import Phaser from 'phaser';
import {
  allLetterGlyphs,
  letterGlyph,
  lettersById,
  sequenceFor,
  shapeFamilySiblings,
} from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { clipKeys, hasClip } from '../lib/audio.js';
import * as sfx from '../lib/sfx.js';
import { milestone, rightAnswer } from '../lib/flourish.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { sayLetter } from '../lib/say.js';
import { sway } from '../lib/liveliness.js';
import { popPuff, sparkleBurst } from '../lib/particles.js';
import { COLORS, DESIGN, chunkyGlyphEm, familyColor, label, makeButton } from '../lib/theme.js';

/**
 * The same question as FindLetter, but the answers float past.
 *
 * Two things this adds over a static line-up, and the reason it is worth being
 * a separate game rather than a skin:
 *
 *   1. **A moving target.** Choosing while the choices drift is a different and
 *      harder task than choosing from a still row, and it is the difference
 *      between recognising a letter and recognising it fluently.
 *   2. **Popping is its own reward.** A three-year-old will play this for the
 *      pop long after they are bored of tapping tiles, which buys a lot of
 *      repetitions of the thing actually being taught.
 *
 * Balloons rise slowly and are replaced when they leave the top, so the screen
 * never empties and there is never a moment where the right answer is absent.
 * Popping a wrong balloon costs nothing but the balloon.
 */

/**
 * Time to cross the whole screen, by streak. Speed is held constant for a
 * balloon started part-way up, so a seeded balloon does not crawl.
 */
const CROSS_MS = [11000, 10000, 9000, 8000];
const MAX_BALLOONS = 6;
const RADIUS = 74;
/**
 * Where balloons are allowed to be. The left margin is wide because the spider
 * sits there: a balloon rising through its face is not charming, it just looks
 * like two things drawn on top of each other.
 */
const LANE = { left: 268, right: DESIGN.width - 150 };

export default class Balloons extends Phaser.Scene {
  constructor() {
    super('Balloons');
    /** @type {string[]} */
    this.sequence = [];
    this.streak = 0;
    /** @type {string|null} */
    this.target = null;
    /** @type {Phaser.GameObjects.Container[]} */
    this.balloons = [];
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
  }

  create() {
    this.sequence = sequenceFor('alphabetical').filter((id) => letterGlyph(id));
    this.streak = 0;
    this.balloons = [];
    this.locked = false;

    this.stage = addStage(this, {
      // Balloons rise the full height, so hills would only be something for
      // them to disappear behind.
      hills: false,
      instruction: 'pop-balloon',
      roman: 'Pop the balloon',
      // The spider watches the balloons go by, above them so one drifting past
      // does not cross its face.
      mascot: { depth: 12 },
    });
    this.banner = this.stage.banner;
    this.mascot = this.stage.mascot;

    // A badge holding the letter to look for, in the corner, tappable to hear
    // it again. Taken straight from the reference apps, which all put the
    // target and its replay button in the same corner on every screen — a child
    // who has lost track of the question needs one place to look, and it must
    // not be somewhere the answers drift over.
    this.promptLayer = this.add.container(212, 66).setDepth(21);

    this.newRound();
  }

  // ------------------------------------------------------------------ round

  newRound() {
    this.locked = false;
    // Through remove(), not destroy(): destroying a balloon leaves its rise
    // tween running, whose onComplete recycles a balloon that no longer exists
    // and launches a replacement. Rounds would then accumulate balloons until
    // the screen was unusable.
    for (const balloon of [...this.balloons]) this.remove(balloon);

    const pool = this.sequence.filter((id) => id !== this.target);
    this.target = Phaser.Utils.Array.GetRandom(pool);

    // Back to the question, in case the last round ended on "well done".
    this.banner?.setInstruction('pop-balloon', 'Pop the balloon');
    this.buildPrompt();
    this.updateStreak();
    this.speak();

    // Seed the screen already full, at staggered heights, rather than making a
    // child watch an empty screen while the first balloon climbs into view.
    // Recycled balloons enter from the bottom as normal.
    const others = this.distractors(this.target, MAX_BALLOONS - 1);
    const order = Phaser.Utils.Array.Shuffle([this.target, ...others]);
    const top = RADIUS + 150; // clear of the prompt band
    const bottom = DESIGN.height + RADIUS;

    // Columns rather than random x, so the opening screen never stacks two
    // balloons on top of each other — overlapping balloons are both ugly and
    // genuinely hard for a small finger to choose between.
    const columns = Phaser.Utils.Array.Shuffle(
      order.map((_, i) => {
        const span = (LANE.right - LANE.left) / (order.length - 1);
        return LANE.left + i * span;
      })
    );

    order.forEach((id, i) => {
      const t = i / (order.length - 1);
      this.launch(id, bottom - t * (bottom - top), columns[i]);
    });

    this.mascot?.point();
  }

  /**
   * An x that is not on top of a balloon already low on the screen.
   *
   * Balloons enter from the bottom, so only the ones still down there can
   * collide with a new arrival. Best of a handful of candidates is plenty and
   * avoids looping forever when the screen is busy.
   */
  pickX() {
    const low = this.balloons.filter((b) => b.y > DESIGN.height - 220);
    let best = Phaser.Math.Between(LANE.left, LANE.right);
    let bestGap = -1;
    for (let i = 0; i < 8; i++) {
      const candidate = Phaser.Math.Between(LANE.left, LANE.right);
      const gap = low.length
        ? Math.min(...low.map((b) => Math.abs(b.x - candidate)))
        : Infinity;
      if (gap > bestGap) {
        bestGap = gap;
        best = candidate;
      }
      if (gap > RADIUS * 2.2) break;
    }
    return best;
  }

  /** Same-family letters first: those differ from the target only in dots. */
  distractors(target, count) {
    const siblings = Phaser.Utils.Array.Shuffle(
      shapeFamilySiblings(target).filter((id) => letterGlyph(id))
    );
    const chosen = siblings.slice(0, count);
    if (chosen.length < count) {
      const rest = Phaser.Utils.Array.Shuffle(
        this.sequence.filter((id) => id !== target && !chosen.includes(id))
      );
      chosen.push(...rest.slice(0, count - chosen.length));
    }
    return chosen;
  }

  /**
   * The target badge: the letter to find, always shown, always tappable.
   *
   * The letter is shown whether or not there is a recording. In the tile games
   * showing it would give the answer away by making the prompt a copy of the
   * right answer; here the answers are already all on screen, and the question
   * is which one — so hiding the letter would only make it a memory test.
   */
  buildPrompt() {
    this.promptLayer.removeAll(true);
    const letter = lettersById.get(this.target);
    const spoken = hasClip(clipKeys.letterName(this.target));

    const badge = makeButton(this, {
      x: 0,
      y: 0,
      width: 132,
      height: 108,
      color: familyColor(letter.shapeFamily),
      onTap: () => this.speak(),
    });

    const glyph = letterGlyph(this.target, 'isolated');
    const fit = fitEmAlone(allLetterGlyphs('isolated'), 96, 68);
    badge.add(
      addGlyph(this, 0, -6, `balloon-badge:em${Math.round(fit.em)}:${this.target}`, glyph,
        chunkyGlyphEm(fit.em))
    );
    badge.add(
      spoken
        ? this.add.text(0, 36, '🔊', { fontSize: '24px' }).setOrigin(0.5)
        : label(this, 0, 36, 'pop this', { size: 13, color: COLORS.onColorDim })
    );

    this.promptLayer.add(badge);
  }

  speak() {
    sayLetter(this.target);
  }

  updateStreak() {
  }

  // --------------------------------------------------------------- balloons

  /**
   * Sends one balloon up the screen.
   * @param {string} letterId
   * @param {number} [startY] defaults to just below the bottom edge.
   * @param {number} [startX] defaults to a spot clear of the other balloons.
   */
  launch(letterId, startY, startX) {
    const letter = lettersById.get(letterId);
    const color = familyColor(letter.shapeFamily);
    const radius = RADIUS;
    const x = startX ?? this.pickX();

    const balloon = this.add.container(x, startY ?? DESIGN.height + radius + 40);
    balloon.letterId = letterId;

    const body = this.add.graphics();
    body.fillStyle(color, 1);
    body.fillEllipse(0, 0, radius * 2, radius * 2.3);
    // A highlight, so it reads as a balloon rather than a coloured circle.
    body.fillStyle(0xffffff, 0.3);
    body.fillEllipse(-radius * 0.32, -radius * 0.46, radius * 0.5, radius * 0.66);
    // Knot and string.
    body.fillStyle(color, 1);
    body.fillTriangle(-11, radius * 1.12, 11, radius * 1.12, 0, radius * 1.3);
    body.lineStyle(3, color, 0.55);
    body.beginPath();
    body.moveTo(0, radius * 1.3);
    body.lineTo(0, radius * 1.78);
    body.strokePath();
    balloon.add(body);

    // Every balloon carries its letter at the same size. Fitted to a height,
    // the letter was a hint: the child could sort the balloons by how big the
    // writing on them looked instead of by reading it.
    const letterFit = fitEmAlone(allLetterGlyphs('isolated'), radius * 1.7, radius * 1.5);
    balloon.add(
      addGlyph(
        this,
        0,
        -4,
        `balloon:em${Math.round(letterFit.em)}:${letterId}`,
        letterGlyph(letterId, 'isolated'),
        chunkyGlyphEm(letterFit.em)
      )
    );

    balloon.setSize(radius * 2, radius * 2.3);
    balloon.setInteractive({ useHandCursor: true });
    balloon.on('pointerdown', () => this.popBalloon(balloon));

    // Constant speed regardless of where it started, so a balloon seeded
    // half-way up does not appear to be moving at half pace.
    const cross = CROSS_MS[Math.min(this.streak, CROSS_MS.length - 1)];
    const endY = -radius * 2;
    const fullDistance = DESIGN.height + radius * 3;
    const duration = cross * ((balloon.y - endY) / fullDistance);

    balloon.rise = this.tweens.add({
      targets: balloon,
      y: endY,
      duration,
      ease: 'Linear',
      onComplete: () => this.recycle(balloon),
    });

    // A slow sway, so the screen feels alive rather than mechanical.
    this.tweens.add({
      targets: balloon,
      x: x + Phaser.Math.Between(-40, 40),
      duration: Phaser.Math.Between(2200, 3400),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // A slow tip from side to side on the way up. A balloon that rises dead
    // straight reads as a sprite on a rail; one that tips reads as something
    // with air moving past it.
    sway(this, balloon, { angle: 5, duration: Phaser.Math.Between(1700, 2600) });
    balloon.tint = color;

    this.balloons.push(balloon);
    return balloon;
  }

  /**
   * Replaces a balloon that drifted off the top.
   *
   * The target is always re-launched, so the answer can never be missing from
   * the screen — waiting for the right balloon to come back around is not a
   * game, it is a queue.
   */
  recycle(balloon) {
    const wasTarget = balloon.letterId === this.target;
    this.remove(balloon);
    if (this.locked || !this.scene.isActive()) return;

    const next = wasTarget
      ? this.target
      : Phaser.Utils.Array.GetRandom(this.distractors(this.target, 3));
    this.launch(next);
  }

  remove(balloon) {
    this.balloons = this.balloons.filter((b) => b !== balloon);
    this.tweens.killTweensOf(balloon);
    balloon.destroy();
  }

  popBalloon(balloon) {
    if (this.locked) return;
    const right = balloon.letterId === this.target;

    this.burst(balloon.x, balloon.y, right, balloon.tint);

    if (!right) {
      // Costs nothing but the balloon. No fail state, no lost turn.
      sfx.pop();
      this.streak = 0;
      this.updateStreak();
      this.mascot?.wonder();
      this.remove(balloon);
      this.time.delayedCall(120, () => {
        if (this.scene.isActive() && !this.locked) {
          this.launch(Phaser.Utils.Array.GetRandom(this.distractors(this.target, 3)));
        }
      });
      return;
    }

    this.locked = true;
    sfx.pop();
    rightAnswer();
    sfx.sparkle();
    this.streak++;
    this.updateStreak();
    this.mascot?.cheer();
    this.remove(balloon);

    // Every fifth in a row, the whole screen celebrates rather than just the
    // balloon. See QuizScene for why this is rationed.
    if (this.streak % 5 === 0) {
      milestone();
      wellDone(this, this.stage);
    }

    // Let the remaining balloons drift off rather than vanishing, then reset.
    for (const other of this.balloons) {
      this.tweens.add({ targets: other, alpha: 0, duration: 420 });
    }
    this.time.delayedCall(900, () => this.newRound());
  }

  /**
   * What a balloon leaves behind.
   *
   * A puff of its own colour either way — that is what connects the burst to
   * the thing that burst — plus sparkles when it was the right one, which is
   * the only visible difference between a correct pop and a wrong one.
   *
   * Particles rather than a Graphics per fragment. The old version drew
   * fourteen of them, each its own draw call, tweened individually, at the
   * exact moment the app is also playing a voice clip; see particles.js.
   */
  burst(x, y, right, tint) {
    popPuff(this, x, y, tint ?? COLORS.accent);
    if (right) {
      sparkleBurst(this, x, y, { count: 30, tint: [tint ?? COLORS.correct, 0xffffff, 0xffc93c] });
    }
  }
}
