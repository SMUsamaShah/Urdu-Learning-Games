import Phaser from 'phaser';
import {
  activeLetters,
  allLetterGlyphs,
  lettersById,
  letterGlyph,
  wordForLetter,
} from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import * as sfx from '../lib/sfx.js';
import { finished, rightAnswer } from '../lib/flourish.js';
import { dance } from '../lib/celebrate.js';
import { addWordImage, hasWordImage, queueWordImages } from '../lib/images.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { hop, squash } from '../lib/liveliness.js';
import { sparkleBurst } from '../lib/particles.js';
import { sayLetter, sayWord } from '../lib/say.js';
import { COLORS, DESIGN, RAIL_EDGE, familyColor, label } from '../lib/theme.js';
import { pickSomeWeighted } from '../lib/mastery.js';

/* Find the letter and the picture that go together. */

/* Pairs on the board, by how many boards have been finished. */
const PAIRS_BY_ROUND = [3, 3, 4, 4, 5, 6];

/* Card backs, cycled. */
const BACKS = [0xd45f95, 0x5a6bd0, 0x2f9e5f, 0xe0821c, 0x9b5fc9, 0x1a9c96];

/* How long a mismatched pair stays face up before turning back. */
const PEEK_MS = 900;

/* The space the board gets: clear of the ribbon above and the garden at left. */
const BOARD = { left: RAIL_EDGE + 44, right: DESIGN.width - 60, top: 150, bottom: DESIGN.height - 40 };

export default class Memory extends Phaser.Scene {
  constructor() {
    super('Memory');
    /** @type {string[]} */
    this.pool = [];
    this.round = 0;
    /** @type {Phaser.GameObjects.Container[]} */
    this.cards = [];
    /** @type {Phaser.GameObjects.Container[]} */
    this.faceUp = [];
    this.matched = 0;
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
    queueWordImages(this);
  }

  create() {
    // Only letters that can make a pair.
    this.pool = activeLetters()
      .map((letter) => letter.id)
      .filter((id) => {
        const word = wordForLetter(id);
        return letterGlyph(id) && word && hasWordImage(word.id);
      });

    this.round = 0;

    this.stage = addStage(this, {
      instruction: 'match-pairs',
      roman: 'Match the pairs',
    });
    this.banner = this.stage.banner;
    this.rail = this.stage.rail;
    this.board = this.add.container(0, 0);

    this.newBoard();
  }

  newBoard() {
    this.board.removeAll(true);
    this.cards = [];
    this.faceUp = [];
    this.matched = 0;
    this.locked = false;
    this.banner.setInstruction('match-pairs', 'Match the pairs');

    const pairs = Math.min(
      PAIRS_BY_ROUND[Math.min(this.round, PAIRS_BY_ROUND.length - 1)],
      this.pool.length
    );
    const letters = pickSomeWeighted('letter', this.pool, pairs);

    // Two cards per letter: the letter itself and its word's picture.
    const deck = Phaser.Utils.Array.Shuffle(
      letters.flatMap((id) => [
        { pairId: id, kind: 'letter' },
        { pairId: id, kind: 'picture' },
      ])
    );

    // Worked out once for the board rather than per card, so every card is laid out against the same grid by construction.
    const grid = this.layout(deck.length);
    for (const [index, spec] of deck.entries()) {
      const card = this.makeCard(spec, index, deck.length, grid);
      this.cards.push(card);
      this.board.add(card);
    }
  }

  /* Where the cards go. */
  layout(count) {
    const gap = 18;
    let best = null;
    // Whichever number of rows makes the cards biggest.
    for (let rows = 1; rows <= 3; rows++) {
      const columns = Math.ceil(count / rows);
      const size = Math.min(
        (BOARD.right - BOARD.left - gap * (columns - 1)) / columns,
        (BOARD.bottom - BOARD.top - gap * (rows - 1)) / rows
      );
      if (!best || size > best.size) best = { rows, columns, size, gap };
    }
    return best;
  }

  makeCard(spec, index, count, grid) {
    const { rows, columns, size, gap } = grid;
    const row = Math.floor(index / columns);
    const inRow = Math.min(count - row * columns, columns);
    const indexInRow = index % columns;

    const boardW = columns * size + (columns - 1) * gap;
    const rowW = inRow * size + (inRow - 1) * gap;
    const boardH = rows * size + (rows - 1) * gap;
    const originX = (BOARD.left + BOARD.right) / 2 - boardW / 2;
    const originY = (BOARD.top + BOARD.bottom) / 2 - boardH / 2;

    const card = this.add.container(
      // Short rows are centred rather than left-aligned, so a board of five does not look like a board of six with one missing.
      originX + (boardW - rowW) / 2 + indexInRow * (size + gap) + size / 2,
      originY + row * (size + gap) + size / 2
    );
    card.pairId = spec.pairId;
    card.kind = spec.kind;
    card.faceUp = false;
    card.done = false;

    const back = this.add.graphics();
    const colour = BACKS[index % BACKS.length];
    back.fillStyle(COLORS.shadow, 0.22);
    back.fillRoundedRect(-size / 2, -size / 2 + 7, size, size, 22);
    back.fillStyle(colour, 1);
    back.fillRoundedRect(-size / 2, -size / 2, size, size, 22);
    back.lineStyle(6, 0xffffff, 0.9);
    back.strokeRoundedRect(-size / 2 + 4, -size / 2 + 4, size - 8, size - 8, 18);
    back.lineStyle(3, COLORS.outline, 0.85);
    back.strokeRoundedRect(-size / 2, -size / 2, size, size, 22);
    card.add(back);
    card.add(
      this.add
        .text(0, 0, '?', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: `${Math.round(size * 0.4)}px`,
          fontStyle: '700',
          color: COLORS.onColor,
        })
        .setOrigin(0.5)
    );

    const face = this.add.container(0, 0).setVisible(false);
    const plate = this.add.graphics();
    plate.fillStyle(COLORS.shadow, 0.22);
    plate.fillRoundedRect(-size / 2, -size / 2 + 7, size, size, 22);
    plate.fillStyle(COLORS.card, 1);
    plate.fillRoundedRect(-size / 2, -size / 2, size, size, 22);
    plate.lineStyle(4, familyColor(lettersById.get(spec.pairId).shapeFamily), 1);
    plate.strokeRoundedRect(-size / 2, -size / 2, size, size, 22);
    face.add(plate);
    card.plate = plate;
    card.size = size;

    if (spec.kind === 'letter') {
      // One em for every letter.
      const fit = fitEmAlone(allLetterGlyphs('isolated'), size - 40, size - 44);
      face.add(
        addGlyph(
          this,
          0,
          0,
          `memory-card:em${Math.round(fit.em)}:${spec.pairId}`,
          letterGlyph(spec.pairId, 'isolated'),
          { em: fit.em, color: COLORS.ink }
        )
      );
    } else {
      const word = wordForLetter(spec.pairId);
      const image = addWordImage(this, 0, -6, word.id, size - 34);
      if (image) face.add(image);
      face.add(label(this, 0, size / 2 - 20, word.roman, { size: 14 }));
    }

    card.add(face);
    card.face = face;
    card.back = back;
    card.backMark = card.list[1];

    card.setSize(size, size);
    card.setInteractive({ useHandCursor: true });
    card.on('pointerup', () => this.turn(card));
    return card;
  }

  /* Turns a card over. */
  flip(card, faceUp) {
    card.faceUp = faceUp;
    this.tweens.add({
      targets: card,
      scaleX: 0,
      duration: 110,
      ease: 'Quad.easeIn',
      onComplete: () => {
        card.face.setVisible(faceUp);
        card.back.setVisible(!faceUp);
        card.backMark.setVisible(!faceUp);
        this.tweens.add({ targets: card, scaleX: 1, duration: 110, ease: 'Quad.easeOut' });
      },
    });
  }

  turn(card) {
    if (this.locked || card.faceUp || card.done) return;

    sfx.tap();
    sfx.flip();
    squash(this, card);
    this.flip(card, true);
    this.faceUp.push(card);

    // Say what was turned over.
    if (card.kind === 'letter') sayLetter(card.pairId, { word: false });
    else sayWord(wordForLetter(card.pairId).id);

    if (this.faceUp.length < 2) return;

    const [first, second] = this.faceUp;
    this.faceUp = [];

    if (first.pairId === second.pairId) {
      this.locked = true;
      this.time.delayedCall(320, () => this.pairFound(first, second));
      return;
    }

    // Not a pair.
    this.locked = true;
    this.rail?.wonder();
    this.time.delayedCall(PEEK_MS, () => {
      this.flip(first, false);
      this.flip(second, false);
      this.locked = false;
    });
  }

  pairFound(first, second) {
    // No subject, so nothing is recorded against the letter.
    rightAnswer();
    sfx.sparkle();
    this.matched++;

    for (const card of [first, second]) {
      card.done = true;
      card.disableInteractive();
      // A green frame, so a found pair is visibly finished rather than just still face up.
      card.plate.lineStyle(6, COLORS.correct, 1);
      card.plate.strokeRoundedRect(
        -card.size / 2,
        -card.size / 2,
        card.size,
        card.size,
        22
      );
      sparkleBurst(this, card.x, card.y, { count: 20, tint: [COLORS.correct, 0xffffff] });
      hop(this, card, { height: 18 });
      dance(this, card);
    }

    // Both halves of the pair together, which is the thing being taught.
    sayLetter(first.pairId);

    if (this.matched < this.cards.length / 2) {
      // Unlocked immediately, not after the celebration finishes.
      this.locked = false;
      return;
    }

    // Board finished.
    finished();
    this.time.delayedCall(700, () => {
      wellDone(this, this.stage, { duration: 2600 });
      this.round++;
      this.time.delayedCall(2200, () => this.newBoard());
    });
  }
}
