/**
 * The cub who stands on every screen.
 *
 * Looking at what preschool alphabet apps actually do, the character is not
 * decoration. It is the narrator: it points at the thing you are supposed to
 * look at, it waits while you think, and it celebrates when you get it right.
 * A screen with a character on it is a scene somebody is in; the same screen
 * without one is a form.
 *
 * Drawn procedurally, like the scenery and the confetti, because the app has to
 * install and run offline on a cheap phone and a character sprite sheet at
 * every screen density is far more bytes than a few hundred arcs.
 *
 * ## How the outline works
 *
 * Everything in this app has the heavy dark edge preschool art uses, and the
 * cub is a pile of overlapping circles and rounded rectangles, so stroking each
 * shape would draw lines straight through the middle of the character. Instead
 * each part is drawn twice: once fattened by a few pixels in flat ink, then
 * again at its real size in its real colours. The union of the fat shapes is
 * the silhouette, so the outline only ever appears on the outside.
 *
 * That is why every draw function below takes `(g, grow, forced)` rather than
 * simply drawing itself.
 */

import Phaser from 'phaser';

const FUR = 0xf6b73c;
const FUR_SHADE = 0xdd9a25;
const MANE = 0xffd166;
const MUZZLE = 0xfdecc8;
const SHIRT = 0x2f6fd0;
const SHIRT_SHADE = 0x2559a8;
const CROWN = 0xffd23f;
const NOSE = 0xc9603a;
const IRIS = 0x3f9bd8;
const PUPIL = 0x1c2233;
const INK = 0x2b3047;

/** Thickness of the dark edge, in the cub's own unbdrawn units. */
const EDGE = 5;

/** Where the head sits above the feet. Everything else is measured off this. */
const HEAD_Y = -196;

// ---------------------------------------------------------------- the parts
//
// Each takes a Graphics, how far to fatten the silhouette, and a colour that
// overrides every fill (the ink pass). Details that are inside the silhouette —
// eyes, mouth, the crown on the shirt — are skipped when a colour is forced,
// since they would be invisible under the fills that follow anyway.

function drawLegs(g, grow, forced) {
  const fill = (c) => g.fillStyle(forced ?? c, 1);
  fill(FUR);
  g.fillRoundedRect(-33 - grow, -50 - grow, 27 + grow * 2, 50 + grow * 2, 13);
  g.fillRoundedRect(6 - grow, -50 - grow, 27 + grow * 2, 50 + grow * 2, 13);
  g.fillEllipse(-19, -6, 38 + grow * 2, 20 + grow * 2);
  g.fillEllipse(19, -6, 38 + grow * 2, 20 + grow * 2);
}

function drawBody(g, grow, forced) {
  const fill = (c) => g.fillStyle(forced ?? c, 1);
  fill(SHIRT);
  g.fillRoundedRect(-47 - grow, -145 - grow, 94 + grow * 2, 106 + grow * 2, 26);
  if (forced) return;

  // A darker hem, so the shirt has a bottom edge rather than dissolving into
  // the legs.
  g.fillStyle(SHIRT_SHADE, 1);
  g.fillRoundedRect(-47, -52, 94, 13, 6);

  // The crown. Every one of these apps puts something on the character's chest,
  // and it is the cheapest way to make a shape look like somebody.
  //
  // One zigzag outline rather than three triangles: separate triangles meeting
  // at their bases merge into a lump at this size, and what should read as a
  // crown reads as a mountain.
  const crown = [
    { x: -24, y: -86 },
    { x: -24, y: -114 },
    { x: -12, y: -99 },
    { x: 0, y: -118 },
    { x: 12, y: -99 },
    { x: 24, y: -114 },
    { x: 24, y: -86 },
  ];
  g.fillStyle(CROWN, 1);
  g.fillPoints(crown, true);
  for (const peak of [crown[1], crown[3], crown[5]]) {
    g.fillCircle(peak.x, peak.y + 1, 5);
  }
}

function drawTail(g, grow, forced) {
  const fill = (c) => g.fillStyle(forced ?? c, 1);
  fill(FUR);
  // A chain of shrinking circles rather than a stroked curve: it keeps the
  // fattened silhouette trick working, and a stroked path has no thickness to
  // fatten. They have to overlap heavily — spaced further apart than their
  // radius, the fattened union is visibly scalloped and the tail reads as a
  // caterpillar.
  const bones = [
    [0, 0, 13],
    [14, 2, 12],
    [27, -2, 11],
    [38, -10, 10],
    [46, -22, 9],
    [51, -36, 9],
    [52, -50, 8],
  ];
  for (const [x, y, r] of bones) g.fillCircle(x, y, r + grow);
  fill(MANE);
  g.fillCircle(51, -66, 16 + grow);
}

function drawArm(g, grow, forced) {
  const fill = (c) => g.fillStyle(forced ?? c, 1);
  fill(FUR);
  // Starts well above the shoulder pivot so the joint is buried inside the
  // body, and the paw overlaps the sleeve rather than sitting on the end of it.
  // Otherwise the fattened-silhouette outline draws a line across both joints
  // and the arm reads as a caterpillar.
  g.fillRoundedRect(-13 - grow, -20 - grow, 26 + grow * 2, 68 + grow * 2, 13);
  g.fillCircle(0, 44, 16 + grow);
}

function drawHead(g, grow, forced) {
  const fill = (c) => g.fillStyle(forced ?? c, 1);

  // Ears sit outside the fringe, or the fringe swallows them and the head is a
  // ball again.
  fill(FUR);
  g.fillCircle(-55, -48, 26 + grow);
  g.fillCircle(55, -48, 26 + grow);
  if (!forced) {
    g.fillStyle(FUR_SHADE, 1);
    g.fillCircle(-55, -48, 13);
    g.fillCircle(55, -48, 13);
  }

  fill(FUR);
  g.fillCircle(0, 0, 62 + grow);

  // The fringe, which is what stops the head reading as a ball.
  fill(MANE);
  g.fillCircle(-38, -47, 19 + grow);
  g.fillCircle(-13, -58, 23 + grow);
  g.fillCircle(13, -58, 23 + grow);
  g.fillCircle(38, -47, 19 + grow);

  if (forced) return;

  g.fillStyle(MUZZLE, 1);
  g.fillEllipse(-16, 24, 46, 36);
  g.fillEllipse(16, 24, 46, 36);

  g.fillStyle(NOSE, 1);
  g.fillTriangle(-10, 8, 10, 8, 0, 20);
  g.fillCircle(-9, 9, 3);
  g.fillCircle(9, 9, 3);

  g.lineStyle(4, INK, 1);
  g.beginPath();
  g.arc(-9, 20, 10, 0, Math.PI);
  g.strokePath();
  g.beginPath();
  g.arc(9, 20, 10, 0, Math.PI);
  g.strokePath();
}

/**
 * One eye, as its own container so a blink is a scale rather than a redraw.
 * Collapsing it vertically leaves head-coloured fur behind, which reads as a
 * shut eye without needing an eyelid to draw.
 */
function makeEye(scene, x, y) {
  const eye = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(0, 0, 31, 35);
  g.lineStyle(3, INK, 1);
  g.strokeEllipse(0, 0, 31, 35);
  g.fillStyle(IRIS, 1);
  g.fillCircle(0, 2, 11);
  g.fillStyle(PUPIL, 1);
  g.fillCircle(0, 3, 6);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(-4, -4, 4);
  eye.add(g);
  return eye;
}

/** The party horn, uncoiled on a win. Hidden until then. */
function makeHorn(scene) {
  // At the corner of the mouth, not the middle of the face: started any
  // higher it reads as coming out of the cub's nose.
  const horn = scene.add.container(12, 34);
  const g = scene.add.graphics();
  g.fillStyle(INK, 1);
  g.fillTriangle(0, -9 - 2, 78, -20 - 2, 78, 12 + 2);
  g.fillStyle(0xef6c4d, 1);
  g.fillTriangle(0, -9, 76, -19, 76, 11);
  g.fillStyle(CROWN, 1);
  g.fillTriangle(24, -12, 50, -16, 50, 8);
  horn.add(g);
  horn.setScale(0, 1).setVisible(false);
  return horn;
}

// -------------------------------------------------------------------- build

/**
 * Adds the cub to a scene.
 *
 * The returned container has the poses on it. They are all safe to call at any
 * time and safe to call twice — a scene should be able to say "point at this"
 * on every round without tracking what the cub was doing before.
 *
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y the ground the cub stands on, not its centre.
 * @param {{scale?: number, depth?: number, facing?: 1|-1}} [options]
 */
export function addMascot(scene, x, y, options = {}) {
  const { scale = 1, depth = 4, facing = 1 } = options;

  const root = scene.add.container(x, y).setDepth(depth);
  // Facing lives on an inner container so the outer one's scale stays a plain
  // positive number that a hop or a squash tween can multiply.
  const body = scene.add.container(0, 0);
  body.setScale(facing, 1);
  root.add(body);
  root.setScale(scale);

  const tail = scene.add.container(40, -54);
  for (const pass of [
    [EDGE, INK],
    [0, null],
  ]) {
    const g = scene.add.graphics();
    drawTail(g, pass[0], pass[1]);
    tail.add(g);
  }

  const makePart = (draw) => {
    const container = scene.add.container(0, 0);
    const outline = scene.add.graphics();
    draw(outline, EDGE, INK);
    const fill = scene.add.graphics();
    draw(fill, 0, null);
    container.add([outline, fill]);
    return container;
  };

  const legs = makePart(drawLegs);
  const torso = makePart(drawBody);

  // Shoulders sit below the head, not level with it: an arm pivoting from the
  // top of the torso swings up across the cub's own chin when it points.
  const arms = [-1, 1].map((side) => {
    const pivot = scene.add.container(side * 52, -118);
    const arm = makePart(drawArm);
    pivot.add(arm);
    return pivot;
  });
  const [armLeft, armRight] = arms;

  const head = scene.add.container(0, HEAD_Y);
  head.add(makePart(drawHead));
  const eyes = [makeEye(scene, -25, -8), makeEye(scene, 25, -8)];
  head.add(eyes);
  const horn = makeHorn(scene);
  head.add(horn);

  // Tail behind everything; both arms in front of the torso so they read as
  // arms at the cub's sides rather than as slivers sticking out from behind it.
  body.add([tail, legs, torso, armLeft, head, armRight]);

  // ------------------------------------------------------------------ poses

  /** Tweens owned by whatever pose is current, killed when the next one starts. */
  let poseTweens = [];
  const own = (tween) => {
    poseTweens.push(tween);
    return tween;
  };
  const clearPose = () => {
    for (const tween of poseTweens) tween.stop();
    poseTweens = [];
  };

  const blink = scene.time.addEvent({
    delay: 3200,
    loop: true,
    callback: () => {
      scene.tweens.add({
        targets: eyes,
        scaleY: 0.08,
        duration: 70,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    },
  });

  /** Standing, breathing, tail swaying. What the cub does most of the time. */
  root.idle = () => {
    clearPose();
    own(
      scene.tweens.add({
        targets: head,
        y: HEAD_Y - 5,
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    );
    own(
      scene.tweens.add({
        targets: tail,
        angle: { from: -7, to: 9 },
        duration: 1700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    );
    own(
      scene.tweens.add({
        targets: [armLeft, armRight],
        angle: 0,
        duration: 260,
        ease: 'Quad.easeOut',
      })
    );
    horn.setVisible(false).setScale(0, 1);
  };

  /**
   * An arm out towards the answers, which is the cub's whole job during a
   * question: it says "look over there" without a word of text.
   */
  root.point = () => {
    clearPose();
    horn.setVisible(false).setScale(0, 1);
    own(
      scene.tweens.add({
        targets: head,
        y: HEAD_Y - 3,
        angle: 4,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    );
    own(
      scene.tweens.add({
        targets: armRight,
        angle: -96,
        duration: 320,
        ease: 'Back.easeOut',
      })
    );
    own(
      scene.tweens.add({
        targets: tail,
        angle: { from: -10, to: 12 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    );
  };

  /** Both arms up, a hop, and the horn. Returns to idle on its own. */
  root.cheer = () => {
    clearPose();
    horn.setVisible(true);
    own(
      scene.tweens.add({
        targets: horn,
        scaleX: 1,
        duration: 300,
        ease: 'Back.easeOut',
        yoyo: true,
        hold: 700,
        onComplete: () => horn.setVisible(false),
      })
    );
    own(
      scene.tweens.add({ targets: armLeft, angle: 148, duration: 220, ease: 'Back.easeOut' })
    );
    own(
      scene.tweens.add({ targets: armRight, angle: -148, duration: 220, ease: 'Back.easeOut' })
    );
    own(
      scene.tweens.add({
        targets: root,
        y: y - 30 * scale,
        duration: 260,
        yoyo: true,
        repeat: 2,
        ease: 'Quad.easeOut',
      })
    );
    own(
      scene.tweens.add({
        targets: tail,
        angle: { from: -20, to: 20 },
        duration: 220,
        yoyo: true,
        repeat: 7,
        ease: 'Sine.easeInOut',
      })
    );
    own(
      scene.tweens.add({
        targets: head,
        angle: { from: -6, to: 6 },
        duration: 220,
        yoyo: true,
        repeat: 7,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          head.setAngle(0);
          root.idle();
        },
      })
    );
  };

  /** A small commiserating wobble. Never a frown: there are no fail states. */
  root.wonder = () => {
    scene.tweens.add({
      targets: head,
      angle: { from: -9, to: 9 },
      duration: 160,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => head.setAngle(0),
    });
  };

  scene.events.once('shutdown', () => {
    blink.remove();
    clearPose();
  });

  root.idle();
  return root;
}

/**
 * The cub at the size and spot every game screen puts it: standing on the
 * ground at the left, clear of a row of answers across the middle.
 *
 * Centralised so the character is in the same place from screen to screen. A
 * character that jumps around between activities stops reading as the same
 * character.
 */
export function addStageMascot(scene, options = {}) {
  return addMascot(scene, 108, 648, { scale: 0.86, ...options });
}
