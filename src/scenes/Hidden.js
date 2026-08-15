import Phaser from 'phaser';
import {
  allLetterGlyphs,
  letterGlyph,
  lettersById,
  shapeFamilySiblings,
} from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { clipKeys, hasClip } from '../lib/audio.js';
import * as sfx from '../lib/sfx.js';
import { finished, rightAnswer, wrongAnswer } from '../lib/flourish.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { bob, hop } from '../lib/liveliness.js';
import { sparkleBurst } from '../lib/particles.js';
import { sayLetter } from '../lib/say.js';
import { COLORS, DESIGN, familyColor, makeButton } from '../lib/theme.js';

/**
 * Find the letters hiding in the garden.
 *
 * ## Reading a letter that is not sitting up straight
 *
 * Every other screen in this app presents letters the way a book does: upright,
 * one size, on a plain card. That is right for learning a shape and it quietly
 * teaches something false — that a letter is only that letter when it is
 * upright and that big. A child who has only ever met ب on a white tile can be
 * genuinely stuck by ب tilted on a shop sign.
 *
 * So here they are scattered across the scene at different sizes, tilted either
 * way, and tinted into the greens and browns around them. Nothing else changes:
 * find every one of the letter in the corner. It is TapAll's question asked
 * where the answer is not conveniently laid out, which is the hardest place to
 * ask it and the most like reading.
 *
 * ## Hidden, not camouflaged
 *
 * The tint is muted but never close to the background, and nothing is ever more
 * than half covered. This is a hunt, not a test of eyesight — a three-year-old
 * who cannot find one after a while gets a nudge (see `hint`), and there is no
 * timer, no score and nothing lost by tapping the wrong thing.
 */

/** Letters on screen and how many are the target, by round. */
const ROUNDS = [
  { total: 7, wanted: 2 },
  { total: 9, wanted: 3 },
  { total: 11, wanted: 3 },
  { total: 12, wanted: 4 },
];

/** Where letters may hide: clear of the ribbon, the badge and the garden. */
const FIELD = { left: 330, right: DESIGN.width - 60, top: 190, bottom: DESIGN.height - 50 };
/** Muted, but never near the backdrop's own greens — this is a hunt, not camouflage. */
const TINTS = [0x3f6f4a, 0x6a4a2f, 0x2f5f7a, 0x7a4a6a, 0x8a6a1f, 0x4a4a6a];
/** How long before an unfound letter starts waving. */
const HINT_MS = 9000;

export default class Hidden extends Phaser.Scene {
  constructor() {
    super('Hidden');
    /** @type {string[]} */
    this.pool = [];
    this.round = 0;
    /** @type {string|null} */
    this.target = null;
    /** @type {Phaser.GameObjects.Container[]} */
    this.letters = [];
    this.found = 0;
    this.wanted = 0;
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
  }

  create() {
    this.pool = [...lettersById.keys()].filter((id) => letterGlyph(id));
    this.round = 0;

    this.stage = addStage(this, {
      instruction: 'find-hidden',
      roman: 'Find them hiding',
      plant: { x: 116, y: 640, height: 190 },
    });
    this.banner = this.stage.banner;
    this.plant = this.stage.plant;

    this.promptLayer = this.add.container(160, 215);
    this.field = this.add.container(0, 0);

    this.newRound();
    this.events.once('shutdown', () => this.time.removeAllEvents());
  }

  // ------------------------------------------------------------------ round

  newRound() {
    this.field.removeAll(true);
    this.promptLayer.removeAll(true);
    this.letters = [];
    this.found = 0;
    this.locked = false;
    this.banner.setInstruction('find-hidden', 'Find them hiding');

    const plan = ROUNDS[Math.min(this.round, ROUNDS.length - 1)];
    const pool = this.pool.filter((id) => id !== this.target);
    this.target = Phaser.Utils.Array.GetRandom(pool.length ? pool : this.pool);
    this.wanted = plan.wanted;

    // Decoys from the target's own family first, so a letter is not found by
    // its silhouette alone — which at these angles it otherwise would be.
    const siblings = Phaser.Utils.Array.Shuffle(
      shapeFamilySiblings(this.target).filter((id) => letterGlyph(id))
    );
    const rest = Phaser.Utils.Array.Shuffle(
      this.pool.filter((id) => id !== this.target && !siblings.includes(id))
    );
    const decoys = [...siblings, ...rest].slice(0, plan.total - plan.wanted);
    const ids = Phaser.Utils.Array.Shuffle([
      ...Array.from({ length: plan.wanted }, () => this.target),
      ...decoys,
    ]);

    this.buildPrompt();
    this.scatter(ids);
    sayLetter(this.target, { word: false });
    this.armHint();
  }

  buildPrompt() {
    const badge = makeButton(this, {
      x: 0,
      y: 0,
      width: 152,
      height: 132,
      color: familyColor(lettersById.get(this.target).shapeFamily),
      onTap: () => sayLetter(this.target, { word: false }),
    });
    const fit = fitEmAlone(allLetterGlyphs('isolated'), 100, 84);
    badge.add(
      addGlyph(
        this,
        0,
        -6,
        `hidden-prompt:em${Math.round(fit.em)}:${this.target}`,
        letterGlyph(this.target, 'isolated'),
        { em: fit.em, color: COLORS.onColor }
      )
    );
    if (hasClip(clipKeys.letterName(this.target))) {
      badge.add(this.add.text(0, 44, '🔊', { fontSize: '22px' }).setOrigin(0.5));
    }
    this.promptLayer.add(badge);
    bob(this, badge, { distance: 4, duration: 2200 });
  }

  /**
   * Places the letters so they never overlap.
   *
   * Overlapping is the one thing that would turn a hunt into a mess: two
   * letters on top of each other are both unreadable and impossible to tap
   * apart. Candidate points are tried and the one furthest from everything
   * already placed wins, which is cheap and good enough for a dozen.
   */
  scatter(ids) {
    const placed = [];
    // One em for every letter, then scaled per letter — so the *variation* is
    // deliberate rather than a side effect of some glyphs being bigger.
    const { em } = fitEmAlone(allLetterGlyphs('isolated'), 120, 100);

    ids.forEach((id, index) => {
      let best = null;
      let bestGap = -1;
      for (let i = 0; i < 24; i++) {
        const candidate = {
          x: Phaser.Math.Between(FIELD.left, FIELD.right),
          y: Phaser.Math.Between(FIELD.top, FIELD.bottom),
        };
        const gap = placed.length
          ? Math.min(
              ...placed.map((p) =>
                Phaser.Math.Distance.Between(p.x, p.y, candidate.x, candidate.y)
              )
            )
          : Infinity;
        if (gap > bestGap) {
          bestGap = gap;
          best = candidate;
        }
        if (gap > 170) break;
      }
      placed.push(best);

      const letter = this.add.container(best.x, best.y);
      letter.letterId = id;
      letter.found = false;
      letter.add(
        addGlyph(
          this,
          0,
          0,
          `hidden:em${Math.round(em)}:${id}`,
          letterGlyph(id, 'isolated'),
          { em, color: COLORS.ink }
        )
      );
      // Tinted, tilted and resized. This is the whole point of the screen.
      letter.list[0].setTint(Phaser.Utils.Array.GetRandom(TINTS));
      letter.setAngle(Phaser.Math.Between(-26, 26));
      letter.setScale(Phaser.Math.FloatBetween(0.62, 1.05));

      letter.setSize(110, 100);
      letter.setInteractive({ useHandCursor: true });
      letter.on('pointerup', () => this.tap(letter));
      this.field.add(letter);

      // Faded in rather than popped in: these are meant to have been lying
      // around the garden all along, not to have just arrived.
      letter.setAlpha(0);
      this.tweens.add({ targets: letter, alpha: 0.92, duration: 420, delay: index * 60 });
      this.letters.push(letter);
    });
  }

  // ------------------------------------------------------------------- play

  /**
   * After a while, an unfound target waves.
   *
   * A hunt nobody can finish is not a game. This is deliberately slow and it
   * never says which one it is going to be until it moves, so it helps without
   * taking the finding away.
   */
  armHint() {
    this.hintTimer?.remove();
    this.hintTimer = this.time.addEvent({
      delay: HINT_MS,
      loop: true,
      callback: () => {
        if (this.locked || !this.scene.isActive()) return;
        const waiting = this.letters.filter(
          (l) => !l.found && l.letterId === this.target
        );
        if (!waiting.length) return;
        hop(this, Phaser.Utils.Array.GetRandom(waiting), { height: 14 });
      },
    });
  }

  tap(letter) {
    if (this.locked || letter.found) return;

    if (letter.letterId !== this.target) {
      wrongAnswer();
      this.plant?.wonder();
      this.tweens.add({
        targets: letter,
        angle: letter.angle + 10,
        duration: 70,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
      });
      return;
    }

    letter.found = true;
    letter.disableInteractive();
    this.found++;
    rightAnswer();
    sfx.sparkle();
    sparkleBurst(this, letter.x, letter.y, { count: 20, tint: [COLORS.correct, 0xffffff] });

    // Straightens up, comes to full size and turns its proper colour: found
    // means "now I can see it is a ب", so it stops hiding.
    letter.list[0].clearTint();
    this.tweens.add({
      targets: letter,
      angle: 0,
      scaleX: 1.15,
      scaleY: 1.15,
      alpha: 1,
      duration: 320,
      ease: 'Back.easeOut',
    });
    hop(this, letter, { height: 16 });

    if (this.found < this.wanted) return;

    this.locked = true;
    this.hintTimer?.remove();
    finished();
    sayLetter(this.target);
    this.time.delayedCall(700, () => {
      wellDone(this, this.stage, { duration: 2400 });
      this.round++;
      this.time.delayedCall(2200, () => this.newRound());
    });
  }
}
