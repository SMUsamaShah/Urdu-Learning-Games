import Phaser from 'phaser';
import {
  letterGlyph,
  lettersById,
  sequenceFor,
  shapeFamilySiblings,
} from '../lib/content.js';
import { addGlyph } from '../lib/glyph.js';
import { clipKeys, hasClip, play, stopAll } from '../lib/audio.js';
import * as sfx from '../lib/sfx.js';
import { COLORS, DESIGN, familyColor, label, makeButton } from '../lib/theme.js';

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

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.sequence = sequenceFor('alphabetical').filter((id) => letterGlyph(id));
    this.streak = 0;
    this.balloons = [];
    this.locked = false;

    makeButton(this, {
      x: 72,
      y: 56,
      width: 96,
      height: 68,
      color: COLORS.panel,
      onTap: () => {
        sfx.swoosh();
        this.scene.start('Home');
      },
    }).add(
      this.add
        .text(0, 0, '⌂', { fontSize: '34px', color: COLORS.ink })
        .setOrigin(0.5)
    );

    this.streakText = label(this, DESIGN.width - 90, 56, '', {
      size: 26,
      color: COLORS.accentCss,
    });

    // The prompt sits in a band across the top. Balloons are created later and
    // would otherwise draw over it, so both are lifted above them: the question
    // must never be hidden by the answers drifting past it.
    this.add
      .graphics()
      .fillStyle(COLORS.card, 1)
      .fillRect(0, 0, DESIGN.width, 132)
      .setDepth(10);
    this.promptLayer = this.add.container(DESIGN.width / 2, 66).setDepth(11);

    this.events.once('shutdown', stopAll);
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
        const span = (DESIGN.width - 320) / (order.length - 1);
        return 160 + i * span;
      })
    );

    order.forEach((id, i) => {
      const t = i / (order.length - 1);
      this.launch(id, bottom - t * (bottom - top), columns[i]);
    });
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
    let best = Phaser.Math.Between(160, DESIGN.width - 160);
    let bestGap = -1;
    for (let i = 0; i < 8; i++) {
      const candidate = Phaser.Math.Between(160, DESIGN.width - 160);
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

  buildPrompt() {
    this.promptLayer.removeAll(true);
    const spoken = hasClip(clipKeys.letterName(this.target));

    if (spoken) {
      const button = makeButton(this, {
        x: 0,
        y: 0,
        width: 260,
        height: 86,
        color: COLORS.accent,
        onTap: () => this.speak(),
      });
      button.add(this.add.text(-70, 0, '🔊', { fontSize: '40px' }).setOrigin(0.5));
      button.add(
        label(this, 26, 0, 'pop this one', { size: 20, color: COLORS.onColor })
      );
      this.promptLayer.add(button);
    } else {
      // Without a recording the letter itself is the prompt, so the game is
      // playable before anybody has recorded anything. It gets a plate: some
      // letters are a single thin stroke and would otherwise be lost against
      // the band.
      const letter = lettersById.get(this.target);
      this.promptLayer.add(label(this, -96, 0, 'pop this', { size: 22 }));

      const plate = this.add.graphics();
      plate.fillStyle(COLORS.bg, 1);
      plate.fillRoundedRect(-8, -46, 108, 92, 18);
      plate.lineStyle(3, familyColor(letter.shapeFamily), 0.9);
      plate.strokeRoundedRect(-8, -46, 108, 92, 18);
      this.promptLayer.add(plate);

      this.promptLayer.add(
        addGlyph(
          this,
          46,
          0,
          `balloon:prompt:${this.target}:60`,
          letterGlyph(this.target, 'isolated'),
          { height: 60, color: COLORS.ink }
        )
      );
    }
  }

  speak() {
    if (hasClip(clipKeys.letterName(this.target))) {
      play(clipKeys.letterName(this.target));
    }
  }

  updateStreak() {
    this.streakText.setText('★'.repeat(Math.min(this.streak, 5)));
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

    balloon.add(
      addGlyph(this, 0, -4, `balloon:${letterId}:82`, letterGlyph(letterId, 'isolated'), {
        height: 82,
        color: COLORS.onColor,
      })
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

    this.burst(balloon.x, balloon.y, right);

    if (!right) {
      // Costs nothing but the balloon. No fail state, no lost turn.
      sfx.pop();
      this.streak = 0;
      this.updateStreak();
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
    sfx.correct();
    this.streak++;
    this.updateStreak();
    this.remove(balloon);

    // Let the remaining balloons drift off rather than vanishing, then reset.
    for (const other of this.balloons) {
      this.tweens.add({ targets: other, alpha: 0, duration: 420 });
    }
    this.time.delayedCall(900, () => this.newRound());
  }

  /** Confetti-ish burst. Green for right, a puff of the balloon's own colour otherwise. */
  burst(x, y, right) {
    const count = right ? 14 : 7;
    for (let i = 0; i < count; i++) {
      const bit = this.add.graphics();
      bit.fillStyle(right ? COLORS.correct : COLORS.accent, 1);
      bit.fillCircle(0, 0, Phaser.Math.Between(4, 9));
      bit.setPosition(x, y);

      const angle = (Math.PI * 2 * i) / count;
      const distance = Phaser.Math.Between(60, 150);
      this.tweens.add({
        targets: bit,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.4,
        duration: Phaser.Math.Between(380, 620),
        ease: 'Quad.easeOut',
        onComplete: () => bit.destroy(),
      });
    }
  }
}
