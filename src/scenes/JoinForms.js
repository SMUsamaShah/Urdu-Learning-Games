import Phaser from 'phaser';
import {
  activeLetters,
  allLetterGlyphs,
  letterForms,
  letterGlyph,
  lettersById,
} from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import * as sfx from '../lib/sfx.js';
import { finished, rightAnswer, wrongAnswer } from '../lib/flourish.js';
import { dance } from '../lib/celebrate.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { bob, hop, popIn, squash } from '../lib/liveliness.js';
import { sparkleBurst } from '../lib/particles.js';
import { sayLetter } from '../lib/say.js';
import { COLORS, DESIGN, RAIL_EDGE, familyColor, label } from '../lib/theme.js';
import { pickSomeWeighted } from '../lib/mastery.js';

/* Join each letter to the same letter wearing a different face. */

/* Pairs on the board, by how many boards have been finished. */
const PAIRS_BY_ROUND = [3, 3, 4, 4, 5, 5, 6];

/* The space the board gets: clear of the ribbon above and the garden at left. */
const BOARD = { left: RAIL_EDGE + 24, right: DESIGN.width - 50, top: 150, bottom: DESIGN.height - 40 };

const CARD = { size: 132, gap: 18 };

export default class JoinForms extends Phaser.Scene {
  constructor() {
    super('JoinForms');
    /** @type {string[]} */
    this.pool = [];
    this.round = 0;
    /** @type {Phaser.GameObjects.Container[]} */
    this.cards = [];
    /* The card waiting for a partner, if any. */
    this.picked = null;
    this.joined = 0;
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
  }

  create() {
    // Only letters that actually have a second face.
    this.pool = activeLetters()
      .map((letter) => letter.id)
      .filter((id) => letterGlyph(id) && this.partnerForm(id));
    this.round = 0;

    this.stage = addStage(this, {
      instruction: 'join-forms',
      roman: 'Join the same letter',
    });
    this.banner = this.stage.banner;
    this.rail = this.stage.rail;

    // Under the cards, so a line never draws over a letter.
    this.threads = this.add.graphics();
    this.board = this.add.container(0, 0);

    this.newBoard();
  }

  /* The form to show opposite the isolated one. */
  partnerForm(letterId) {
    // letterForms returns the names, not a map of them.
    const forms = letterForms(letterId);
    return ['initial', 'final', 'medial'].find((form) => forms.includes(form)) ?? null;
  }

  newBoard() {
    this.board.removeAll(true);
    this.threads.clear();
    this.cards = [];
    this.picked = null;
    this.joined = 0;
    this.locked = false;
    this.banner.setInstruction('join-forms', 'Join the same letter');

    const pairs = Math.min(
      PAIRS_BY_ROUND[Math.min(this.round, PAIRS_BY_ROUND.length - 1)],
      this.pool.length
    );
    const letters = pickSomeWeighted('letter', this.pool, pairs);

    // One em for the whole alphabet in both rows.
    const box = CARD.size - 34;
    this.em = Math.min(
      fitEmAlone(allLetterGlyphs('isolated'), box, box).em,
      fitEmAlone(allLetterGlyphs(), box, box).em
    );

    // Each row shuffled separately, so a pair is never simply the card above.
    const top = Phaser.Utils.Array.Shuffle([...letters]);
    const bottom = Phaser.Utils.Array.Shuffle([...letters]);
    const step = CARD.size + CARD.gap;
    const width = letters.length * step - CARD.gap;
    const startX = (BOARD.left + BOARD.right) / 2 + width / 2 - CARD.size / 2;
    const rowY = [BOARD.top + 120, BOARD.bottom - 130];

    let n = 0;
    for (const [row, ids] of [top, bottom].entries()) {
      ids.forEach((id, i) => {
        const form = row === 0 ? 'isolated' : this.partnerForm(id);
        const card = this.makeCard(id, form, startX - i * step, rowY[row], row);
        this.cards.push(card);
        this.board.add(card);
        popIn(this, card, { delay: n * 70, duration: 300 });
        this.time.delayedCall(n * 70 + 40, () => sfx.boing());
        n++;
      });
    }
  }

  makeCard(letterId, form, x, y, row) {
    const size = CARD.size;
    const card = this.add.container(x, y);
    card.letterId = letterId;
    card.form = form;
    card.row = row;
    card.done = false;

    const colour = familyColor(lettersById.get(letterId).shapeFamily);
    const plate = this.add.graphics();
    plate.fillStyle(COLORS.shadow, 0.2);
    plate.fillRoundedRect(-size / 2, -size / 2 + 6, size, size, 20);
    plate.fillStyle(COLORS.card, 1);
    plate.fillRoundedRect(-size / 2, -size / 2, size, size, 20);
    plate.lineStyle(4, colour, 1);
    plate.strokeRoundedRect(-size / 2, -size / 2, size, size, 20);
    card.add(plate);
    card.plate = plate;
    card.colour = colour;

    card.add(
      addGlyph(
        this,
        0,
        0,
        `join-forms:em${Math.round(this.em)}:${letterId}:${form}`,
        letterGlyph(letterId, form),
        { em: this.em, color: COLORS.ink }
      )
    );

    // Which face this is, in small type.
    card.add(label(this, 0, size / 2 - 16, form, { size: 12 }));

    card.setSize(size, size);
    card.setInteractive({ useHandCursor: true });
    card.on('pointerdown', () => squash(this, card));
    card.on('pointerup', () => this.tap(card));

    // A slow drift, out of step with its neighbours, so the board reads as alive rather than as a form to be filled in.
    card.idle = bob(this, card, { distance: 3, duration: 2400, delay: x % 700 });
    return card;
  }

  /* Says the letter on a card, and nothing else. */
  sayCard(card) {
    sayLetter(card.letterId, { word: false });
  }

  tap(card) {
    if (this.locked || card.done) return;
    sfx.tap();

    // Tapping the held card again puts it down.
    if (card === this.picked) {
      this.release();
      return this.sayCard(card);
    }

    // Two from the same row cannot be a pair, so treat the second as a change of mind rather than as a wrong answer.
    if (this.picked && this.picked.row === card.row) this.release();

    if (!this.picked) {
      this.hold(card);
      return this.sayCard(card);
    }

    const first = this.picked;
    this.picked = null;
    if (first.letterId === card.letterId) return this.join(first, card);

    this.reject(first, card);
    this.sayCard(card);
  }

  hold(card) {
    this.picked = card;
    card.idle?.stop();
    // Lifted and brightened, so it is obvious which card is waiting.
    this.tweens.add({ targets: card, scaleX: 1.12, scaleY: 1.12, duration: 140 });
    card.plate.lineStyle(6, COLORS.accent, 1);
    card.plate.strokeRoundedRect(-CARD.size / 2, -CARD.size / 2, CARD.size, CARD.size, 20);
  }

  release() {
    const card = this.picked;
    this.picked = null;
    if (!card) return;
    this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, duration: 140 });
    card.plate.lineStyle(4, card.colour, 1);
    card.plate.strokeRoundedRect(-CARD.size / 2, -CARD.size / 2, CARD.size, CARD.size, 20);
    card.idle = bob(this, card, { distance: 3, duration: 2400 });
  }

  reject(first, second) {
    wrongAnswer({ subject: { kind: 'letter', id: first.letterId } });
    this.rail?.wonder();
    // Restore both cards after the wobble.
    for (const card of [first, second]) {
      this.tweens.add({
        targets: card,
        x: card.x + 8,
        duration: 60,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
      });
    }
    this.picked = first;
    this.release();
  }

  join(first, second) {
    rightAnswer({ kind: 'letter', id: first.letterId });
    sfx.sparkle();
    this.joined++;

    // The thread, drawn behind the cards.
    this.threads.lineStyle(6, first.colour, 0.55);
    this.threads.lineBetween(first.x, first.y, second.x, second.y);

    for (const card of [first, second]) {
      card.done = true;
      card.idle?.stop();
      card.disableInteractive();
      this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, duration: 140 });
      card.plate.lineStyle(6, COLORS.correct, 1);
      card.plate.strokeRoundedRect(-CARD.size / 2, -CARD.size / 2, CARD.size, CARD.size, 20);
      sparkleBurst(this, card.x, card.y, { count: 18, tint: [COLORS.correct, 0xffffff] });
      hop(this, card, { height: 16 });
      dance(this, card);
    }

    // The name and then the word, now that the pair is made.
    sayLetter(first.letterId);

    if (this.joined < this.cards.length / 2) return;

    // Board finished.
    this.locked = true;
    finished();
    this.time.delayedCall(700, () => {
      wellDone(this, this.stage, { duration: 2600 });
      this.round++;
      this.time.delayedCall(2200, () => this.newBoard());
    });
  }
}
