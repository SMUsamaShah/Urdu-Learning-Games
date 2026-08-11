import Phaser from 'phaser';
import { stopAll } from '../lib/audio.js';
import * as sfx from '../lib/sfx.js';
import { COLORS, DESIGN, label, makeButton } from '../lib/theme.js';

/**
 * The shape every "which one is it?" game in this app has.
 *
 * Three games now ask the same question about different things — a letter, a
 * word, a quantity — and they were converging on the same forty lines of round
 * management, streak counting and answer handling. This is that, once.
 *
 * The rules it enforces are the ones that make these games suitable for a
 * three-year-old, and subclasses do not get to opt out of them:
 *
 *   - **No fail state.** A wrong answer nudges, dims that choice, and leaves
 *     the round exactly as it was. Nothing is lost except the streak, and the
 *     answer is still there to be found.
 *   - **The answer is always present.** Enforced here rather than trusted to
 *     each subclass, because a round without its answer is unwinnable and a
 *     child has no way to tell that it is the game that is broken.
 *   - **It gets harder only by getting wider.** Two choices, then three, then
 *     four, driven by how many they have got right in a row.
 *
 * A subclass supplies what a round is made of: pickTarget, lineUpFor,
 * buildPrompt and decorateTile.
 */
export default class QuizScene extends Phaser.Scene {
  constructor(key) {
    super(key);

    /** Tiles on screen, by streak. */
    this.choicesByStreak = [2, 2, 2, 3, 3, 3, 4];
    this.tileSize = 190;
    this.tileGap = 34;
    this.choicesY = 500;
    this.promptY = 216;

    this.streak = 0;
    this.best = 0;
    /** @type {*} */
    this.target = null;
    this.locked = false;
  }

  // -------------------------------------------------------------- subclass

  /**
   * The thing to be found this round.
   * @param {*} previous last round's target, to avoid asking twice running.
   */
  pickTarget(previous) {
    throw new Error(`${this.scene.key} must implement pickTarget()`);
  }

  /** The target plus distractors, shuffled. Must include the target. */
  lineUpFor(target, count) {
    throw new Error(`${this.scene.key} must implement lineUpFor()`);
  }

  /** Draws the question into `layer`, which is already empty and positioned. */
  buildPrompt(layer, target) {}

  /** Draws one choice into its tile. */
  decorateTile(tile, id, size) {}

  /** Colour for a choice tile. */
  tileColor(id) {
    return COLORS.panelLight;
  }

  /** Says the prompt aloud, if there is a recording for it. */
  speak() {}

  // ----------------------------------------------------------------- scene

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.streak = 0;
    this.locked = false;
    this.target = null;

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
    }).add(
      this.add
        .text(0, 0, '⌂', { fontSize: '34px', color: COLORS.ink })
        .setOrigin(0.5)
    );

    this.streakText = label(this, DESIGN.width - 90, 56, '', {
      size: 26,
      color: COLORS.accentCss,
    });

    this.promptLayer = this.add.container(DESIGN.width / 2, this.promptY);
    this.choicesLayer = this.add.container(0, 0);

    // Leaving mid-word should not leave a voice talking over the menu.
    this.events.once('shutdown', stopAll);

    this.onCreated?.();
    this.newRound();
  }

  newRound() {
    this.locked = false;
    this.target = this.pickTarget(this.target);

    const count =
      this.choicesByStreak[Math.min(this.streak, this.choicesByStreak.length - 1)];
    let ids = this.lineUpFor(this.target, count);

    // The one invariant worth checking at runtime rather than trusting. A
    // line-up missing its answer cannot be won, and a child cannot tell that
    // from a question they simply do not know.
    if (!ids.includes(this.target)) {
      console.warn(
        `${this.scene.key}: line-up did not contain the answer; adding it.`
      );
      ids = Phaser.Utils.Array.Shuffle([this.target, ...ids.slice(0, count - 1)]);
    }

    this.promptLayer.removeAll(true);
    this.buildPrompt(this.promptLayer, this.target);
    this.buildChoices(ids);
    this.updateStreak();
    this.speak();
  }

  buildChoices(ids) {
    this.choicesLayer.removeAll(true);
    const size = this.tileSize;
    const step = size + this.tileGap;
    // Right to left, matching how the script is read.
    const startX = DESIGN.width / 2 + ((ids.length - 1) * step) / 2;

    ids.forEach((id, index) => {
      const tile = makeButton(this, {
        x: startX - index * step,
        y: this.choicesY,
        width: size,
        height: size,
        color: this.tileColor(id),
        onTap: () => this.choose(id, tile),
      });
      // Named so a verification run can pick a tile without hunting by pixel.
      tile.choiceId = id;
      this.decorateTile(tile, id, size);
      this.choicesLayer.add(tile);
    });
  }

  /**
   * A big tappable speaker, used as the prompt whenever a recording exists.
   *
   * Always tappable to repeat: a child who missed it needs to hear it again,
   * and a question that can only be asked once is a memory test.
   */
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

  updateStreak() {
    this.best = Math.max(this.best, this.streak);
    // Stars rather than a number: the audience cannot read digits yet, and a
    // row that grows is legible at a glance.
    this.streakText.setText('★'.repeat(Math.min(this.streak, 5)));
  }

  choose(id, tile) {
    if (this.locked) return;

    if (id !== this.target) {
      sfx.nudge();
      this.streak = 0;
      this.updateStreak();
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
    sfx.correct();
    this.streak++;
    this.updateStreak();

    // Fade the others so the right one is unmistakably the one that stayed.
    for (const other of this.choicesLayer.list) {
      if (other !== tile) this.tweens.add({ targets: other, alpha: 0.2, duration: 220 });
    }
    this.tweens.add({
      targets: tile,
      scale: 1.14,
      duration: 200,
      yoyo: true,
      ease: 'Back.easeOut',
    });

    this.time.delayedCall(760, () => this.newRound());
  }
}
