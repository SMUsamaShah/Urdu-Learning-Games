import Phaser from 'phaser';
import { allLetterGlyphs, letterGlyph, lettersById, shapeFamilySiblings } from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { basket as drawBasket } from '../lib/props.js';
import * as sfx from '../lib/sfx.js';
import { finished, rightAnswer, wrongAnswer } from '../lib/flourish.js';
import { dance } from '../lib/celebrate.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { armDragging, carry, nearest, refuse, swimHome } from '../lib/dragging.js';
import { bob, hop } from '../lib/liveliness.js';
import { sparkleBurst } from '../lib/particles.js';
import { sayLetter } from '../lib/say.js';
import { COLORS, DESIGN, RAIL_EDGE, PLAY } from '../lib/theme.js';
import { pickWeighted } from '../lib/mastery.js';

/* Put each letter in the basket it belongs to. */

/* Letters in the pile, by how many piles have been sorted. */
const PILE_BY_ROUND = [4, 5, 6, 6, 8];

const BASKET = { width: 250, height: 150, y: DESIGN.height - 118 };
/* One colour each, fixed rather than taken from the letter's shape family. */
const BASKET_COLORS = [0x3f7fd4, 0xd4762f];
/* Where a letter waiting to be sorted sits. */
const PILE = { y: 250, left: RAIL_EDGE + 44, right: DESIGN.width - 80 };
/* How close to a basket's middle a letter must be dropped to go in. */
const SNAP = 150;

export default class Baskets extends Phaser.Scene {
  constructor() {
    super('Baskets');
    this.round = 0;
    /* The two letters being sorted between. */
    this.kinds = [];
    /** @type {Phaser.GameObjects.Container[]} */
    this.tiles = [];
    this.sorted = 0;
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
  }

  create() {
    this.round = 0;
    this.stage = addStage(this, {
      instruction: 'sort-letters',
      roman: 'Sort the letters',
    });
    this.banner = this.stage.banner;
    this.rail = this.stage.rail;

    this.baskets = this.add.container(0, 0);
    this.pile = this.add.container(0, 0);

    armDragging(this, {
      canLift: (tile) => !tile.sorted && !this.locked,
      // Says the letter as it is picked up.
      onLift: (tile) => sayLetter(tile.letterId, { word: false }),
      onDrop: (tile) => this.drop(tile),
    });

    this.newRound();
  }

  newRound() {
    this.baskets.removeAll(true);
    this.pile.removeAll(true);
    this.tiles = [];
    this.sorted = 0;
    this.locked = false;
    this.banner.setInstruction('sort-letters', 'Sort the letters');

    // Two letters that look alike.
    const withSiblings = [...lettersById.keys()].filter(
      (id) => letterGlyph(id) && shapeFamilySiblings(id).some((s) => letterGlyph(s))
    );
    // Both ends weighted.
    const first = pickWeighted(
      'letter',
      withSiblings.length ? withSiblings : [...lettersById.keys()]
    );
    const second = pickWeighted(
      'letter',
      shapeFamilySiblings(first).filter((id) => letterGlyph(id))
    );
    this.kinds = [first, second];

    const count = PILE_BY_ROUND[Math.min(this.round, PILE_BY_ROUND.length - 1)];
    // Both kinds always present.
    const ids = Phaser.Utils.Array.Shuffle(
      Array.from({ length: count }, (_, i) => this.kinds[i % 2])
    );

    this.buildBaskets();
    this.buildPile(ids);
  }

  buildBaskets() {
    const { em } = fitEmAlone(allLetterGlyphs('isolated'), 96, 64);
    const step = BASKET.width + 120;
    const startX = PLAY.centerX + step / 2;

    this.kinds.forEach((id, index) => {
      const x = startX - index * step;
      const colour = BASKET_COLORS[index % BASKET_COLORS.length];
      const basket = this.add.container(x, BASKET.y);
      basket.letterId = id;
      basket.x0 = x;

      // An actual basket, woven, open at the top and standing on the ground — not a coloured slab with a pale stripe.
      basket.add(drawBasket(this, { ...BASKET, color: colour }));

      basket.add(
        addGlyph(
          this,
          0,
          BASKET.height * 0.09,
          `baskets-label:em${Math.round(em)}:${id}`,
          letterGlyph(id, 'isolated'),
          { em, color: COLORS.onColor }
        )
      );
      this.baskets.add(basket);
    });
  }

  buildPile(ids) {
    const { em } = fitEmAlone(allLetterGlyphs('isolated'), 82, 70);
    const span = PILE.right - PILE.left;
    const step = Math.min(140, span / ids.length);
    const startX = (PILE.left + PILE.right) / 2 + ((ids.length - 1) * step) / 2;

    ids.forEach((id, index) => {
      const tile = this.add.container(startX - index * step, PILE.y);
      tile.letterId = id;
      tile.sorted = false;
      tile.homeX = tile.x;
      tile.homeY = tile.y;

      const plate = this.add.graphics();
      plate.fillStyle(COLORS.shadow, 0.2);
      plate.fillRoundedRect(-55, -47, 110, 110, 18);
      plate.fillStyle(COLORS.card, 1);
      plate.fillRoundedRect(-55, -55, 110, 110, 18);
      plate.lineStyle(4, COLORS.outline, 0.35);
      plate.strokeRoundedRect(-55, -55, 110, 110, 18);
      tile.add(plate);
      tile.add(
        addGlyph(
          this,
          0,
          0,
          `baskets:em${Math.round(em)}:${id}`,
          letterGlyph(id, 'isolated'),
          { em, color: COLORS.ink }
        )
      );

      tile.setSize(110, 110);
      carry(this, tile);
      tile.idle = bob(this, tile, { distance: 4, duration: 2200, delay: index * 160 });

      this.pile.add(tile);
      this.tiles.push(tile);
    });
  }

  drop(tile) {
    if (tile.sorted || this.locked) return;
    tile.setDepth(0);

    const basket = nearest(this.baskets.list, tile, SNAP);
    const rebob = () => {
      tile.idle = bob(this, tile, { distance: 4, duration: 2200 });
    };

    if (!basket) {
      // Dropped in mid-air.
      swimHome(this, tile, { onArrive: rebob });
      return;
    }

    if (basket.letterId !== tile.letterId) {
      wrongAnswer({ subject: { kind: 'letter', id: tile.letterId } });
      this.rail?.wonder();
      // The basket shakes it off.
      refuse(this, tile, basket);
      this.time.delayedCall(300, rebob);
      return;
    }

    tile.sorted = true;
    tile.disableInteractive();
    this.sorted++;
    rightAnswer({ kind: 'letter', id: tile.letterId });
    sfx.sparkle();
    sparkleBurst(this, tile.x, tile.y, { count: 16, tint: [COLORS.correct, 0xffffff] });
    hop(this, basket, { height: 12 });

    // Drops in and out of sight: the basket keeps what it has been given, and the pile visibly shrinks towards being finished.
    this.tweens.add({
      targets: tile,
      x: basket.x,
      y: basket.y + 10,
      scaleX: 0.5,
      scaleY: 0.5,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeIn',
    });

    if (this.sorted < this.tiles.length) return;

    this.locked = true;
    finished();
    for (const b of this.baskets.list) dance(this, b);
    this.time.delayedCall(700, () => {
      wellDone(this, this.stage, { duration: 2400 });
      this.round++;
      this.time.delayedCall(2200, () => this.newRound());
    });
  }
}
