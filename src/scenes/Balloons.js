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
import { milestone, rightAnswer, wrongAnswer } from '../lib/flourish.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { sayLetter } from '../lib/say.js';
import { sway } from '../lib/liveliness.js';
import { popPuff, sparkleBurst } from '../lib/particles.js';
import { COLORS, DESIGN, RAIL_EDGE, chunkyGlyphEm, familyColor, label, makeButton } from '../lib/theme.js';
import { pickWeighted } from '../lib/mastery.js';

/* The same question as FindLetter, but the answers float past. */

/* Time to cross the whole screen, by streak. */
const CROSS_MS = [11000, 10000, 9000, 8000];
const MAX_BALLOONS = 6;
const RADIUS = 74;
/* Where balloons are allowed to be. */
const LANE = { left: RAIL_EDGE + 12, right: DESIGN.width - 150 };

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
      // Balloons rise the full height, so hills would only be something for them to disappear behind.
      hills: false,
      instruction: 'pop-balloon',
      roman: 'Pop the balloon',
    });
    this.banner = this.stage.banner;
    this.rail = this.stage.rail;

    // A badge holding the letter to look for, in the corner, tappable to hear it again.
    this.promptLayer = this.add.container(RAIL_EDGE + 106, 66).setDepth(21);

    this.newRound();
  }

  newRound() {
    this.locked = false;
    // Remove the balloon without stopping its recycle tween.
    for (const balloon of [...this.balloons]) this.remove(balloon);

    this.target = pickWeighted('letter', this.sequence, { avoid: [this.target] });

    // Back to the question, in case the last round ended on "well done".
    this.banner?.setInstruction('pop-balloon', 'Pop the balloon');
    this.buildPrompt();
    this.updateStreak();
    this.speak();

    // Seed the screen already full.
    const others = this.distractors(this.target, MAX_BALLOONS - 1);
    const order = Phaser.Utils.Array.Shuffle([this.target, ...others]);
    const top = RADIUS + 150; // clear of the prompt band
    const bottom = DESIGN.height + RADIUS;

    // Columns rather than random x.
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
  }

  /* An x that is not on top of a balloon already low on the screen. */
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

  /* Same-family letters first: those differ from the target only in dots. */
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

  /* The target badge: the letter to find, always shown, always tappable. */
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

  /** Sends one balloon up the screen.
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

    // Every balloon carries its letter at the same size.
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

    // Constant speed regardless of where it started.
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

    // A slow tip from side to side on the way up.
    sway(this, balloon, { angle: 5, duration: Phaser.Math.Between(1700, 2600) });
    balloon.tint = color;

    this.balloons.push(balloon);
    return balloon;
  }

  /* Replaces a balloon that drifted off the top. */
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
      // No fail state and no lost turn.
      sfx.pop();
      wrongAnswer({ sound: false, subject: { kind: 'letter', id: this.target } });
      this.streak = 0;
      this.updateStreak();
      this.rail?.wonder();
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
    rightAnswer({ kind: 'letter', id: this.target });
    sfx.sparkle();
    this.streak++;
    this.updateStreak();
    this.rail?.cheer();
    this.remove(balloon);

    // Every fifth in a row, the whole screen celebrates rather than just the balloon.
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

  /* What a balloon leaves behind. */
  burst(x, y, right, tint) {
    popPuff(this, x, y, tint ?? COLORS.accent);
    if (right) {
      sparkleBurst(this, x, y, { count: 30, tint: [tint ?? COLORS.correct, 0xffffff, 0xffc93c] });
    }
  }
}
