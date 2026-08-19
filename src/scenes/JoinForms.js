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

/**
 * Join each letter to the same letter wearing a different face.
 *
 * ## Why this game exists at all
 *
 * It is the one thing that makes Urdu hard to start reading and the one thing
 * nothing else here teaches. A letter changes shape depending on where it sits
 * in a word: ب on its own, بـ at the start, ـبـ in the middle, ـب at the end.
 * Four drawings, one letter. A child who has learned the alphabet from
 * flashcards knows only the isolated form, opens a qaida, and finds that almost
 * nothing on the page looks like what they were taught.
 *
 * The reference apps have this game as uppercase-to-lowercase — A to a, M to m
 * — which is the same idea for a script that has two faces per letter instead
 * of four. Theirs is a nicety. Ours is the whole difficulty.
 *
 * ## The board
 *
 * Isolated forms along the top, joined forms along the bottom, shuffled
 * separately. Tap one, tap its partner, and a line is drawn between them.
 * Deliberately not drag-and-drop: a three-year-old's finger leaves the glass,
 * and a game that punishes that is a game about dexterity rather than letters.
 *
 * A wrong pair is not a loss — the two shake, the selection clears, and the
 * board is exactly as it was. Same rule as every other screen here.
 *
 * ## Which joined form
 *
 * Whichever is furthest from the isolated one, which is the pairing worth
 * practising. For most letters that is the initial form, where the tail is cut
 * away and only the head remains — ب to بـ is the jump that catches people. Ten
 * letters never join to the left at all (ا, د, ر, و and their dotted
 * relatives), so they have no initial or medial form and are shown final.
 */

/** Pairs on the board, by how many boards have been finished. */
const PAIRS_BY_ROUND = [3, 3, 4, 4, 5, 5, 6];

/** The space the board gets: clear of the ribbon above and the garden at left. */
const BOARD = { left: RAIL_EDGE + 24, right: DESIGN.width - 50, top: 150, bottom: DESIGN.height - 40 };

const CARD = { size: 132, gap: 18 };

export default class JoinForms extends Phaser.Scene {
  constructor() {
    super('JoinForms');
    /** @type {string[]} letters with a joined form to pair against */
    this.pool = [];
    this.round = 0;
    /** @type {Phaser.GameObjects.Container[]} */
    this.cards = [];
    /** The card waiting for a partner, if any. */
    this.picked = null;
    this.joined = 0;
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
  }

  create() {
    // Only letters that actually have a second face. Hamza has one form, so it
    // has nothing to be paired with and must not reach the board.
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

  /**
   * The form to show opposite the isolated one.
   *
   * Initial where there is one, because that is the shape least like the
   * isolated form and so the pairing worth practising. Final for the
   * non-joiners, which is all they have.
   */
  partnerForm(letterId) {
    // letterForms returns the names, not a map of them. Reading it as a map
    // silently gave every letter no partner, so the board came up empty with
    // nothing thrown — see the note on this in tools/verify-games.mjs.
    const forms = letterForms(letterId);
    return ['initial', 'final', 'medial'].find((form) => forms.includes(form)) ?? null;
  }

  // ------------------------------------------------------------------ board

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
    const letters = Phaser.Utils.Array.Shuffle([...this.pool]).slice(0, pairs);

    // One em for the whole alphabet in both rows, not per board: a letter that
    // is bigger than its neighbours is a hint, and a size that changes between
    // boards makes the screen feel unsteady.
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

    // Which face this is, in small type. A child cannot read it, but the parent
    // sitting next to them is the one who explains what is going on, and
    // "middle" on the card is what lets them.
    card.add(label(this, 0, size / 2 - 16, form, { size: 12 }));

    card.setSize(size, size);
    card.setInteractive({ useHandCursor: true });
    card.on('pointerdown', () => squash(this, card));
    card.on('pointerup', () => this.tap(card));

    // A slow drift, out of step with its neighbours, so the board reads as
    // alive rather than as a form to be filled in.
    card.idle = bob(this, card, { distance: 3, duration: 2400, delay: x % 700 });
    return card;
  }

  // ------------------------------------------------------------------- play

  /**
   * Says the letter on a card, and nothing else.
   *
   * Every tap on a live card goes through here. Only picking a card up used to
   * speak, which meant putting one down and getting a pair wrong were both
   * silent: tapping around the board gave a letter on some tiles and nothing on
   * others, with nothing on the screen to explain the difference. Hearing the
   * name of whatever is under the finger is the part of this game that teaches,
   * and a wrong guess is exactly the moment it is worth hearing.
   *
   * The word is withheld — during the round it would name a letter the child is
   * still looking for on the other row. Joining a pair says the full thing.
   */
  sayCard(card) {
    sayLetter(card.letterId, { word: false });
  }

  tap(card) {
    if (this.locked || card.done) return;
    sfx.tap();

    // Tapping the held card again puts it down. Without this the only way out
    // of a mis-tap is to get the next one deliberately wrong.
    if (card === this.picked) {
      this.release();
      return this.sayCard(card);
    }

    // Two from the same row cannot be a pair, so treat the second as a change
    // of mind rather than as a wrong answer. Nothing was claimed yet.
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
    wrongAnswer();
    this.rail?.wonder();
    // A wobble on both, then everything back as it was. No score to lose and
    // nothing removed from the board — the pair they wanted is still there.
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
    rightAnswer();
    sfx.sparkle();
    this.joined++;

    // The thread, drawn behind the cards. This is the whole point of the game
    // made visible: these two drawings are one letter.
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

    // The name and then the word, now that the pair is made. During the round
    // the word is withheld — it would name a letter the child is still looking
    // for on the other row.
    sayLetter(first.letterId);

    if (this.joined < this.cards.length / 2) return;

    // Board finished. A beat of build-up first: a reward that lands the instant
    // the last pair joins is over before it has been noticed.
    this.locked = true;
    finished();
    this.time.delayedCall(700, () => {
      wellDone(this, this.stage, { duration: 2600 });
      this.round++;
      this.time.delayedCall(2200, () => this.newBoard());
    });
  }
}
