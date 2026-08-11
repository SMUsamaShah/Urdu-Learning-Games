import Phaser from 'phaser';
import {
  letterForms,
  letterGlyph,
  lettersById,
  sequenceFor,
  uiGlyph,
  wordForLetter,
  wordGlyph,
} from '../lib/content.js';
import { addGlyph } from '../lib/glyph.js';
import { clipKeys, hasClip, play, playSequence, stopAll } from '../lib/audio.js';
import * as sfx from '../lib/sfx.js';
import { COLORS, DESIGN, familyColor, label, makeButton } from '../lib/theme.js';

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

const FORM_LABELS = {
  isolated: 'isolated',
  initial: 'initial',
  medial: 'medial',
  final: 'final',
};

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

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.sequence = sequenceFor('alphabetical');
    this.selectedIndex = 0;

    this.buildStrip();
    this.buildCard();

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
    }).add(this.add.text(0, 0, '⌂', { fontSize: '34px' }).setOrigin(0.5));

    // Leaving mid-word should not leave a voice talking over the menu.
    this.events.once('shutdown', stopAll);

    // Say the first letter once the scene is up. Reaching here always took a
    // tap on Home, so the audio context is already unlocked.
    play(clipKeys.letterName(this.sequence[this.selectedIndex]));
  }

  /** The scrollable letter picker across the bottom, laid out right to left. */
  buildStrip() {
    const stripY = DESIGN.height - 78;
    const size = 84;
    const gap = 10;
    const step = size + gap;

    this.add
      .graphics()
      .fillStyle(0x000000, 0.22)
      .fillRect(0, stripY - size / 2 - 14, DESIGN.width, size + 28);

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
      const bg = this.add.graphics();
      bg.fillStyle(familyColor(letter.shapeFamily), 0.16);
      bg.fillRoundedRect(-size / 2, -size / 2, size, size, 16);
      cell.add(bg);

      cell.add(
        addGlyph(this, 0, 0, `letter:${letterId}:isolated:52`, glyph, {
          height: 52,
          color: COLORS.ink,
        })
      );

      cell.setSize(size, size);
      cell.setInteractive({ useHandCursor: true });
      cell.on('pointerup', () => this.select(index));

      cell.bgGraphic = bg;
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

    // Drag to scroll, with the pointer moving the strip 1:1.
    this.input.on('pointermove', (pointer) => {
      if (!pointer.isDown || pointer.y < stripY - 70) return;
      strip.x = Phaser.Math.Clamp(
        strip.x + (pointer.x - pointer.prevPosition.x),
        this.stripMin,
        this.stripMax
      );
    });
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
    const size = this.stripCellSize;
    const half = size / 2;

    this.stripCells.forEach((cell, index) => {
      const selected = index === this.selectedIndex;
      const color = familyColor(cell.letter.shapeFamily);

      cell.bgGraphic.clear();
      cell.bgGraphic.fillStyle(color, selected ? 0.9 : 0.16);
      cell.bgGraphic.fillRoundedRect(-half, -half, size, size, 16);

      // A ring as well as a fill, so the selection reads even on the lighter
      // family colours where a fill alone is low contrast.
      if (selected) {
        cell.bgGraphic.lineStyle(4, 0xffffff, 0.9);
        cell.bgGraphic.strokeRoundedRect(-half, -half, size, size, 16);
      }
      cell.setScale(selected ? 1.1 : 1);
    });
  }

  select(index) {
    if (index === this.selectedIndex) return;
    this.selectedIndex = index;
    this.highlightStrip();
    this.layoutStrip();
    this.buildCard();

    // Say the letter's name on arrival. For a child who cannot read, this is
    // the whole point of picking a letter.
    play(clipKeys.letterName(this.sequence[index]));
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
    const hero = this.add.graphics();
    hero.fillStyle(tint, 0.14);
    hero.fillRoundedRect(HERO_X - 175, 110, 350, 400, 30);
    card.add(hero);

    const isolated = letterGlyph(letterId, 'isolated');
    if (isolated) {
      card.add(
        addGlyph(this, HERO_X, 250, `letter:${letterId}:isolated:190`, isolated, {
          height: 190,
          color: COLORS.ink,
        })
      );
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
      makeTappable(this, heroZone, () => playSequence([nameKey, soundKey]))
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

    const boxW = 128;
    const boxGap = 14;
    const totalW = forms.length * boxW + (forms.length - 1) * boxGap;
    // Right-to-left, so isolated sits rightmost.
    const formsRight = MAIN_X + totalW / 2 - boxW / 2;

    forms.forEach((form, index) => {
      const glyph = letterGlyph(letterId, form);
      if (!glyph) return;
      const x = formsRight - index * (boxW + boxGap);

      const box = this.add.graphics();
      box.fillStyle(COLORS.panel, 1);
      box.fillRoundedRect(x - boxW / 2, 152, boxW, 128, 18);
      card.add(box);

      card.add(
        addGlyph(this, x, 216, `letter:${letterId}:${form}:76`, glyph, {
          height: 76,
          color: COLORS.ink,
        })
      );

      // Every form makes the same sound — that is the lesson. Tapping any of
      // them plays it.
      card.add(
        makeTappable(this, this.add.zone(x, 216, boxW, 128).setOrigin(0.5), () =>
          play(soundKey)
        )
      );

      const formName = uiGlyph(form);
      if (formName) {
        card.add(
          addGlyph(this, x, 308, `ui:${form}:30`, formName, {
            height: 30,
            color: COLORS.inkDim,
          })
        );
      }
      card.add(label(this, x, 340, FORM_LABELS[form], { size: 13 }));
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
    card.add(
      this.add
        .text(MAIN_X + panelW / 2 - 84, 462, word.emoji, { fontSize: '76px' })
        .setOrigin(0.5)
    );

    const glyph = wordGlyph(word.id);
    if (glyph) {
      card.add(
        addGlyph(this, MAIN_X - 60, 452, `word:${word.id}:82`, glyph, {
          height: 82,
          color: COLORS.ink,
        })
      );
    }

    const wordKey = clipKeys.word(word.id);
    card.add(
      makeTappable(this, this.add.zone(MAIN_X, 472, panelW, 172).setOrigin(0.5), () =>
        play(wordKey)
      )
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
