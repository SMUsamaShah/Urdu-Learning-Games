import Phaser from 'phaser';
import { allWordGlyphs, wordGlyph } from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import * as sfx from '../lib/sfx.js';
import { milestone, rightAnswer, wrongAnswer } from '../lib/flourish.js';
import { confetti, dance, flyStar } from '../lib/celebrate.js';
import { addStage, wellDone } from '../lib/stage.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { armDragging, carry, nearest, swimHome } from '../lib/dragging.js';
import { bob, hop, popIn, squash } from '../lib/liveliness.js';
import { sparkleBurst } from '../lib/particles.js';
import { COLORS, label, makeButton, PLAY } from '../lib/theme.js';
import { coloredWordParts } from '../lib/word-colors.js';

/* The shape every "which one is it?" game in this app has. */

/* Right answers in a row that earn the full-screen celebration. */
const MILESTONE = 5;
export default class QuizScene extends Phaser.Scene {
  constructor(key) {
    super(key);

    /* Tiles on screen, by streak. */
    this.choicesByStreak = [2, 2, 2, 3, 3, 3, 4];
    this.tileSize = 190;
    /* Tiles are square unless a subclass says otherwise — a door is not. */
    this.tileHeight = null;
    /* Degrees of alternating tilt on the line-up. */
    this.tileTilt = 2.5;
    this.tileGap = 34;
    this.choicesY = 500;
    /* Low enough to clear the ribbon at its tallest. */
    this.promptY = 236;
    /* Answers and prompt sit right of centre. */
    this.stageX = PLAY.centerX;
    /* Shape of a choice: 'card', or 'star' for the games whose answers float. */
    this.tileShape = 'card';
    /* Where a choice can be dragged to, or null for the usual tap. */
    this.dragTarget = null;
    /* The ribbon at the top. */
    this.instruction = null;
    this.instructionRoman = null;
    /* What `target` is an id of: 'letter', 'number' or 'word'. */
    this.subjectKind = 'letter';

    this.streak = 0;
    /** @type {*} */
    this.target = null;
    this.locked = false;
  }

  /** The thing to be found this round.
 * @param {*} previous Previous round's target.
 */
  pickTarget(previous) {
    throw new Error(`${this.scene.key} must implement pickTarget()`);
  }

  /* The target plus distractors, shuffled. */
  lineUpFor(target, count) {
    throw new Error(`${this.scene.key} must implement lineUpFor()`);
  }

  /* Draws the question into `layer`, which is already empty and positioned. */
  buildPrompt(layer, target) {}

  /* Draws one choice into its tile. */
  decorateTile(tile, id, size, height) {}

  /* Colour for a choice tile. */
  tileColor(id) {
    return COLORS.panelLight;
  }

  /* Says the prompt aloud, if there is a recording for it. */
  speak() {}

  /* Called when the round has been won, before the celebration. */
  onCorrect(id) {}

  /* Shows the joined answer below a row of separated letters. */
  showCompletedWord(id, { y = 110, width = 520, height = 82 } = {}) {
    const glyph = wordGlyph(id);
    if (!glyph) return null;

    const parts = coloredWordParts(glyph);
    const em = fitEmAlone(allWordGlyphs(), width, height).em;
    const joined = addGlyph(
      this,
      0,
      y,
      `completed-word:em${Math.round(em)}:${id}:coloured`,
      glyph,
      { em, color: COLORS.ink, parts }
    );
    joined.setAlpha(0);
    this.promptLayer.add(joined);
    this.tweens.add({ targets: joined, alpha: 1, delay: 100, duration: 340 });
    this.completedWord = joined;
    return joined;
  }

  /* Optional sound for a tapped answer before it is checked. */
  onChoiceTap(id) {}

  /* Queues this screen's painted backdrop. */
  preload() {
    queueBackdrop(this);
  }

  create() {
    this.streak = 0;
    if (this.dragTarget) {
      armDragging(this, {
        canLift: () => !this.locked,
        onDrop: (tile) => {
          const target = this.dragTarget();
          if (target && nearest([target], tile)) this.choose(tile.choiceId, tile);
          else swimHome(this, tile);
        },
      });
    }
    this.locked = false;
    this.target = null;

    this.stage = addStage(this, {
      hills: this.showHills !== false,
      instruction: this.instruction,
      roman: this.instructionRoman,
    });
    this.banner = this.stage.banner;
    this.rail = this.stage.rail;

    this.promptLayer = this.add.container(this.stageX, this.promptY);
    this.choicesLayer = this.add.container(0, 0);

    this.onCreated?.();
    this.newRound();
  }

  newRound() {
    this.locked = false;
    this.target = this.pickTarget(this.target);

    const count =
      this.choicesByStreak[Math.min(this.streak, this.choicesByStreak.length - 1)];
    let ids = this.lineUpFor(this.target, count);

    // The one invariant worth checking at runtime rather than trusting.
    if (!ids.includes(this.target)) {
      console.warn(
        `${this.scene.key}: line-up did not contain the answer; adding it.`
      );
      ids = Phaser.Utils.Array.Shuffle([this.target, ...ids.slice(0, count - 1)]);
    }

    // Back to the question, in case the last round ended on "well done".
    if (this.instruction) {
      this.banner?.setInstruction(this.instruction, this.instructionRoman);
    }
    this.promptLayer.removeAll(true);
    this.buildPrompt(this.promptLayer, this.target);
    this.buildChoices(ids);
    this.speak();
  }

  buildChoices(ids) {
    this.choicesLayer.removeAll(true);
    const size = this.tileSize;
    const height = this.tileHeight ?? size;
    const step = size + this.tileGap;
    // Right to left, matching how the script is read.
    const startX = this.stageX + ((ids.length - 1) * step) / 2;

    ids.forEach((id, index) => {
      const tile = makeButton(this, {
        x: startX - index * step,
        y: this.choicesY,
        width: size,
        height,
        color: this.tileColor(id),
        shape: this.tileShape,
        onTap: this.dragTarget
          ? undefined
          : () => {
              if (this.locked) return;
              this.onChoiceTap(id);
              this.choose(id, tile);
            },
        // The press tween and the drag's lift both animate scale, and `pointerout` fires the moment a drag leaves the tile.
        press: !this.dragTarget,
      });
      tile.setAngle(index % 2 ? this.tileTilt : -this.tileTilt);
      // Named so a verification run can pick a tile without hunting by pixel.
      tile.choiceId = id;
      this.decorateTile(tile, id, size, height);
      this.choicesLayer.add(tile);

      // Squashes under the finger.
      if (!this.dragTarget) tile.on('pointerdown', () => squash(this, tile));
      if (this.dragTarget) {
        tile.on('pointerdown', () => {
          if (!this.locked) this.onChoiceTap(id);
        });
      }

      // Each one drops in a beat after the last, so the line-up assembles itself instead of being there already.
      popIn(this, tile, { delay: index * 90, duration: 320 });
      this.time.delayedCall(index * 90 + 40, () => sfx.boing());

      // And then they wait, moving.
      this.time.delayedCall(index * 90 + 360, () => {
        if (!tile.active) return;
        tile.idle = bob(this, tile, {
          distance: 4,
          duration: 2000,
          delay: index * 220,
        });
        // Armed once it has landed.
        if (this.dragTarget) carry(this, tile);
      });
    });
  }

  /* A big tappable speaker, used as the prompt whenever a recording exists. */
  speakerButton(caption = 'tap to hear again') {
    const button = makeButton(this, {
      x: 0,
      y: 0,
      width: 190,
      height: 150,
      color: COLORS.panelLight,
      onTap: () => this.speak(),
    });
    button.add(this.add.text(0, -8, '🔊', { fontSize: '68px' }).setOrigin(0.5));
    button.add(label(this, 0, 52, caption, { size: 15 }));
    return button;
  }

  /* A small tappable speaker, for the prompts that already show something. */
  speakerIcon(x, size = 46) {
    const speaker = this.add
      .text(x, 0, '🔊', { fontSize: `${size}px` })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    speaker.on('pointerup', () => this.speak());
    return speaker;
  }

  choose(id, tile) {
    if (this.locked) return;

    if (id !== this.target) {
      // Against the target, not against `id`.
      wrongAnswer({ subject: { kind: this.subjectKind, id: this.target } });
      this.streak = 0;
      // A wobble, never a frown.
      this.rail?.wonder();
      // The tile stops bobbing along with the others as it dims.
      tile.idle?.stop();
      this.tweens.add({
        targets: tile,
        x: tile.x + 10,
        duration: 60,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({ targets: tile, alpha: 0.45, duration: 220 });
      // Ask again: the answer is still available, not withdrawn.
      this.time.delayedCall(260, () => this.speak());
      return;
    }

    this.locked = true;
    // Played on a real glockenspiel through a reverb rather than three oscillator beeps.
    rightAnswer({ kind: this.subjectKind, id: this.target });
    sfx.sparkle();
    this.streak++;
    this.onCorrect(id);

    // Fade the others so the right one is unmistakably the one that stayed.
    for (const other of this.choicesLayer.list) {
      if (other === tile) continue;
      if (other.idle) other.idle.stop();
      this.tweens.add({ targets: other, alpha: 0.2, duration: 220 });
    }

    // The answer performs.
    tile.idle?.stop();
    sparkleBurst(this, tile.x, tile.y, { tint: [this.tileColor(id), 0xffffff, 0xffc93c] });
    confetti(this, tile.x, tile.y);
    hop(this, tile);
    dance(this, tile);
    this.rail?.cheer();

    // Paper across the whole screen is saved for every fifth in a row.
    if (this.streak % MILESTONE === 0) {
      milestone();
      wellDone(this, this.stage);
    }
    // A star thrown from the answer into the ring.
    flyStar(
      this,
      { x: tile.x, y: tile.y },
      this.stage.rail.flyTo,
      () => this.stage.rail.catch()
    );

    this.time.delayedCall(1500, () => this.newRound());
  }
}
