import Phaser from 'phaser';
import {
  allLetterGlyphs,
  allWordGlyphs,
  brokenWord,
  letterForms,
  letterGlyph,
  lettersById,
  sequenceFor,
  uiGlyph,
  uiGlyphs,
  wordForLetter,
  wordGlyph,
} from '../lib/content.js';
import { addGlyph, addGlyphBaseline, fitEmAlone, fitEmLine } from '../lib/glyph.js';
import { addWordImage, queueWordImages } from '../lib/images.js';
import { clipKeys, hasClip, play, playSequence } from '../lib/audio.js';
import { sayLetter } from '../lib/say.js';
import * as sfx from '../lib/sfx.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage } from '../lib/stage.js';
import { breathe, hop, jig, popIn, squash } from '../lib/liveliness.js';
import { ringBurst, sparkleBurst } from '../lib/particles.js';
import { COLORS, DESIGN, familyColor, label } from '../lib/theme.js';
import { watchSwipe } from '../lib/swipe.js';
import { coloredWordParts, wordColor } from '../lib/word-colors.js';

/* Free exploration of the alphabet, and the backbone the other games hang off. */

/* How fast a flick slows down. */
const FLICK_DECAY = 0.92;

/* The strip's card and its selection ring, baked once and shared by all 38 cells. */
const CARD_TEX = 'strip:card';
const RING_TEX = { thin: 'strip:ring:thin', thick: 'strip:ring:thick' };
const CARD_SUPERSAMPLE = 2;

function ensureStripTextures(scene, size) {
  const make = (key, draw) => {
    if (scene.textures.exists(key)) return;
    const canvas = scene.textures.createCanvas(
      key,
      size * CARD_SUPERSAMPLE,
      size * CARD_SUPERSAMPLE
    );
    const ctx = canvas.context;
    ctx.scale(CARD_SUPERSAMPLE, CARD_SUPERSAMPLE);
    draw(ctx);
    canvas.refresh();
  };

  make(CARD_TEX, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 16);
    ctx.fill();
  });

  for (const [name, width] of [
    ['thin', 2],
    ['thick', 6],
  ]) {
    make(RING_TEX[name], (ctx) => {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.roundRect(width / 2, width / 2, size - width, size - width, 16);
      ctx.stroke();
    });
  }
}

const FORM_LABELS = {
  isolated: 'isolated',
  initial: 'initial',
  medial: 'medial',
  final: 'final',
};

/* Where each kind of Urdu on this screen is drawn, as a box to fit letters into. */
const HERO_BOX = { top: 130, width: 320, height: 270 };
const FORM_BOX = { top: 152, size: 128 };
const WORD_BOX = { top: 386, width: 300, height: 112 };

/* The word spelled out one letter at a time, under the word itself. */
const BROKEN_BOX = { top: 494, cell: 52, gap: 10 };

/* Marks something as tappable-to-hear. */
function speakerIcon(scene, x, y, size = 26) {
  return scene.add
    .text(x, y, '🔊', { fontSize: `${size}px` })
    .setOrigin(0.5)
    .setAlpha(0.75);
}

/* Gives a container a tap handler with a press animation and a blip. */
function makeTappable(scene, target, onTap) {
  target.setInteractive({ useHandCursor: true });
  target.on('pointerup', () => {
    sfx.tap();
    onTap();
  });
  return target;
}

export default class Flashcards extends Phaser.Scene {
  constructor() {
    super('Flashcards');
    /** @type {string[]} */
    this.sequence = [];
    this.selectedIndex = 0;
    /** @type {Phaser.GameObjects.Container|null} */
    this.card = null;
  }

  preload() {
    queueBackdrop(this);
    // Small WebPs, shared with the picture games; Phaser skips any it already holds, so this is free after the first visit.
    queueWordImages(this);
  }

  create() {
    // No ribbon and no garden: this screen is a letter and its word, and there is nothing to instruct.
    addStage(this, { hills: false, rail: false });
    this.sequence = sequenceFor('alphabetical');
    this.selectedIndex = 0;

    this.buildStrip();
    this.buildCard();

    // Say the first letter once the scene is up.
    sayLetter(this.sequence[this.selectedIndex]);
  }

  /* The scrollable letter picker across the bottom, laid out right to left. */
  buildStrip() {
    const stripY = DESIGN.height - 78;
    const size = 84;
    const gap = 10;
    const step = size + gap;

    this.add
      .graphics()
      .fillStyle(COLORS.shadow, 0.12)
      .fillRect(0, stripY - size / 2 - 14, DESIGN.width, size + 28);

    ensureStripTextures(this, size);

    const cellFit = fitEmAlone(allLetterGlyphs('isolated'), size - 14, size - 12);

    const strip = this.add.container(0, stripY);
    this.strip = strip;
    // Kept as a plain array rather than read back off the container: Container.each passes only the child, with no index.
    this.stripCells = [];
    this.stripCellSize = size;

    this.sequence.forEach((letterId, index) => {
      const letter = lettersById.get(letterId);
      const glyph = letterGlyph(letterId, 'isolated');
      if (!letter || !glyph) return;

      // Right-to-left: the first letter of the alphabet sits on the right.
      const x = -index * step;

      const cell = this.add.container(x, 0);
      const card = this.add.image(0, 0, CARD_TEX).setDisplaySize(size, size);
      const ring = this.add.image(0, 0, RING_TEX.thin).setDisplaySize(size, size);
      cell.add([card, ring]);

      cell.add(
        addGlyph(this, 0, 0, `strip:em${Math.round(cellFit.em)}:${letterId}`, glyph, {
          em: cellFit.em,
          color: COLORS.ink,
        })
      );

      cell.setSize(size, size);
      cell.setInteractive({ useHandCursor: true });
      // A drag that ends on a cell must not also pick it.
      cell.on('pointerup', () => {
        if (this.swipe.moved()) return;
        squash(this, cell);
        this.select(index);
      });

      cell.ring = ring;
      cell.letter = letter;
      strip.add(cell);
      this.stripCells.push(cell);
    });

    this.stripStep = step;

    // Cell i sits at `strip.x - i * step`, so a larger strip.x scrolls towards the start of the alphabet.
    const margin = size / 2 + 10;
    this.stripMin = DESIGN.width - margin;
    this.stripMax = margin + (this.sequence.length - 1) * step;

    this.layoutStrip(false);
    this.highlightStrip();

    this.attachStripDrag(stripY);
  }

  /* Drag to scroll, with the pointer moving the strip 1:1, plus a flick. */
  attachStripDrag(stripY) {
    this.dragging = false;
    this.flick = 0;

    this.swipe = watchSwipe(this, {
      from: (pointer) => {
        if (pointer.y <= stripY - 70) return false;
        this.dragging = true;
        // A finger on the strip beats an in-flight centring tween, or the strip fights the hand holding it.
        this.tweens.killTweensOf(this.strip);
        return true;
      },
      onMove: (delta) => {
        this.flick = delta;
        this.strip.x = Phaser.Math.Clamp(this.strip.x + delta, this.stripMin, this.stripMax);
      },
      onEnd: () => {
        this.dragging = false;
      },
    });
  }

  update() {
    // Carry on after the finger lifts, slowing to a stop.
    if (this.dragging || Math.abs(this.flick) < 0.4) return;
    this.flick *= FLICK_DECAY;
    this.strip.x = Phaser.Math.Clamp(
      this.strip.x + this.flick,
      this.stripMin,
      this.stripMax
    );
  }

  layoutStrip(animate = true) {
    // Centre the selected letter where there is room to, and let the clamp pin it to an edge near either end of the alphabet.
    const targetX = DESIGN.width / 2 + this.selectedIndex * this.stripStep;
    const clamped = Phaser.Math.Clamp(targetX, this.stripMin, this.stripMax);
    if (!animate) {
      this.strip.x = clamped;
      return;
    }
    this.tweens.add({
      targets: this.strip,
      x: clamped,
      duration: 260,
      ease: 'Cubic.easeOut',
    });
  }

  highlightStrip() {
    this.stripCells.forEach((cell, index) => {
      const selected = index === this.selectedIndex;
      // Every cell stays a white card.
      cell.ring.setTexture(selected ? RING_TEX.thick : RING_TEX.thin);
      cell.ring.setDisplaySize(this.stripCellSize, this.stripCellSize);
      cell.ring.setTint(familyColor(cell.letter.shapeFamily));
      cell.ring.setAlpha(selected ? 1 : 0.5);
      cell.setScale(selected ? 1.12 : 1);
    });
  }

  select(index) {
    if (index === this.selectedIndex) return;
    this.selectedIndex = index;
    this.highlightStrip();
    this.layoutStrip();
    this.buildCard();

    // Its name, then the word it teaches.
    sayLetter(this.sequence[index]);
  }

  /* The large letter, its positional forms, and its word. */
  buildCard() {
    this.card?.destroy(true);
    const card = this.add.container(0, 0);
    this.card = card;

    const letterId = this.sequence[this.selectedIndex];
    const letter = lettersById.get(letterId);
    const tint = familyColor(letter.shapeFamily);

    // Two columns.
    const HERO_X = 1050;
    const MAIN_X = 470;

    const hero = this.add.graphics();
    hero.fillStyle(COLORS.card, 1);
    hero.fillRoundedRect(HERO_X - 175, 110, 350, 400, 30);
    hero.lineStyle(6, tint, 1);
    hero.strokeRoundedRect(HERO_X - 175, 110, 350, 400, 30);
    card.add(hero);

    const heroFit = fitEmAlone(allLetterGlyphs('isolated'), HERO_BOX.width, HERO_BOX.height);
    const isolated = letterGlyph(letterId, 'isolated');
    if (isolated) {
      const heroY = HERO_BOX.top + HERO_BOX.height / 2;
      const glyph = addGlyph(
        this,
        HERO_X,
        heroY,
        `hero:em${Math.round(heroFit.em)}:${letterId}:taught`,
        isolated,
        { em: heroFit.em, color: COLORS.taughtCss }
      );
      card.add(glyph);
      // The letter arrives rather than being there.
      popIn(this, glyph, { duration: 420 });
      ringBurst(this, HERO_X, heroY, tint);
      this.time.delayedCall(420, () => {
        if (glyph.active) breathe(this, glyph, { amount: 0.025, duration: 2400 });
      });
      this.heroGlyph = glyph;
    }

    // The letter's NAME, which is not the same as the sound it makes.
    card.add(label(this, HERO_X, 415, letter.roman, { size: 30, color: COLORS.ink }));
    card.add(label(this, HERO_X, 458, `says "${letter.sound}"`, { size: 19 }));

    // Tapping the big letter says its name and then the sound it makes, with a beat between them.
    const nameKey = clipKeys.letterName(letterId);
    const soundKey = clipKeys.letterSound(letterId);
    const heroZone = this.add
      .zone(HERO_X, 310, 350, 400)
      .setOrigin(0.5, 0.5);
    card.add(
      makeTappable(this, heroZone, () => {
        // The letter jumps when it is asked to speak, so a tap on a card with no recording behind it still does something.
        if (this.heroGlyph?.active) hop(this, this.heroGlyph, { height: 22 });
        sparkleBurst(this, HERO_X, 250, { count: 14, speed: 180, tint: [tint, 0xffffff] });
        playSequence([nameKey, soundKey]);
      })
    );
    if (hasClip(nameKey) || hasClip(soundKey)) {
      card.add(speakerIcon(this, HERO_X + 140, 140));
    }

    const forms = letterForms(letterId);
    card.add(
      label(this, MAIN_X, 122, `${forms.length} form${forms.length > 1 ? 's' : ''}`, {
        size: 17,
      })
    );

    const boxW = FORM_BOX.size;
    const boxGap = 14;
    const totalW = forms.length * boxW + (forms.length - 1) * boxGap;
    // Right-to-left, so isolated sits rightmost.
    const formsRight = MAIN_X + totalW / 2 - boxW / 2;

    // Fitted across every form of every letter, not across this letter's four.
    const formFit = fitEmAlone(allLetterGlyphs(), boxW - 12, boxW - 12);
    const nameFit = fitEmLine(uiGlyphs(Object.keys(FORM_LABELS)), boxW, 44);

    forms.forEach((form, index) => {
      const glyph = letterGlyph(letterId, form);
      if (!glyph) return;
      const x = formsRight - index * (boxW + boxGap);

      const box = this.add.graphics();
      box.fillStyle(COLORS.panel, 1);
      box.fillRoundedRect(x - boxW / 2, FORM_BOX.top, boxW, boxW, 18);
      card.add(box);

      const formGlyph = addGlyph(
        this,
        x,
        FORM_BOX.top + boxW / 2,
        `form:em${Math.round(formFit.em)}:${letterId}:${form}:taught`,
        glyph,
        { em: formFit.em, color: COLORS.taughtCss }
      );
      card.add(formGlyph);
      // Right to left, a beat apart, so the four forms are seen as a sequence.
      popIn(this, formGlyph, { delay: 220 + index * 110, duration: 340 });

      // Every form makes the same sound — that is the lesson.
      card.add(
        makeTappable(
          this,
          this.add.zone(x, FORM_BOX.top + boxW / 2, boxW, boxW).setOrigin(0.5),
          () => {
            if (formGlyph.active) jig(this, formGlyph);
            play(soundKey);
          }
        )
      );

      const formName = uiGlyph(form);
      if (formName) {
        card.add(
          addGlyphBaseline(
            this,
            x,
            FORM_BOX.top + boxW + 8 + nameFit.baseline,
            `form-name:em${Math.round(nameFit.em)}:${form}`,
            formName,
            { em: nameFit.em, color: COLORS.inkDim }
          )
        );
      }
      card.add(label(this, x, FORM_BOX.top + boxW + 60, FORM_LABELS[form], { size: 13 }));
    });

    const word = wordForLetter(letterId);
    if (!word) {
      // Honest gap rather than a forced word.
      card.add(
        label(this, MAIN_X, 468, 'No starter word for this letter yet', { size: 16 })
      );
      return;
    }

    const panelW = 620;
    const wordPanel = this.add.graphics();
    wordPanel.fillStyle(COLORS.panelLight, 1);
    wordPanel.fillRoundedRect(MAIN_X - panelW / 2, 378, panelW, 202, 24);
    card.add(wordPanel);

    // Picture on the right, word on the left: the same right-to-left reading order the script uses.
    const pictureX = MAIN_X + panelW / 2 - 84;
    const picture = addWordImage(this, pictureX, 470, word.id, 124);
    if (picture) {
      card.add(picture);
    } else if (word.emoji) {
      card.add(
        this.add.text(pictureX, 470, word.emoji, { fontSize: '76px' }).setOrigin(0.5)
      );
    }

    const wordFit = fitEmAlone(allWordGlyphs(), WORD_BOX.width, WORD_BOX.height);
    const glyph = wordGlyph(word.id);
    const parts = coloredWordParts(glyph);
    let wordGlyphImage = null;
    if (glyph) {
      wordGlyphImage = addGlyph(
        this,
        MAIN_X - 60,
        WORD_BOX.top + WORD_BOX.height / 2,
        `card-word:em${Math.round(wordFit.em)}:${word.id}:coloured`,
        glyph,
        {
          em: wordFit.em,
          color: COLORS.ink,
          parts,
        }
      );
      card.add(wordGlyphImage);
      // Show the complete word after the letter and its forms.
      popIn(this, wordGlyphImage, { delay: 620, duration: 380 });
    }

    const wordKey = clipKeys.word(word.id);
    card.add(
      makeTappable(this, this.add.zone(MAIN_X, 479, panelW, 202).setOrigin(0.5), () => {
        if (wordGlyphImage?.active) jig(this, wordGlyphImage, { angle: 6 });
        if (picture?.active) hop(this, picture, { height: 16 });
        play(wordKey);
      })
    );
    if (hasClip(wordKey)) {
      card.add(speakerIcon(this, MAIN_X - panelW / 2 + 34, 404, 22));
    }

    const broken = brokenWord(word.id);
    if (broken) {
      const { cell, gap } = BROKEN_BOX;
      const spread = broken.length * cell + (broken.length - 1) * gap;
      // Right to left: the first letter of the word is the rightmost cell, which is where a reader of Urdu starts.
      const right = MAIN_X - 60 + spread / 2 - cell / 2;
      const brokenFit = fitEmAlone(allLetterGlyphs('isolated'), cell - 14, cell - 14);
      const middle = BROKEN_BOX.top + cell / 2;

      broken.forEach((id, index) => {
        const glyph = letterGlyph(id, 'isolated');
        if (!glyph) return;
        const x = right - index * (cell + gap);
        const taught = index === word.letterIndex;

        // A cell for every letter, not only the taught one.
        const box = this.add.graphics();
        box.fillStyle(taught ? COLORS.taught : COLORS.bg, taught ? 0.14 : 1);
        box.fillRoundedRect(x - cell / 2, BROKEN_BOX.top, cell, cell, 12);
        card.add(box);

        const piece = addGlyph(
          this,
          x,
          middle,
          `broken:em${Math.round(brokenFit.em)}:${id}:c${index}`,
          glyph,
          { em: brokenFit.em, color: wordColor(index) }
        );
        card.add(piece);
        // Left to right in time.
        popIn(this, piece, { delay: 760 + index * 90, duration: 300 });

        card.add(
          makeTappable(
            this,
            this.add.zone(x, middle, cell, cell).setOrigin(0.5),
            () => {
              if (piece.active) jig(this, piece);
              sayLetter(id, { word: false, sound: true });
            }
          )
        );
      });
    }

    // letterIndex is not always 0.
    const position =
      word.letterIndex === 0
        ? 'starts with'
        : `has ${letter.roman} at position ${word.letterIndex + 1} of`;
    card.add(
      label(this, MAIN_X - 60, 560, `${position} · ${word.roman} — ${word.gloss}`, {
        size: 16,
      })
    );
  }
}
