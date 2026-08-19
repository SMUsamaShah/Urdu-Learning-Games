import Phaser from 'phaser';
import * as sfx from '../lib/sfx.js';
import { milestone, rightAnswer, wrongAnswer } from '../lib/flourish.js';
import { confetti, dance, flyStar } from '../lib/celebrate.js';
import { addStage, wellDone } from '../lib/stage.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { bob, hop, popIn, squash } from '../lib/liveliness.js';
import { sparkleBurst } from '../lib/particles.js';
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

/** Right answers in a row that earn the full-screen celebration. */
const MILESTONE = 5;
export default class QuizScene extends Phaser.Scene {
  constructor(key) {
    super(key);

    /** Tiles on screen, by streak. */
    this.choicesByStreak = [2, 2, 2, 3, 3, 3, 4];
    this.tileSize = 190;
    /** Tiles are square unless a subclass says otherwise — a door is not. */
    this.tileHeight = null;
    /**
     * Degrees of alternating tilt on the line-up. A row of perfectly square
     * tiles reads as a form; a slightly scattered row reads as something laid
     * out by hand. Zero for the screens where the choice is a thing that has an
     * upright of its own, like a door.
     */
    this.tileTilt = 2.5;
    this.tileGap = 34;
    this.choicesY = 500;
    /**
     * Low enough to clear the ribbon at its tallest. The ribbon grows downwards
     * to fit its instruction (see banner.js), and حرف ڈھونڈو makes it tall
     * enough to touch a prompt any higher than this.
     */
    this.promptY = 236;
    /**
     * Answers and prompt sit right of centre, because the garden sits at the
     * left of every screen and a four-wide line-up centred on the canvas would
     * put its last tile through it.
     */
    this.stageX = DESIGN.width / 2 + 48;
    /** Shape of a choice: 'card', or 'star' for the games whose answers float. */
    this.tileShape = 'card';
    /** The ribbon at the top. Subclasses set these; see content/ui.json. */
    this.instruction = null;
    this.instructionRoman = null;

    this.streak = 0;
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
  decorateTile(tile, id, size, height) {}

  /** Colour for a choice tile. */
  tileColor(id) {
    return COLORS.panelLight;
  }

  /** Says the prompt aloud, if there is a recording for it. */
  speak() {}

  /**
   * Called when the round has been won, before the celebration.
   *
   * For the games where the answer is worth saying only once it has been found
   * — in a sequence, naming the letter beforehand would be the whole answer.
   */
  onCorrect(id) {}

  // ----------------------------------------------------------------- scene

  /**
   * Queues this screen's painted backdrop.
   *
   * A subclass with its own `preload` must call `super.preload()`. Forgetting
   * costs the backdrop and nothing else — the scene falls back to the drawn
   * meadow — which is exactly why verify:games checks that every screen got the
   * picture it was meant to.
   */
  preload() {
    queueBackdrop(this);
  }

  create() {
    this.streak = 0;
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

    // The one invariant worth checking at runtime rather than trusting. A
    // line-up missing its answer cannot be won, and a child cannot tell that
    // from a question they simply do not know.
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
        onTap: () => this.choose(id, tile),
      });
      tile.setAngle(index % 2 ? this.tileTilt : -this.tileTilt);
      // Named so a verification run can pick a tile without hunting by pixel.
      tile.choiceId = id;
      this.decorateTile(tile, id, size, height);
      this.choicesLayer.add(tile);

      // Squashes under the finger. This happens on the pointer event itself
      // rather than after the answer has been judged, so it lands within a
      // frame of the tap — a tile that does not move when pressed feels broken
      // whatever the app does a moment later.
      tile.on('pointerdown', () => squash(this, tile));

      // Each one drops in a beat after the last, so the line-up assembles
      // itself instead of being there already. It also stops a child tapping
      // before they have looked at all of them.
      popIn(this, tile, { delay: index * 90, duration: 320 });
      this.time.delayedCall(index * 90 + 40, () => sfx.boing());

      // And then they wait, moving. A line-up of still cards is a multiple
      // choice question; a line-up that shifts a couple of pixels is a row of
      // things asking to be picked.
      this.time.delayedCall(index * 90 + 360, () => {
        if (!tile.active) return;
        tile.idle = bob(this, tile, {
          distance: 4,
          duration: 2000,
          delay: index * 220,
        });
      });
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

  /**
   * A small tappable speaker, for the prompts that already show something.
   *
   * The other shape a "hear it again" takes. `speakerButton` above is the whole
   * prompt, for when there is nothing to look at; this sits beside a picture or
   * a row of counters that is already the prompt.
   *
   * Only worth drawing where a recording exists — promising sound and playing
   * silence is worse than not offering.
   */
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
      wrongAnswer();
      this.streak = 0;
      // A wobble, never a frown. There is no fail state here and the rail must
      // not look like there is one: whatever is standing in it asks to be filled
      // rather than telling anybody off.
      this.rail?.wonder();
      // The tile stops bobbing along with the others as it dims, so a dimmed
      // choice reads as set aside rather than as still on offer.
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
    // Played on a real glockenspiel through a reverb rather than three
    // oscillator beeps. This is the most-heard sound in the app — a child
    // answers a hundred questions in a session — and it has to still be worth
    // hearing the hundredth time. See src/lib/flourish.js.
    rightAnswer();
    sfx.sparkle();
    this.streak++;
    this.onCorrect(id);

    // Fade the others so the right one is unmistakably the one that stayed, and
    // stop them fidgeting — everything that is still moving pulls the eye, and
    // at this moment the eye belongs on the answer.
    for (const other of this.choicesLayer.list) {
      if (other === tile) continue;
      if (other.idle) other.idle.stop();
      this.tweens.add({ targets: other, alpha: 0.2, duration: 220 });
    }

    // The answer performs, rather than something happening next to it: the
    // shape they just recognised is the shape that bursts, hops and dances.
    tile.idle?.stop();
    sparkleBurst(this, tile.x, tile.y, { tint: [this.tileColor(id), 0xffffff, 0xffc93c] });
    confetti(this, tile.x, tile.y);
    hop(this, tile);
    dance(this, tile);
    this.rail?.cheer();

    // Paper across the whole screen is saved for every fifth in a row. It is
    // the biggest thing this app does, and doing it on every single answer
    // would turn it into wallpaper within a minute.
    if (this.streak % MILESTONE === 0) {
      milestone();
      wellDone(this, this.stage);
    }
    // A star thrown from the answer into the ring, landing as the ring fills,
    // so getting it right and the ring growing are one event rather than two
    // things happening in different corners.
    flyStar(
      this,
      { x: tile.x, y: tile.y },
      this.stage.rail.flyTo,
      () => this.stage.rail.catch()
    );

    this.time.delayedCall(1500, () => this.newRound());
  }
}
