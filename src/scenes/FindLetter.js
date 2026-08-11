import Phaser from 'phaser';
import {
  letterForms,
  letterGlyph,
  lettersById,
  sequenceFor,
  shapeFamilySiblings,
} from '../lib/content.js';
import { addGlyph } from '../lib/glyph.js';
import { clipKeys, hasClip, play, stopAll } from '../lib/audio.js';
import * as sfx from '../lib/sfx.js';
import { COLORS, DESIGN, familyColor, label, makeButton } from '../lib/theme.js';

/**
 * Pick the letter out of a line-up.
 *
 * The prompt is spoken when a recording exists and shown when it does not, and
 * the game is worth playing either way:
 *
 *   - **Heard.** The child maps a sound onto a shape, which is the thing
 *     flashcards cannot test.
 *   - **Seen.** The child matches shapes whose distractors come from the same
 *     shape family, so they differ only in their dots. ب ت ث پ ٹ are one
 *     skeleton with five different dot patterns, and telling them apart is the
 *     single most important discrimination in reading Urdu. That is not a
 *     consolation mode for a missing recording; it is a real exercise.
 *
 * So the same scene covers both, and it upgrades on its own as recordings are
 * made. There is no failure state: a wrong tap nudges and lets the child try
 * again, and the round only ends when they get it.
 */

/** Tiles on screen, by how many the child has got right in a row. */
const CHOICES_BY_STREAK = [2, 2, 2, 3, 3, 3, 4];

export default class FindLetter extends Phaser.Scene {
  constructor() {
    super('FindLetter');
    /** @type {string[]} */
    this.sequence = [];
    this.streak = 0;
    this.best = 0;
    /** @type {string|null} */
    this.target = null;
    /** @type {Phaser.GameObjects.Container|null} */
    this.choices = null;
    this.locked = false;
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.sequence = sequenceFor('alphabetical');
    this.streak = 0;
    this.locked = false;

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

    this.streakText = label(this, DESIGN.width - 90, 56, '', {
      size: 26,
      color: COLORS.accentCss,
    });

    this.promptLayer = this.add.container(DESIGN.width / 2, 216);
    this.choicesLayer = this.add.container(0, 0);

    // A voice must not carry on over the menu after leaving.
    this.events.once('shutdown', stopAll);

    this.newRound();
  }

  // ------------------------------------------------------------------ round

  /** Picks a target and its line-up. */
  newRound() {
    this.locked = false;
    const previous = this.target;

    // Avoid asking for the same letter twice running, which reads as the game
    // having stalled.
    const pool = this.sequence.filter((id) => id !== previous && letterGlyph(id));
    this.target = Phaser.Utils.Array.GetRandom(pool);

    const count = CHOICES_BY_STREAK[Math.min(this.streak, CHOICES_BY_STREAK.length - 1)];
    this.buildPrompt();
    this.buildChoices(this.pickLineUp(this.target, count));
    this.updateStreak();
    this.speak();
  }

  /**
   * The target plus distractors, hardest first.
   *
   * Same-family letters share a skeleton and differ only in dots, so they are
   * the distractors worth using. Families are small, so the rest is topped up
   * from anywhere.
   */
  pickLineUp(target, count) {
    const siblings = Phaser.Utils.Array.Shuffle(
      shapeFamilySiblings(target).filter((id) => letterGlyph(id))
    );
    const chosen = siblings.slice(0, count - 1);

    if (chosen.length < count - 1) {
      const rest = Phaser.Utils.Array.Shuffle(
        this.sequence.filter(
          (id) => id !== target && !chosen.includes(id) && letterGlyph(id)
        )
      );
      chosen.push(...rest.slice(0, count - 1 - chosen.length));
    }

    return Phaser.Utils.Array.Shuffle([target, ...chosen]);
  }

  /**
   * Which shape to show as the prompt when there is no recording.
   *
   * Showing the isolated form means the prompt is pixel-identical to the right
   * answer, and a child can win by comparing silhouettes without knowing they
   * are looking at a letter. So once they are a few in a row, the prompt
   * switches to another positional form: same letter, different shape. That is
   * the thing about Urdu a Latin-alphabet app never has to teach, and it turns
   * matching into recognition.
   *
   * Non-joiners only have an isolated form, so they stay a plain match.
   */
  promptForm() {
    if (this.streak < 3) return 'isolated';
    const others = letterForms(this.target).filter((f) => f !== 'isolated');
    return others.length ? Phaser.Utils.Array.GetRandom(others) : 'isolated';
  }

  /**
   * What the child is answering: a speaker to tap, or the letter itself.
   *
   * Showing the letter when there is no recording is what keeps the game
   * playable before anybody has recorded anything.
   */
  buildPrompt() {
    this.promptLayer.removeAll(true);
    const spoken = hasClip(clipKeys.letterName(this.target));

    if (spoken) {
      const button = makeButton(this, {
        x: 0,
        y: 0,
        width: 190,
        height: 150,
        color: COLORS.panelLight,
        onTap: () => this.speak(),
      });
      button.add(this.add.text(0, -8, '🔊', { fontSize: '68px' }).setOrigin(0.5));
      button.add(label(this, 0, 52, 'tap to hear again', { size: 15 }));
      this.promptLayer.add(button);
      return;
    }

    const form = this.promptForm();
    const letter = lettersById.get(this.target);

    // A solid plate with the family colour as an outline. A translucent fill
    // over the background just reads as grey and says nothing.
    const plate = this.add.graphics();
    plate.fillStyle(COLORS.panelLight, 1);
    plate.fillRoundedRect(-110, -84, 220, 168, 26);
    plate.lineStyle(4, familyColor(letter.shapeFamily), 0.9);
    plate.strokeRoundedRect(-110, -84, 220, 168, 26);
    this.promptLayer.add(plate);

    this.promptLayer.add(
      addGlyph(
        this,
        0,
        0,
        `find:prompt:${this.target}:${form}:112`,
        letterGlyph(this.target, form),
        { height: 112, color: COLORS.ink }
      )
    );
    this.promptLayer.add(
      label(this, 0, 112, form === 'isolated' ? 'find this letter' : 'same letter, which one?', {
        size: 16,
      })
    );
  }

  buildChoices(ids) {
    this.choicesLayer.removeAll(true);
    const size = 190;
    const gap = 34;
    const step = size + gap;
    const y = 500;
    // Right to left, matching how the script is read.
    const startX = DESIGN.width / 2 + ((ids.length - 1) * step) / 2;

    ids.forEach((id, index) => {
      const letter = lettersById.get(id);
      const tile = makeButton(this, {
        x: startX - index * step,
        y,
        width: size,
        height: size,
        color: familyColor(letter.shapeFamily),
        onTap: () => this.choose(id, tile),
      });
      tile.add(
        addGlyph(this, 0, 0, `find:choice:${id}:104`, letterGlyph(id, 'isolated'), {
          height: 104,
          color: COLORS.ink,
        })
      );
      // Named so a verification run can pick the right tile without hunting for
      // it by pixel position.
      tile.letterId = id;
      this.choicesLayer.add(tile);
    });
  }

  speak() {
    if (hasClip(clipKeys.letterName(this.target))) {
      play(clipKeys.letterName(this.target));
    }
  }

  updateStreak() {
    this.best = Math.max(this.best, this.streak);
    // Stars rather than a number: the audience cannot read digits yet, and a
    // row that grows is legible at a glance.
    this.streakText.setText('★'.repeat(Math.min(this.streak, 5)));
  }

  // ----------------------------------------------------------------- answer

  choose(id, tile) {
    if (this.locked) return;

    if (id !== this.target) {
      // No fail state. Nudge, dim the wrong tile, let them try again.
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
      // Re-play the prompt: the answer is still available, not withdrawn.
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
