import Phaser from 'phaser';
import { allLetterGlyphs, letterGlyph, lettersById, wordForLetter } from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { clipKeys, hasClip } from '../lib/audio.js';
import { addWordImage, hasWordImage, queueWordImages } from '../lib/images.js';
import { sayLetter } from '../lib/say.js';
import * as sfx from '../lib/sfx.js';
import { COLORS, familyColor, label } from '../lib/theme.js';
import QuizScene from './QuizScene.js';

/**
 * Knock on the right door.
 *
 * The same question FindLetter asks, behind a different door — and that is not
 * a criticism of it. Ten of the fifteen games in the reference apps are one of
 * about four questions in a new costume, and they are right: a three-year-old
 * who has stopped tapping tiles will keep playing for twenty minutes to see who
 * is behind the door, and every one of those minutes is another repetition of
 * the letter.
 *
 * What is behind it is the thing that makes this worth building rather than
 * recolouring FindLetter's tiles. Getting it right opens the door and the
 * letter's word walks out — بکری for ب — so the reward is not a sparkle, it is
 * the answer to "and what does that letter give you?". StartsWith asks that
 * question directly; this one answers it as a prize.
 *
 * Only letters whose word has a picture come up, because a door that opens on
 * nothing is a worse reward than no door.
 */

const DOOR = { width: 176, height: 232 };

export default class Doors extends QuizScene {
  constructor() {
    super('Doors');
    this.instruction = 'knock-door';
    this.instructionRoman = 'Which door?';
    this.tileSize = DOOR.width;
    this.tileHeight = DOOR.height;
    // Doors stand upright. A tilted one reads as falling over rather than as
    // hand-placed, which is what the tilt is for everywhere else.
    this.tileTilt = 0;
    this.tileGap = 46;
    this.choicesY = 470;
    /** @type {string[]} */
    this.pool = [];
  }

  preload() {
    super.preload();
    queueWordImages(this);
  }

  onCreated() {
    this.pool = [...lettersById.keys()].filter((id) => {
      const word = wordForLetter(id);
      return letterGlyph(id) && word && hasWordImage(word.id);
    });
    // One em for every letter in the app, so a door cannot be picked by which
    // letter happens to be drawn biggest.
    this.doorFit = fitEmAlone(allLetterGlyphs('isolated'), DOOR.width - 70, DOOR.height - 130);
    this.promptFit = fitEmAlone(allLetterGlyphs('isolated'), 150, 130);
  }

  pickTarget(previous) {
    const pool = this.pool.filter((id) => id !== previous);
    return Phaser.Utils.Array.GetRandom(pool.length ? pool : this.pool);
  }

  lineUpFor(target, count) {
    const others = Phaser.Utils.Array.Shuffle(this.pool.filter((id) => id !== target));
    return Phaser.Utils.Array.Shuffle([target, ...others.slice(0, count - 1)]);
  }

  buildPrompt(layer, target) {
    const card = this.add.container(0, 0);
    const plate = this.add.graphics();
    plate.fillStyle(COLORS.shadow, 0.18);
    plate.fillRoundedRect(-95, -74, 190, 156, 22);
    plate.fillStyle(COLORS.card, 1);
    plate.fillRoundedRect(-95, -80, 190, 156, 22);
    plate.lineStyle(5, COLORS.accent, 1);
    plate.strokeRoundedRect(-95, -80, 190, 156, 22);
    card.add(plate);
    card.add(
      addGlyph(
        this,
        0,
        -8,
        `doors-prompt:em${Math.round(this.promptFit.em)}:${target}`,
        letterGlyph(target, 'isolated'),
        { em: this.promptFit.em, color: COLORS.ink }
      )
    );
    layer.add(card);
    if (hasClip(clipKeys.letterName(target))) layer.add(this.speakerIcon(158));
  }

  /**
   * A door, drawn into the tile.
   *
   * The tile underneath is still a plain rounded card — that is what carries the
   * tap and the squash — and the door is painted over it. Cheaper than a custom
   * button shape, and the shadow and press animation come for free.
   */
  decorateTile(tile, letterId, size) {
    const colour = familyColor(lettersById.get(letterId).shapeFamily);
    const height = DOOR.height;
    const door = this.add.graphics();
    // The frame, then the leaf inset inside it, so the door reads as set into
    // a wall rather than as a coloured rectangle.
    door.fillStyle(0xf2e4c9, 1);
    door.fillRoundedRect(-size / 2, -height / 2, size, height, 14);
    door.fillStyle(colour, 1);
    door.fillRoundedRect(-size / 2 + 14, -height / 2 + 14, size - 28, height - 22, 12);
    door.lineStyle(3, COLORS.outline, 0.4);
    door.strokeRoundedRect(-size / 2 + 14, -height / 2 + 14, size - 28, height - 22, 12);
    // A handle, on the left: these doors open the way the script reads.
    door.fillStyle(0xffd166, 1);
    door.fillCircle(-size / 2 + 34, 26, 9);
    tile.add(door);
    tile.door = door;

    tile.add(
      addGlyph(
        this,
        0,
        -26,
        `doors-choice:em${Math.round(this.doorFit.em)}:${letterId}`,
        letterGlyph(letterId, 'isolated'),
        { em: this.doorFit.em, color: COLORS.onColor }
      )
    );
  }

  /** The tile is the door frame, so it must not be tinted like a card. */
  tileColor() {
    return COLORS.panelLight;
  }

  speak() {
    sayLetter(this.target, { word: false });
  }

  /**
   * Opens the door and lets the word out.
   *
   * The picture starts inside the doorway and small, then walks forward. It is
   * the whole point of the game, so it happens where the child is already
   * looking rather than somewhere else on the screen.
   */
  onCorrect(letterId) {
    const tile = this.choicesLayer.list.find((t) => t.choiceId === letterId);
    const word = wordForLetter(letterId);
    if (!tile || !word) return;

    sfx.flip();
    // The leaf swings open: a scale through zero on x, hinged at the left edge.
    this.tweens.add({
      targets: tile.door,
      scaleX: 0.12,
      duration: 320,
      ease: 'Quad.easeInOut',
    });

    const picture = addWordImage(this, tile.x, tile.y + 10, word.id, DOOR.width - 56);
    if (picture) {
      picture.setScale(picture.scale * 0.4).setDepth(30);
      this.tweens.add({
        targets: picture,
        scale: picture.scale / 0.4,
        y: tile.y - 12,
        duration: 420,
        delay: 200,
        ease: 'Back.easeOut',
      });
      this.choicesLayer.add(picture);
      this.choicesLayer.add(
        label(this, tile.x, tile.y + DOOR.height / 2 - 6, word.roman, { size: 15 })
      );
    }

    // Name and then the word, which is what the door was hiding.
    this.time.delayedCall(500, () => sayLetter(letterId));
  }
}
