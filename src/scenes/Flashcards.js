import Phaser from 'phaser';
import {
  allLetterGlyphs,
  allWordGlyphs,
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
import { addStage } from '../lib/stage.js';
import { breathe, hop, jig, popIn, squash } from '../lib/liveliness.js';
import { ringBurst, sparkleBurst } from '../lib/particles.js';
import { COLORS, DESIGN, familyColor, label } from '../lib/theme.js';

/**
 * Free exploration of the alphabet, and the backbone the other games hang off.
 *
 * A child picks a letter from the strip and sees it large, with every
 * positional form it actually has and the word that teaches it. Nothing is
 * locked, nothing is scored and there is no wrong move.
 *
 * The two Urdu-specific things this screen exists to show, and which a
 * transliterated Latin alphabet app has no equivalent of:
 *
 *   1. Letters change shape depending on where they sit in a word. The forms
 *      row is the point of the screen, not decoration.
 *   2. Not every letter has four forms. Non-joiners have two and hamza has one,
 *      so the row is built from what the data actually contains.
 */

/** How far a finger may move and still count as a tap rather than a drag. */
const TAP_SLOP = 8;

/** How fast a flick slows down. Per frame, so ~0.92 stops in about half a second. */
const FLICK_DECAY = 0.92;

/**
 * The strip's card and its selection ring, baked once and shared by all 38
 * cells.
 *
 * The strip used to draw a Graphics per cell, which is 38 rounded rectangles
 * re-tessellated on the CPU every single frame — measured at 8ms a frame on a
 * desktop GPU, which is a dropped frame on a phone. See the note above
 * `shapeTextures` in theme.js. Nothing here changes between frames, so it has
 * no business being redrawn at all.
 *
 * The ring is drawn white so a tint can give it the letter's family colour, and
 * there are two of them rather than one scaled: a 2px line stretched to 6px is
 * blurry, and the ring is the only thing marking the selection.
 */
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

/**
 * Where each kind of Urdu on this screen is drawn, as a box to fit letters into.
 *
 * Every one of these holds a *set* — 38 letters in the strip, four forms in the
 * row, any of 37 words on the plate — and the whole set has to come out at one
 * size, so the size is measured from the set against these boxes rather than
 * typed in as a height. See fitEmAlone() in glyph.js.
 *
 * This screen is where getting that wrong showed worst. Fitted to a height, ہ
 * was drawn three and a half times the size of ل in the strip, so scrolling the
 * alphabet looked like scrolling through several different alphabets; and in the
 * forms row, where the entire lesson is that these four shapes are the same
 * letter, the medial form was routinely drawn at twice the size of the isolated
 * one.
 */
const HERO_BOX = { top: 130, width: 320, height: 270 };
const FORM_BOX = { top: 152, size: 128 };
const WORD_BOX = { top: 392, width: 300, height: 126 };

/**
 * Marks something as tappable-to-hear.
 *
 * Only drawn when a recording actually exists: promising sound and delivering
 * silence is worse than a plain card, and the recordings arrive gradually.
 */
function speakerIcon(scene, x, y, size = 26) {
  return scene.add
    .text(x, y, '🔊', { fontSize: `${size}px` })
    .setOrigin(0.5)
    .setAlpha(0.75);
}

/** Gives a container a tap handler with a press animation and a blip. */
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
    // Small WebPs, shared with the picture games; Phaser skips any it already
    // holds, so this is free after the first visit.
    queueWordImages(this);
  }

  create() {
    // No ribbon and no spider: this screen is a letter and its word, and there
    // is nothing to instruct. No hills either — the letter strip already fills
    // the bottom of the screen.
    addStage(this, { hills: false, mascot: false });
    this.sequence = sequenceFor('alphabetical');
    this.selectedIndex = 0;

    this.buildStrip();
    this.buildCard();

    // Say the first letter once the scene is up. Reaching here always took a
    // tap on Home, so the audio context is already unlocked.
    sayLetter(this.sequence[this.selectedIndex]);
  }

  /** The scrollable letter picker across the bottom, laid out right to left. */
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
    // Kept as a plain array rather than read back off the container:
    // Container.each passes only the child, with no index.
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
      // A drag that ends on a cell must not also pick it. Scrolling the strip
      // and choosing a letter are the same gesture up to the moment the finger
      // moves, and landing on a letter you were only scrolling past is the most
      // annoying thing a strip like this can do.
      cell.on('pointerup', () => {
        if (this.dragMoved > TAP_SLOP) return;
        squash(this, cell);
        this.select(index);
      });

      cell.ring = ring;
      cell.letter = letter;
      strip.add(cell);
      this.stripCells.push(cell);
    });

    this.stripStep = step;

    // Cell i sits at `strip.x - i * step`, so a larger strip.x scrolls towards
    // the start of the alphabet. The bounds keep the run of letters pinned to
    // the edges: at the low bound alif sits at the right margin (where an Urdu
    // reader starts), at the high bound the last letter reaches the left.
    const margin = size / 2 + 10;
    this.stripMin = DESIGN.width - margin;
    this.stripMax = margin + (this.sequence.length - 1) * step;

    this.layoutStrip(false);
    this.highlightStrip();

    this.attachStripDrag(stripY);
  }

  /**
   * Drag to scroll, with the pointer moving the strip 1:1, plus a flick.
   *
   * The delta is measured against this handler's own last position rather than
   * `pointer.prevPosition`. That property is the pointer's position at the
   * *previous frame*, not at the previous event, so a pointermove that fires
   * twice in one frame applies the same delta twice and one that does not fire
   * applies nothing — which is exactly what a jerky scroll is made of.
   */
  attachStripDrag(stripY) {
    this.dragging = false;
    this.dragMoved = 0;
    this.dragLastX = 0;
    this.flick = 0;

    const inStrip = (pointer) => pointer.y > stripY - 70;

    this.input.on('pointerdown', (pointer) => {
      if (!inStrip(pointer)) return;
      this.dragging = true;
      this.dragMoved = 0;
      this.dragLastX = pointer.x;
      this.flick = 0;
      // A finger on the strip beats an in-flight centring tween, or the strip
      // fights the hand holding it.
      this.tweens.killTweensOf(this.strip);
    });

    this.input.on('pointermove', (pointer) => {
      if (!this.dragging || !pointer.isDown) return;
      const delta = pointer.x - this.dragLastX;
      this.dragLastX = pointer.x;
      this.dragMoved += Math.abs(delta);
      this.flick = delta;
      this.strip.x = Phaser.Math.Clamp(this.strip.x + delta, this.stripMin, this.stripMax);
    });

    const release = () => {
      this.dragging = false;
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  update() {
    // Carry on after the finger lifts, slowing to a stop. Without it a strip of
    // 38 letters has to be dragged across in stages.
    if (this.dragging || Math.abs(this.flick) < 0.4) return;
    this.flick *= FLICK_DECAY;
    this.strip.x = Phaser.Math.Clamp(
      this.strip.x + this.flick,
      this.stripMin,
      this.stripMax
    );
  }

  layoutStrip(animate = true) {
    // Centre the selected letter where there is room to, and let the clamp pin
    // it to an edge near either end of the alphabet.
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
      // Every cell stays a white card. Selection is a thick family-coloured
      // ring and a bump in size, not a coloured fill: the glyph on top is dark,
      // so filling the selected cell with a saturated colour would make the one
      // letter the child is looking at the hardest one in the strip to see.
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

    // Its name, then the word it teaches. For a child who cannot read, this is
    // the whole point of picking a letter, and the word is what makes the
    // letter mean something rather than being a noise attached to a squiggle.
    sayLetter(this.sequence[index]);
  }

  /** The large letter, its positional forms, and its word. */
  buildCard() {
    this.card?.destroy(true);
    const card = this.add.container(0, 0);
    this.card = card;

    const letterId = this.sequence[this.selectedIndex];
    const letter = lettersById.get(letterId);
    const tint = familyColor(letter.shapeFamily);

    // Two columns. The hero letter takes the right-hand column because that is
    // where the eye starts in Urdu; forms and word stack down the left.
    const HERO_X = 1050;
    const MAIN_X = 470;

    // --- Hero letter -------------------------------------------------------
    // Solid, not a translucent tint: the scenery behind it moves, and a cloud
    // drifting through the middle of the letter card looks like a bug.
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
        `hero:em${Math.round(heroFit.em)}:${letterId}`,
        isolated,
        { em: heroFit.em, color: COLORS.ink }
      );
      card.add(glyph);
      // The letter arrives rather than being there. This screen is the one a
      // child spends longest on, moving through the alphabet a letter at a
      // time, and the arrival is what makes each one feel like a new thing
      // rather than a page refresh.
      popIn(this, glyph, { duration: 420 });
      ringBurst(this, HERO_X, heroY, tint);
      this.time.delayedCall(420, () => {
        if (glyph.active) breathe(this, glyph, { amount: 0.025, duration: 2400 });
      });
      this.heroGlyph = glyph;
    }

    // The letter's NAME, which is not the same as the sound it makes. Both are
    // taught, and conflating them is the classic alphabet-app mistake.
    card.add(label(this, HERO_X, 415, letter.roman, { size: 30, color: COLORS.ink }));
    card.add(label(this, HERO_X, 458, `says "${letter.sound}"`, { size: 19 }));

    // Tapping the big letter says its name and then the sound it makes, with a
    // beat between them. Hearing the two next to each other is what separates
    // them: "bay ... b".
    const nameKey = clipKeys.letterName(letterId);
    const soundKey = clipKeys.letterSound(letterId);
    const heroZone = this.add
      .zone(HERO_X, 310, 350, 400)
      .setOrigin(0.5, 0.5);
    card.add(
      makeTappable(this, heroZone, () => {
        // The letter jumps when it is asked to speak, so a tap on a card with
        // no recording behind it still does something. Silence and no movement
        // together read as a broken button.
        if (this.heroGlyph?.active) hop(this, this.heroGlyph, { height: 22 });
        sparkleBurst(this, HERO_X, 250, { count: 14, speed: 180, tint: [tint, 0xffffff] });
        playSequence([nameKey, soundKey]);
      })
    );
    if (hasClip(nameKey) || hasClip(soundKey)) {
      card.add(speakerIcon(this, HERO_X + 140, 140));
    }

    // --- Positional forms --------------------------------------------------
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
    // Per-letter would make each row internally consistent and still change size
    // as the child scrolls, which is the same bug moved somewhere less obvious.
    //
    // The names underneath are the one thing on this screen that does share a
    // baseline: they are a row of words read together, so الگ and درمیانی have
    // to sit on a line the way the letters above them do not.
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
        `form:em${Math.round(formFit.em)}:${letterId}:${form}`,
        glyph,
        { em: formFit.em, color: COLORS.ink }
      );
      card.add(formGlyph);
      // Right to left, a beat apart, so the four forms are seen as a sequence.
      // That ordering is the lesson — where in a word each shape belongs — and
      // showing them all at once flattens it into four unrelated squiggles.
      popIn(this, formGlyph, { delay: 220 + index * 110, duration: 340 });

      // Every form makes the same sound — that is the lesson. Tapping any of
      // them plays it.
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

    // --- Word --------------------------------------------------------------
    const word = wordForLetter(letterId);
    if (!word) {
      // Honest gap rather than a forced word. Several letters (se, zal, zhe,
      // zuad, zoe, wao, hamza, bari-ye) have no word a three-year-old can
      // picture, and teaching a bad one is worse than teaching none.
      card.add(
        label(this, MAIN_X, 460, 'No starter word for this letter yet', { size: 16 })
      );
      return;
    }

    const panelW = 620;
    const wordPanel = this.add.graphics();
    wordPanel.fillStyle(COLORS.panelLight, 1);
    wordPanel.fillRoundedRect(MAIN_X - panelW / 2, 386, panelW, 172, 24);
    card.add(wordPanel);

    // Picture on the right, word on the left: the same right-to-left reading
    // order the script uses.
    //
    // A drawn picture where there is one, the emoji otherwise. Emoji were only
    // ever a placeholder — several of these words have no emoji that means the
    // right thing (halwa, roti, wardi), and a child reads a picture of the
    // actual object far more readily than a tiny pictogram.
    const pictureX = MAIN_X + panelW / 2 - 84;
    const picture = addWordImage(this, pictureX, 462, word.id, 124);
    if (picture) {
      card.add(picture);
    } else if (word.emoji) {
      card.add(
        this.add.text(pictureX, 462, word.emoji, { fontSize: '76px' }).setOrigin(0.5)
      );
    }

    const wordFit = fitEmAlone(allWordGlyphs(), WORD_BOX.width, WORD_BOX.height);
    const glyph = wordGlyph(word.id);
    let wordGlyphImage = null;
    if (glyph) {
      wordGlyphImage = addGlyph(
        this,
        MAIN_X - 60,
        WORD_BOX.top + WORD_BOX.height / 2,
        `card-word:em${Math.round(wordFit.em)}:${word.id}`,
        glyph,
        { em: wordFit.em, color: COLORS.ink }
      );
      card.add(wordGlyphImage);
      // Last of the three, after the letter and its forms, which is the order
      // the screen teaches in: this is the shape, these are its disguises, and
      // here it is doing a job in a real word.
      popIn(this, wordGlyphImage, { delay: 620, duration: 380 });
    }

    const wordKey = clipKeys.word(word.id);
    card.add(
      makeTappable(this, this.add.zone(MAIN_X, 472, panelW, 172).setOrigin(0.5), () => {
        if (wordGlyphImage?.active) jig(this, wordGlyphImage, { angle: 6 });
        if (picture?.active) hop(this, picture, { height: 16 });
        play(wordKey);
      })
    );
    if (hasClip(wordKey)) {
      card.add(speakerIcon(this, MAIN_X - panelW / 2 + 34, 410, 22));
    }

    // letterIndex is not always 0. R, do-chashmi-he and choti-ye never begin a
    // word, so the gloss says where in the word the letter actually is.
    const position =
      word.letterIndex === 0
        ? 'starts with'
        : `has ${letter.roman} at position ${word.letterIndex + 1} of`;
    card.add(
      label(this, MAIN_X - 60, 528, `${position} · ${word.roman} — ${word.gloss}`, {
        size: 16,
      })
    );
  }
}
