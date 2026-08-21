/**
 * Plays every game and checks it behaves.
 *
 * Screenshots show a round looks right; this checks it *works* — that the
 * answer is always reachable, that a right answer advances and a wrong one does
 * not, and that nothing throws over a long sitting. The invariant that matters
 * most is the first one: if a line-up could ever be built without the target in
 * it, the round would be unwinnable and a child has no way to tell that it is
 * the game that is broken rather than themselves.
 *
 * Everything here waits on a condition rather than on a duration. Phaser
 * advances its clock by a fixed per-frame delta, so when headless WebGL renders
 * at around half the usual frame rate, game time runs at about half wall-clock
 * speed and a 760ms delayedCall can take 1.6s of real time. Sleeping a fixed
 * number of milliseconds produces a test that fails on slow machines and passes
 * on fast ones, which is worse than no test.
 *
 * Usage: npm run dev &  then  node tools/verify-games.mjs [baseUrl]
 */

import { fail, openApp, startScene, step } from './harness.mjs';

/** The scenes built on QuizScene, which all answer to the same driving. */
const QUIZZES = [
  { key: 'FindLetter', rounds: 12 },
  { key: 'WordPictures', rounds: 8 },
  { key: 'Numbers', rounds: 8 },
  { key: 'Sequence', rounds: 10 },
  { key: 'StartsWith', rounds: 8 },
  { key: 'Doors', rounds: 8 },
  { key: 'OddOne', rounds: 8 },
  { key: 'JoinWord', rounds: 8 },
];

const { page, finish } = await openApp({
  name: 'game',
  timeoutMs: 420000,
});

/**
 * Carrying something across the board with a real mouse.
 *
 * Half the screens in this app are drags now, and Phaser's drag events only
 * fire for a pointer that actually moves — emitting `pointerup` on a tile the
 * way the tap checks do would test nothing at all on those screens. So this
 * presses, moves in steps, and lets go, in page coordinates worked out from
 * where the canvas happens to be.
 *
 * The canvas is measured per call rather than once: several checks below start
 * a scene between drags, and Phaser resizes the canvas when the scale manager
 * reflows.
 */
async function dragTo(from, tx, ty, settle = 400) {
  const geo = await page.evaluate(() => {
    const box = window.__game.canvas.getBoundingClientRect();
    return { left: box.left, top: box.top, scale: box.width / window.__game.scale.width };
  });
  const at = (x, y) => [geo.left + x * geo.scale, geo.top + y * geo.scale];
  const [sx, sy] = at(from.x, from.y);
  const [ex, ey] = at(tx, ty);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(sx + ((ex - sx) * i) / 8, sy + ((ey - sy) * i) / 8);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(settle);
}

// ---------------------------------------------------------------- the menu

/**
 * Every game reachable, and every tile pointing somewhere real.
 *
 * The menu shows nine of twenty-four and hides the rest behind one tile, so
 * "the games all work" stopped being the same claim as "the games can all be
 * got to". Both failures here are silent: a tile naming a scene that is not
 * registered does nothing at all when tapped, and a game left out of both lists
 * simply is not in the app any more.
 */
step('checking every game is reachable from the menu');
const menu = await page.evaluate(async () => {
  const { FEATURED, GAMES, MORE, SPELLING, missingIcons } = await import('/src/lib/games.js');
  const { loadGlyphs } = await import('/src/lib/content.js');
  await loadGlyphs();
  const registered = window.__game.scene.scenes.map((s) => s.scene.key);
  return {
    listed: GAMES.map((g) => g.scene),
    // Three lists now: the front page, the spelling group behind its own tile,
    // and everything else behind "more games". A game in none of them is a game
    // that exists and cannot be reached.
    shown: [...FEATURED, ...SPELLING, ...MORE].map((g) => g.scene),
    unknown: GAMES.filter((g) => !registered.includes(g.scene)).map((g) => g.scene),
    missingIcons: missingIcons(),
  };
});
for (const scene of menu.unknown) fail(`the menu offers "${scene}", which is not a registered scene`);
for (const problem of menu.missingIcons) fail(`a menu tile has no glyph for its letter — ${problem}`);
const unreachable = menu.listed.filter((key) => !menu.shown.includes(key));
for (const key of unreachable) fail(`"${key}" is in the game list but on neither the menu nor the panel`);
if (!menu.unknown.length && !unreachable.length && !menu.missingIcons.length) {
  step(`${menu.listed.length} games, all reachable, every tile illustrated`);
}

const start = async (key) => {
  await startScene(page, key);
  // A beat for the entrance tweens; nothing below depends on them finishing,
  // but a tile added on a delay would otherwise be missed.
  await page.waitForTimeout(400);
};

const sceneState = (key) =>
  page.evaluate((k) => {
    const scene = window.__game.scene.getScene(k);
    return {
      target: scene.target,
      ids: scene.choicesLayer.list.map((t) => t.choiceId),
      streak: scene.streak,
    };
  }, key);

// ------------------------------------------------------------- the quizzes

for (const { key, rounds } of QUIZZES) {
  await start(key);
  step(`${key}: playing ${rounds} rounds`);

  for (let round = 0; round < rounds; round++) {
    const state = await sceneState(key);

    if (!state.ids.includes(state.target)) {
      fail(
        `${key} round ${round + 1}: the answer "${state.target}" is not among ` +
          `[${state.ids.join(', ')}] — that round is unwinnable`
      );
      break;
    }
    if (new Set(state.ids).size !== state.ids.length) {
      fail(`${key} round ${round + 1}: a choice appears twice: [${state.ids.join(', ')}]`);
      break;
    }

    await page.evaluate((k) => {
      const scene = window.__game.scene.getScene(k);
      scene.choicesLayer.list.find((t) => t.choiceId === scene.target).emit('pointerup');
    }, key);

    const moved = await page
      .waitForFunction(
        ([k, was]) => window.__game.scene.getScene(k).target !== was,
        [key, state.target],
        { timeout: 20000 }
      )
      .then(() => true)
      .catch(() => false);

    const streak = await page.evaluate(
      (k) => window.__game.scene.getScene(k).streak,
      key
    );
    if (!moved) fail(`${key} round ${round + 1}: a correct answer did not advance`);
    if (streak !== state.streak + 1) {
      fail(`${key} round ${round + 1}: streak ${state.streak} -> ${streak}, expected +1`);
    }
    if (process.exitCode) break;
  }
  if (process.exitCode) break;

  const late = await sceneState(key);
  if (late.ids.length < 3) {
    fail(`${key}: only ${late.ids.length} choices after a streak of ${late.streak}`);
  } else {
    step(`${key}: ${late.ids.length} choices at streak ${late.streak}`);
  }

  const wrong = await page.evaluate(async (k) => {
    const scene = window.__game.scene.getScene(k);
    const before = scene.target;
    scene.choicesLayer.list.find((t) => t.choiceId !== scene.target).emit('pointerup');
    // Long enough that a round change would have happened if one were coming.
    await new Promise((r) => setTimeout(r, 2500));
    return { same: scene.target === before, streak: scene.streak };
  }, key);

  if (!wrong.same) fail(`${key}: a wrong answer moved on to the next round`);
  if (wrong.streak !== 0) fail(`${key}: a wrong answer left the streak at ${wrong.streak}`);
  if (wrong.same && wrong.streak === 0) {
    step(`${key}: wrong answer kept the round and reset the streak`);
  }
}

// ---------------------------------------------------------------- balloons

if (!process.exitCode) {
  await start('Balloons');
  await page.waitForTimeout(600);
  step('Balloons: playing 6 rounds');

  for (let round = 0; round < 6; round++) {
    const state = await page.evaluate(() => {
      const scene = window.__game.scene.getScene('Balloons');
      return {
        target: scene.target,
        ids: scene.balloons.map((b) => b.letterId),
        streak: scene.streak,
      };
    });

    if (!state.ids.includes(state.target)) {
      fail(
        `balloon round ${round + 1}: no balloon carries the answer "${state.target}" ` +
          `— on screen: [${state.ids.join(', ')}]`
      );
      break;
    }

    await page.evaluate(() => {
      const scene = window.__game.scene.getScene('Balloons');
      scene.balloons.find((b) => b.letterId === scene.target).emit('pointerdown');
    });

    const moved = await page
      .waitForFunction(
        (was) => window.__game.scene.getScene('Balloons').target !== was,
        state.target,
        { timeout: 20000 }
      )
      .then(() => true)
      .catch(() => false);

    const streak = await page.evaluate(
      () => window.__game.scene.getScene('Balloons').streak
    );
    if (!moved) fail(`balloon round ${round + 1}: popping the target did not advance`);
    if (streak !== state.streak + 1) {
      fail(`balloon round ${round + 1}: streak ${state.streak} -> ${streak}`);
    }
    if (process.exitCode) break;
  }

  step('checking a wrong pop costs only the balloon');
  const wrongPop = await page.evaluate(async () => {
    const scene = window.__game.scene.getScene('Balloons');
    const before = scene.target;
    const other = scene.balloons.find((b) => b.letterId !== scene.target);
    if (!other) return { skipped: true };
    other.emit('pointerdown');
    await new Promise((r) => setTimeout(r, 2500));
    return {
      same: scene.target === before,
      streak: scene.streak,
      stillHasTarget: scene.balloons.some((b) => b.letterId === scene.target),
    };
  });
  if (wrongPop.skipped) step('only the target was on screen, skipped');
  else {
    if (!wrongPop.same) fail('a wrong pop changed the round');
    if (wrongPop.streak !== 0) fail(`a wrong pop left the streak at ${wrongPop.streak}`);
    if (!wrongPop.stillHasTarget) fail('the answer left the screen after a wrong pop');
    if (wrongPop.same && wrongPop.streak === 0 && wrongPop.stillHasTarget) {
      step('wrong pop kept the round and the answer');
    }
  }

  // Let it run untouched: balloons recycle off the top, and the target must be
  // re-launched rather than quietly disappearing.
  step('idling to check the answer is always available');
  await page.waitForTimeout(6000);
  const idle = await page.evaluate(() => {
    const scene = window.__game.scene.getScene('Balloons');
    return {
      count: scene.balloons.length,
      hasTarget: scene.balloons.some((b) => b.letterId === scene.target),
    };
  });
  if (!idle.hasTarget) fail('after idling, no balloon carries the answer');
  // A balloon destroyed without killing its rise tween still recycles itself,
  // which quietly multiplies the balloons each round until the screen is a mess.
  else if (idle.count > 8) fail(`${idle.count} balloons on screen — they are leaking`);
  else step(`${idle.count} balloons on screen, answer present`);
}

// ---------------------------------------------------------------- sequence

if (!process.exitCode) {
  await start('Sequence');
  step('Sequence: checking the run is real and the answers are not already in it');

  for (let round = 0; round < 8; round++) {
    const state = await page.evaluate(() => {
      const scene = window.__game.scene.getScene('Sequence');
      return {
        sequence: scene.sequence,
        window: scene.window(),
        gapIndex: scene.gapIndex,
        gapSlot: scene.gapSlot,
        target: scene.target,
        ids: scene.choicesLayer.list.map((t) => t.choiceId),
      };
    });

    // The caterpillar has to be a genuine run of the alphabet, or the question
    // has no answer that reasoning could reach.
    const from = state.sequence.indexOf(state.window[0]);
    const expected = state.sequence.slice(from, from + state.window.length);
    if (expected.join() !== state.window.join()) {
      fail(
        `Sequence round ${round + 1}: the caterpillar is not consecutive — ` +
          `[${state.window.join(', ')}]`
      );
      break;
    }
    if (state.window[state.gapSlot] !== state.target) {
      fail(
        `Sequence round ${round + 1}: the gap is at "${state.window[state.gapSlot]}" ` +
          `but the answer is "${state.target}"`
      );
      break;
    }

    // A distractor already sitting in the caterpillar makes the round
    // unanswerable by reasoning: the child can see that letter is elsewhere.
    const alsoShown = state.ids.filter(
      (id) => id !== state.target && state.window.includes(id)
    );
    if (alsoShown.length) {
      fail(
        `Sequence round ${round + 1}: [${alsoShown.join(', ')}] offered as answers ` +
          'while already visible in the caterpillar'
      );
      break;
    }

    await page.evaluate(() => {
      const scene = window.__game.scene.getScene('Sequence');
      scene.choicesLayer.list.find((t) => t.choiceId === scene.target).emit('pointerup');
    });
    await page
      .waitForFunction(
        (was) => window.__game.scene.getScene('Sequence').target !== was,
        state.target,
        { timeout: 20000 }
      )
      .catch(() => fail(`Sequence round ${round + 1}: a correct answer did not advance`));
    if (process.exitCode) break;
  }
  if (!process.exitCode) step('every run was consecutive and every line-up was answerable');
}

// ------------------------------------------------------------------ hidden

if (!process.exitCode) {
  await start('Hidden');
  step('Hidden: checking the hunt is findable');

  const board = () =>
    page.evaluate(() => {
      const scene = window.__game.scene.getScene('Hidden');
      return {
        target: scene.target,
        wanted: scene.wanted,
        found: scene.found,
        round: scene.round,
        letters: scene.letters.map((l) => ({
          letterId: l.letterId,
          x: l.x,
          y: l.y,
          found: l.found,
        })),
      };
    });

  const first = await board();

  const present = first.letters.filter((l) => l.letterId === first.target).length;
  if (present !== first.wanted) {
    fail(`hunting for ${first.wanted} of "${first.target}" but ${present} are on screen`);
  } else step(`${first.letters.length} letters hidden, ${present} of them "${first.target}"`);

  // Nothing may overlap. Two letters on top of each other are unreadable and
  // impossible to tap apart, which turns a hunt into a mess.
  for (let i = 0; i < first.letters.length; i++) {
    for (let j = i + 1; j < first.letters.length; j++) {
      const a = first.letters[i];
      const b = first.letters[j];
      const gap = Math.hypot(a.x - b.x, a.y - b.y);
      if (gap < 80) {
        fail(`two hidden letters are ${gap.toFixed(0)}px apart — they overlap`);
        i = first.letters.length;
        break;
      }
    }
  }

  // And every one has to be on screen. A letter placed off the edge is one the
  // round can never be finished without.
  for (const l of first.letters) {
    if (l.x < 40 || l.x > 1240 || l.y < 40 || l.y > 700) {
      fail(`a hidden letter is off screen at ${l.x.toFixed(0)},${l.y.toFixed(0)}`);
      break;
    }
  }

  const tap = (index) =>
    page.evaluate((i) => {
      window.__game.scene.getScene('Hidden').letters[i]?.emit('pointerup');
    }, index);

  const wrongAt = first.letters.findIndex((l) => l.letterId !== first.target);
  if (wrongAt > -1) {
    await tap(wrongAt);
    await page.waitForTimeout(300);
    const after = await board();
    if (after.found !== 0) fail('tapping the wrong letter counted as a find');
    else step('a wrong letter costs nothing');
  }

  step('Hidden: finding every one');
  const rightIndexes = first.letters
    .map((l, i) => (l.letterId === first.target ? i : -1))
    .filter((i) => i > -1);
  for (const i of rightIndexes) {
    await tap(i);
    await page.waitForTimeout(320);
  }
  const moved = await page
    .waitForFunction(
      (before) => window.__game.scene.getScene('Hidden').round > before,
      first.round,
      { timeout: 30000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!moved) fail('finding every hidden letter did not start a new round');
  else step('all found and a new round dealt');
}

// ------------------------------------------------------------------ bounce

if (!process.exitCode) {
  await start('Bounce');
  step('Bounce: checking the answer is always catchable');

  const state = () =>
    page.evaluate(() => {
      const scene = window.__game.scene.getScene('Bounce');
      return {
        target: scene.target,
        streak: scene.streak,
        balls: scene.balls.map((b) => ({ letterId: b.letterId, x: b.x, y: b.y })),
      };
    });

  const first = await state();
  if (!first.balls.some((b) => b.letterId === first.target)) {
    fail(`"${first.target}" is being asked for but is not bouncing`);
  } else step(`${first.balls.length} balls, the answer among them`);

  // Balls bounce for ever rather than leaving, so the answer can never go away
  // while a child is still looking at the prompt. Watched over a real second,
  // because this is a tween on the clock rather than scene state.
  await page.waitForTimeout(1200);
  const later = await state();
  const stillThere = later.balls.some((b) => b.letterId === first.target);
  if (!stillThere) fail('the answer stopped bouncing and left the screen');
  else {
    const moved = later.balls.some((b, i) => Math.abs(b.y - (first.balls[i]?.y ?? b.y)) > 4);
    if (!moved) fail('nothing is actually bouncing');
    else step('the balls bounce, and the answer stays');
  }

  // A wrong ball must stay on screen: removing it would make the answer easier
  // to find by elimination every time somebody guessed.
  const wrong = first.balls.find((b) => b.letterId !== first.target);
  if (wrong) {
    await page.evaluate((id) => {
      const scene = window.__game.scene.getScene('Bounce');
      scene.balls.find((b) => b.letterId === id)?.emit('pointerup');
    }, wrong.letterId);
    await page.waitForTimeout(400);
    const after = await state();
    if (!after.balls.some((b) => b.letterId === wrong.letterId)) {
      fail('a wrongly tapped ball was taken off the screen');
    } else step('a wrong ball keeps bouncing');
  }

  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('Bounce');
    scene.balls.find((b) => b.letterId === scene.target)?.emit('pointerup');
  });
  const advanced = await page
    .waitForFunction(
      (was) => window.__game.scene.getScene('Bounce').target !== was,
      first.target,
      { timeout: 30000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!advanced) fail('catching the right ball did not start a new round');
  else step('caught it, and a new round started');
}

// ---------------------------------------------------------- connect pairs

if (!process.exitCode) {
  await start('ConnectPairs');
  step('ConnectPairs: drawing a line from each letter to its picture');

  const geo = await page.evaluate(() => {
    const rect = window.__game.canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, scale: rect.width / window.__game.scale.width };
  });
  const toPage = (x, y) => [geo.left + x * geo.scale, geo.top + y * geo.scale];

  const state = () =>
    page.evaluate(() => {
      const scene = window.__game.scene.getScene('ConnectPairs');
      const shot = (c) => ({ letterId: c.letterId, x: c.x, y: c.y, joined: c.joined });
      return {
        round: scene.round,
        joined: scene.joined,
        letters: scene.letters.map(shot),
        pictures: scene.pictures.map(shot),
      };
    });

  const first = await state();

  // Every letter must have exactly one picture to go to, and vice versa. A
  // letter with no partner cannot be joined and the board never finishes.
  for (const letter of first.letters) {
    const matches = first.pictures.filter((p) => p.letterId === letter.letterId);
    if (matches.length !== 1) {
      fail(`"${letter.letterId}" has ${matches.length} pictures, not one`);
    }
  }
  // The two columns must not be in the same order, or every pair is simply the
  // one opposite and the board can be cleared without looking at anything.
  const sameOrder = first.letters.every(
    (l, i) => first.pictures[i]?.letterId === l.letterId
  );
  if (sameOrder && first.letters.length > 1) {
    fail('the letters and the pictures are in the same order — every pair is the one opposite');
  }
  if (!process.exitCode) step(`${first.letters.length} letters, each with one picture`);

  const dragTo = async (from, tx, ty) => {
    const [sx, sy] = toPage(from.x, from.y);
    const [ex, ey] = toPage(tx, ty);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(sx + ((ex - sx) * i) / 6, sy + ((ey - sy) * i) / 6);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
  };

  // A line onto the wrong picture must join nothing.
  if (first.letters.length > 1) {
    const letter = first.letters[0];
    const wrong = first.pictures.find((p) => p.letterId !== letter.letterId);
    await dragTo(letter, wrong.x, wrong.y);
    const after = await state();
    if (after.joined !== 0) fail('a line to the wrong picture joined anyway');
    else step('a line to the wrong picture joins nothing');
  }

  step('ConnectPairs: joining every pair');
  for (const letter of first.letters) {
    const now = await state();
    const live = now.letters.find((l) => l.letterId === letter.letterId);
    if (live.joined) continue;
    const home = now.pictures.find((p) => p.letterId === letter.letterId);
    await dragTo(live, home.x, home.y);
  }

  const done = await state();
  if (done.joined !== first.letters.length) {
    fail(`joined ${done.joined} of ${first.letters.length} pairs by dragging`);
  } else {
    step('every pair joined');
    const moved = await page
      .waitForFunction(
        (before) => window.__game.scene.getScene('ConnectPairs').round > before,
        first.round,
        { timeout: 30000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!moved) fail('joining every pair did not deal a new board');
    else step('board finished and a new one dealt');
  }
}

// --------------------------------------------------------------- in order

if (!process.exitCode) {
  await start('InOrder');
  step('InOrder: checking the run must be popped in order');

  const board = () =>
    page.evaluate(() => {
      const scene = window.__game.scene.getScene('InOrder');
      return {
        run: scene.run,
        next: scene.next,
        round: scene.round,
        sequence: scene.sequence,
        bubbles: scene.bubbles.map((b) => ({ letterId: b.letterId, popped: b.popped })),
      };
    });

  const first = await board();

  // The run has to be a real consecutive slice, and every letter in it has to
  // be on screen — a bubble missing from the middle makes the board unfinishable.
  const at = first.sequence.indexOf(first.run[0]);
  if (!first.run.every((id, i) => first.sequence[at + i] === id)) {
    fail('the run is not a consecutive slice of the alphabet');
  }
  for (const id of first.run) {
    if (!first.bubbles.some((b) => b.letterId === id)) fail(`"${id}" is in the run but not on screen`);
  }
  if (!process.exitCode) step(`${first.run.length} bubbles, in alphabet order`);

  const tap = (letterId) =>
    page.evaluate((id) => {
      window.__game.scene.getScene('InOrder').bubbles.find((b) => b.letterId === id)?.emit('pointerup');
    }, letterId);

  // Out of order must do nothing at all — and the bubble must stay, because
  // working through them until one gives is how a child finds out what next
  // means.
  if (first.run.length > 1) {
    await tap(first.run[first.run.length - 1]);
    await page.waitForTimeout(350);
    const after = await board();
    if (after.next !== 0) fail('popping the last of the run counted as the first');
    else if (after.bubbles.some((b) => b.letterId === first.run[first.run.length - 1] && b.popped)) {
      fail('an out-of-order bubble popped anyway');
    } else step('out of order does nothing, and the bubble stays');
  }

  step('InOrder: popping the whole run');
  for (const id of first.run) {
    await tap(id);
    await page.waitForTimeout(400);
  }
  const moved = await page
    .waitForFunction(
      (before) => window.__game.scene.getScene('InOrder').round > before,
      first.round,
      { timeout: 30000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!moved) fail('popping the whole run did not deal a new one');
  else step('run popped and a new one dealt');
}

// ------------------------------------------------------------------- paint

if (!process.exitCode) {
  await start('Paint');
  step('Paint: checking a finger actually paints');

  const geo = await page.evaluate(() => {
    const rect = window.__game.canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, scale: rect.width / window.__game.scale.width };
  });
  const toPage = (x, y) => [geo.left + x * geo.scale, geo.top + y * geo.scale];

  const before = await page.evaluate(() => {
    const scene = window.__game.scene.getScene('Paint');
    return { touched: scene.touched, centre: scene.centre, letterId: scene.letterId };
  });
  if (before.touched) fail('the letter was already painted before anything touched it');

  // A real stroke down the middle of the letter. Painting is done by writing
  // into a canvas texture from pointer events, so poking scene state would
  // check nothing that a child's finger goes through.
  const [sx, sy] = toPage(before.centre.x, before.centre.y - 120);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    const [x, y] = toPage(before.centre.x, before.centre.y - 120 + (240 * i) / 8);
    await page.mouse.move(x, y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(200);

  const painted = await page.evaluate(() => {
    const scene = window.__game.scene.getScene('Paint');
    // Count how many pixels are neither transparent nor the white the letter
    // starts as. Anything else can only have come from the brush.
    const ctx = scene.canvas.context;
    const { width, height } = scene.canvas;
    const { data } = ctx.getImageData(0, 0, width, height);
    let coloured = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 20) continue;
      if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) continue;
      coloured++;
    }
    return { touched: scene.touched, coloured };
  });
  if (!painted.touched) fail('a stroke across the letter did not register as painting');
  else if (painted.coloured < 500) fail(`only ${painted.coloured} pixels took any colour`);
  else step(`${painted.coloured} pixels painted inside the letter`);

  // Next must move on to a different letter, and the new one must be clean.
  await page.evaluate(() => window.__game.scene.getScene('Paint').nextLetter());
  const stepped = await page
    .waitForFunction(
      (was) => {
        const scene = window.__game.scene.getScene('Paint');
        return scene.letterId !== was && scene.touched === false;
      },
      before.letterId,
      { timeout: 20000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!stepped) fail('Next did not move on to a clean letter');
  else step('Next moves on, and the new letter starts clean');
}

// ---------------------------------------------------------------- baskets

if (!process.exitCode) {
  await start('Baskets');
  step('Baskets: checking the pile can be sorted');

  const geo = await page.evaluate(() => {
    const rect = window.__game.canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, scale: rect.width / window.__game.scale.width };
  });
  const toPage = (x, y) => [geo.left + x * geo.scale, geo.top + y * geo.scale];

  const state = () =>
    page.evaluate(() => {
      const scene = window.__game.scene.getScene('Baskets');
      return {
        kinds: scene.kinds,
        round: scene.round,
        sorted: scene.sorted,
        tiles: scene.tiles.map((t) => ({ letterId: t.letterId, x: t.x, y: t.y, sorted: t.sorted })),
        baskets: scene.baskets.list.map((b) => ({ letterId: b.letterId, x: b.x, y: b.y })),
      };
    });

  const first = await state();

  // Both baskets must have something to receive. An empty basket at the end
  // reads as a mistake rather than as a finished job.
  for (const kind of first.kinds) {
    if (!first.tiles.some((t) => t.letterId === kind)) {
      fail(`nothing in the pile belongs in the "${kind}" basket`);
    }
  }
  // And every tile must belong somewhere, or the pile can never be cleared.
  for (const tile of first.tiles) {
    if (!first.kinds.includes(tile.letterId)) {
      fail(`"${tile.letterId}" is in the pile but neither basket takes it`);
    }
  }
  if (!process.exitCode) {
    step(`${first.tiles.length} letters, two baskets (${first.kinds.join(' and ')})`);
  }

  const dragTo = async (from, tx, ty) => {
    const [sx, sy] = toPage(from.x, from.y);
    const [ex, ey] = toPage(tx, ty);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(sx + ((ex - sx) * i) / 6, sy + ((ey - sy) * i) / 6);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(350);
  };

  // The wrong basket must refuse it. Dropping ب into the ت basket and having it
  // stick would make the whole game unwinnable-by-accident rather than a sort.
  const tile = first.tiles[0];
  const wrongBasket = first.baskets.find((b) => b.letterId !== tile.letterId);
  if (wrongBasket) {
    await dragTo(tile, wrongBasket.x, wrongBasket.y);
    const after = await state();
    if (after.sorted !== 0) fail('the wrong basket accepted a letter');
    else step('the wrong basket refuses it');
  }

  step('Baskets: sorting the whole pile');
  for (let i = 0; i < first.tiles.length; i++) {
    const now = await state();
    const next = now.tiles[i];
    if (next.sorted) continue;
    const home = now.baskets.find((b) => b.letterId === next.letterId);
    await dragTo(next, home.x, home.y);
  }
  const done = await state();
  if (done.sorted !== first.tiles.length) {
    fail(`sorted ${done.sorted} of ${first.tiles.length} letters into their baskets`);
  } else {
    step('every letter sorted');
    const moved = await page
      .waitForFunction(
        (before) => window.__game.scene.getScene('Baskets').round > before,
        first.round,
        { timeout: 30000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!moved) fail('clearing the pile did not deal a new one');
    else step('pile cleared and a new one dealt');
  }
}

// ------------------------------------------------------------ letter puzzle

if (!process.exitCode) {
  await start('LetterPuzzle');
  step('LetterPuzzle: dragging the pieces home');

  // The only screen whose input is a drag, so this is driven with a real
  // mouse.down / move / up against the canvas rather than by poking scene
  // state. A snap that only works when the scene moves the piece itself would
  // pass every state-poking check and fail for every child.
  const geo = await page.evaluate(() => {
    const rect = window.__game.canvas.getBoundingClientRect();
    const scale = rect.width / window.__game.scale.width;
    return { left: rect.left, top: rect.top, scale };
  });
  const toPage = (x, y) => [geo.left + x * geo.scale, geo.top + y * geo.scale];

  const state = () =>
    page.evaluate(() => {
      const scene = window.__game.scene.getScene('LetterPuzzle');
      return {
        round: scene.round,
        placed: scene.placed,
        pieces: scene.pieces.map((p) => ({
          x: p.x,
          y: p.y,
          homeX: p.homeX,
          homeY: p.homeY,
          placed: p.placed,
        })),
      };
    });

  const first = await state();
  if (first.pieces.length < 2) fail(`a puzzle with ${first.pieces.length} piece(s) is not a puzzle`);
  else step(`${first.pieces.length} pieces to place`);

  const dragTo = async (piece, tx, ty) => {
    const [sx, sy] = toPage(piece.x, piece.y);
    const [ex, ey] = toPage(tx, ty);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    // Several steps: Phaser starts a drag on movement, and one jump from
    // grab to release is not a drag as far as the input manager is concerned.
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(sx + ((ex - sx) * i) / 6, sy + ((ey - sy) * i) / 6);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
  };

  // Dropped far from home, a piece must go back to the tray rather than stick
  // where it landed — a scatter of near-misses over the ghost makes the letter
  // impossible to read.
  await dragTo(first.pieces[0], 300, 250);
  // Waited for rather than sampled after a pause. The piece flies home on a
  // tween, which runs on Phaser's clock — and headless that clock is roughly
  // half wall-clock speed, so a fixed 300ms sometimes caught the piece still
  // in the air and reported a broken game.
  const wentBack = await page
    .waitForFunction(
      (home) => {
        const piece = window.__game.scene.getScene('LetterPuzzle').pieces[0];
        return Math.abs(piece.y - home) <= 4;
      },
      first.pieces[0].y,
      { timeout: 15000 }
    )
    .then(() => true)
    .catch(() => false);
  const strayed = await state();
  if (strayed.placed !== 0) fail('a piece dropped nowhere near its slot counted as placed');
  else if (!wentBack) fail('a wrongly dropped piece did not go back to the tray');
  else step('a piece dropped away from its slot goes back');

  step('LetterPuzzle: placing every piece');
  for (let i = 0; i < first.pieces.length; i++) {
    const now = await state();
    const piece = now.pieces[i];
    if (piece.placed) continue;
    await dragTo(piece, piece.homeX, piece.homeY);
  }

  const done = await state();
  if (done.placed !== first.pieces.length) {
    fail(`placed ${done.placed} of ${first.pieces.length} pieces by dragging them home`);
  } else {
    step('every piece snapped home');
    const moved = await page
      .waitForFunction(
        (before) => window.__game.scene.getScene('LetterPuzzle').round > before,
        first.round,
        { timeout: 30000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!moved) fail('completing the letter did not move on to the next');
    else step('letter finished and the next one dealt');
  }
}

// ------------------------------------------------------------- caterpillar

for (const KEY of ['Caterpillar', 'NumberLine']) {
  if (process.exitCode) break;
  await start(KEY);
  step(`${KEY}: checking the run and the tray agree`);

  const board = () =>
    page.evaluate((k) => {
      const scene = window.__game.scene.getScene(k);
      return {
        run: scene.run,
        holes: scene.holes,
        filled: scene.filled,
        round: scene.round,
        tray: scene.tray.list.map((t) => ({ letterId: t.letterId, used: t.used })),
        sequence: scene.sequence,
      };
    }, KEY);

  const first = await board();

  // The run has to be a real consecutive slice of the alphabet, or the game is
  // teaching an order that does not exist.
  const at = first.sequence.indexOf(first.run[0]);
  const consecutive =
    at > -1 && first.run.every((id, i) => first.sequence[at + i] === id);
  if (!consecutive) fail('the run is not a consecutive slice of the alphabet');

  // Every hole's answer must be in the tray. A hole whose letter was never
  // offered cannot be filled, and the round would simply stop.
  const trayIds = first.tray.map((t) => t.letterId);
  for (const hole of first.holes) {
    if (!trayIds.includes(first.run[hole])) {
      fail(`"${first.run[hole]}" is a hole but is not in the tray`);
    }
  }
  // And the tray must offer more than the answers, or every tap is right and
  // there is nothing being asked.
  if (trayIds.length <= first.holes.length) {
    fail(`the tray has ${trayIds.length} letters for ${first.holes.length} holes — no choice at all`);
  }
  // Holes never at either end: those are answerable by carrying on, which is
  // the easier question Sequence already asks.
  if (first.holes.includes(0) || first.holes.includes(first.run.length - 1)) {
    fail('a hole is at the end of the run');
  }
  if (!process.exitCode) {
    step(`${first.run.length} in the run, ${first.holes.length} holes, ${trayIds.length} in the tray`);
  }

  /** Where a tray letter and the gap being asked for are, on the board. */
  const places = (letterId) =>
    page.evaluate(([k, id]) => {
      const scene = window.__game.scene.getScene(k);
      const tile = scene.tray.list.find((t) => t.letterId === id && !t.used);
      const hole = scene.segments.find((seg) => seg.index === scene.nextHole);
      return tile && hole ? { tile: { x: tile.x, y: tile.y }, hole: { x: hole.x, y: hole.y } } : null;
    }, [KEY, letterId]);

  /** Carries a tray letter into the gap the board is asking for. */
  const dragTray = async (letterId) => {
    const where = await places(letterId);
    if (!where) return false;
    await dragTo(where.tile, where.hole.x, where.hole.y);
    return true;
  };

  // A tap does nothing at all now. Worth asserting rather than assuming: the
  // tap handler is one line to add back by accident, and a game that quietly
  // accepts both is a game nobody notices has stopped being a drag.
  const tapped = await page.evaluate((k) => {
    const scene = window.__game.scene.getScene(k);
    const tile = scene.tray.list.find((t) => !t.used);
    if (!tile) return false;
    tile.emit('pointerup');
    return true;
  }, KEY);
  await page.waitForTimeout(400);
  if (tapped && (await board()).filled !== 0) {
    fail(`${KEY}: tapping a tray letter filled a hole — these are dragged now`);
  }

  // A wrong tray letter must not fill the hole it was aimed at.
  const wrong = trayIds.find((id) => !first.holes.some((h) => first.run[h] === id));
  if (wrong) {
    await dragTray(wrong);
    const after = await board();
    if (after.filled !== 0) fail('a wrong tray letter filled a hole');
    else step('a wrong tray letter fills nothing');
  }

  // Holes fill in reading order, so the answers have to be given in that order.
  step(`${KEY}: filling every hole`);
  for (const hole of first.holes) {
    await dragTray(first.run[hole]);
    await page.waitForTimeout(400);
  }
  const moved = await page
    .waitForFunction(
      ([k, before]) => window.__game.scene.getScene(k).round > before,
      [KEY, first.round],
      { timeout: 30000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!moved) fail('filling every hole did not start a new run');
  else step('run completed and a new one dealt');
}

// ----------------------------------------------------------------- tap all

if (!process.exitCode) {
  await start('TapAll');
  step('TapAll: checking the board can be cleared');

  const board = () =>
    page.evaluate(() => {
      const scene = window.__game.scene.getScene('TapAll');
      return {
        target: scene.target,
        wanted: scene.wanted,
        round: scene.round,
        found: scene.found,
        tiles: scene.tiles.map((t) => ({ letterId: t.letterId, done: t.done })),
      };
    });

  const first = await board();

  // The invariant this game turns on: the number of targets actually on the
  // board must equal the number it is waiting for. One short and the round can
  // never be finished, and a child has no way to tell the board is unwinnable
  // rather than that they have missed one.
  const present = first.tiles.filter((t) => t.letterId === first.target).length;
  if (present !== first.wanted) {
    fail(`waiting for ${first.wanted} of "${first.target}" but ${present} are on the board`);
  } else if (present < 2) {
    fail('a "find them all" round with fewer than two to find is just find-the-letter');
  } else {
    step(`${first.tiles.length} tiles, ${present} of them "${first.target}"`);
  }

  const tapIndex = (index) =>
    page.evaluate((i) => {
      window.__game.scene.getScene('TapAll').tiles[i]?.emit('pointerup');
    }, index);

  // A wrong tap must cost nothing: no progress, and the round stays open.
  const wrongAt = first.tiles.findIndex((t) => t.letterId !== first.target);
  if (wrongAt > -1) {
    await tapIndex(wrongAt);
    await page.waitForTimeout(350);
    const after = await board();
    if (after.found !== 0) fail('a wrong tap counted towards finding them all');
    else if (after.round !== first.round) fail('a wrong tap ended the round');
    else step('a wrong tap costs nothing');
  }

  // Tapping the same target twice must not count twice, or the round can be
  // finished without finding the rest.
  const rightIndexes = first.tiles
    .map((t, i) => (t.letterId === first.target ? i : -1))
    .filter((i) => i > -1);
  await tapIndex(rightIndexes[0]);
  await page.waitForTimeout(300);
  await tapIndex(rightIndexes[0]);
  await page.waitForTimeout(300);
  const twice = await board();
  if (twice.found !== 1) fail(`tapping one tile twice counted ${twice.found} times`);
  else step('tapping the same one twice counts once');

  for (const index of rightIndexes.slice(1)) {
    await tapIndex(index);
    await page.waitForTimeout(250);
  }
  const moved = await page
    .waitForFunction(
      (before) => window.__game.scene.getScene('TapAll').round > before,
      first.round,
      { timeout: 30000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!moved) fail('finding every one did not start a new round');
  else step('board cleared and a new one dealt');
}

// -------------------------------------------------------------- join forms

if (!process.exitCode) {
  await start('JoinForms');
  step('JoinForms: checking the board is joinable');

  const board = () =>
    page.evaluate(() => {
      const scene = window.__game.scene.getScene('JoinForms');
      return {
        pool: scene.pool.length,
        cards: scene.cards.map((c) => ({
          letterId: c.letterId,
          form: c.form,
          row: c.row,
          done: c.done,
        })),
        joined: scene.joined,
        round: scene.round,
      };
    });

  const first = await board();

  // The empty board is a real failure mode and a quiet one. `letterForms`
  // returns the form *names*, and reading it as though it were a map of them
  // gave every letter no partner: the pool came out empty, the board came up
  // with nothing on it, and not one thing threw. Only a screenshot caught it.
  if (first.pool === 0) fail('no letters have a second form — the board is empty');
  else if (first.cards.length === 0) fail('the board was dealt with no cards on it');
  else step(`${first.pool} letters available, ${first.cards.length} cards dealt`);

  // Every card must have exactly one partner: the same letter, on the other
  // row, wearing a different face. An odd card out cannot be joined, and a
  // child has no way to tell that it is the board that is stuck.
  const byLetter = new Map();
  for (const card of first.cards) {
    byLetter.set(card.letterId, [...(byLetter.get(card.letterId) ?? []), card]);
  }
  for (const [letterId, cards] of byLetter) {
    if (cards.length !== 2) {
      fail(`"${letterId}" is on the board ${cards.length} times, not twice`);
      continue;
    }
    const [a, b] = cards;
    if (a.row === b.row) fail(`both "${letterId}" cards are on row ${a.row}`);
    if (a.form === b.form) fail(`both "${letterId}" cards show the ${a.form} form`);
    if (![a.form, b.form].includes('isolated')) {
      fail(`neither "${letterId}" card is the isolated form`);
    }
  }
  if (!process.exitCode) step(`${byLetter.size} pairs, each one letter in two faces`);

  const tap = (letterId, row) =>
    page.evaluate(
      ([id, r]) => {
        const scene = window.__game.scene.getScene('JoinForms');
        scene.cards.find((c) => c.letterId === id && c.row === r)?.emit('pointerup');
      },
      [letterId, row]
    );

  // A wrong pair must cost nothing: no card leaves the board, and the one that
  // was held is put back down rather than staying stuck to the finger.
  const letters = [...byLetter.keys()];
  if (letters.length >= 2) {
    await tap(letters[0], 0);
    await tap(letters[1], 1);
    await page.waitForTimeout(400);
    const after = await board();
    if (after.joined !== 0) fail('a mismatched pair counted as joined');
    else if (after.cards.some((c) => c.done)) fail('a mismatched pair took cards off the board');
    else {
      const held = await page.evaluate(
        () => window.__game.scene.getScene('JoinForms').picked !== null
      );
      if (held) fail('a mismatched pair left a card still held');
      else step('a wrong pair costs nothing and clears the selection');
    }
  }

  // And solving it finishes the board and deals a new one.
  step('JoinForms: joining every pair');
  for (const letterId of letters) {
    await tap(letterId, 0);
    await tap(letterId, 1);
    await page.waitForTimeout(220);
  }
  const moved = await page
    .waitForFunction(
      (before) => window.__game.scene.getScene('JoinForms').round > before,
      first.round,
      { timeout: 30000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!moved) fail('joining every pair did not start a new board');
  else step('board finished and a new one dealt');
}

// ------------------------------------------------------------------ memory

if (!process.exitCode) {
  await start('Memory');
  step('Memory: checking the board is solvable');

  const board = () =>
    page.evaluate(() => {
      const scene = window.__game.scene.getScene('Memory');
      return {
        cards: scene.cards.map((c) => ({
          pairId: c.pairId,
          kind: c.kind,
          faceUp: c.faceUp,
          done: c.done,
        })),
        matched: scene.matched,
        round: scene.round,
      };
    });

  const first = await board();

  // The invariant that makes this game playable at all: every card has exactly
  // one partner, and a pair is one letter and one picture. A board with an odd
  // card out cannot be finished, and the child has no way to tell that it is
  // the game that is stuck rather than themselves.
  const counts = new Map();
  for (const card of first.cards) {
    counts.set(card.pairId, [...(counts.get(card.pairId) ?? []), card.kind]);
  }
  for (const [pairId, kinds] of counts) {
    if (kinds.length !== 2) {
      fail(`"${pairId}" is on the board ${kinds.length} times, not twice`);
      continue;
    }
    const sorted = [...kinds].sort().join(',');
    if (sorted !== 'letter,picture') {
      fail(`"${pairId}" is a ${sorted} pair, not a letter and a picture`);
    }
  }
  if (!process.exitCode) step(`${counts.size} pairs, each a letter and a picture`);

  /** Waits for the board to accept input again. */
  const settle = () =>
    page.waitForFunction(() => !window.__game.scene.getScene('Memory').locked, null, {
      timeout: 20000,
    });

  /** Turns two cards over by index. */
  const turnTwo = async (a, b) => {
    await settle();
    await page.evaluate(([i, j]) => {
      const scene = window.__game.scene.getScene('Memory');
      scene.cards[i].emit('pointerup');
      scene.cards[j].emit('pointerup');
    }, [a, b]);
  };

  // A wrong pair must turn back over, or the board solves itself by attrition.
  const wrongA = first.cards.findIndex((c) => c.kind === 'letter');
  const wrongB = first.cards.findIndex(
    (c, i) => i !== wrongA && c.pairId !== first.cards[wrongA].pairId
  );
  if (wrongB === -1) {
    step('only one pair on the board, skipping the mismatch check');
  } else {
    await turnTwo(wrongA, wrongB);
    const turnedBack = await page
      .waitForFunction(
        ([i, j]) => {
          const scene = window.__game.scene.getScene('Memory');
          return !scene.cards[i].faceUp && !scene.cards[j].faceUp && !scene.locked;
        },
        [wrongA, wrongB],
        { timeout: 20000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!turnedBack) fail('a mismatched pair did not turn back over');
    else step('mismatched pair turned back over');
  }

  // Solve the whole board. Finishing has to start a new one, or the game ends
  // in a dead screen.
  step('Memory: solving the board');
  const solved = await (async () => {
    for (let i = 0; i < 12; i++) {
      const state = await board();
      const next = state.cards.findIndex((c) => !c.done);
      if (next === -1) return true;
      const partner = state.cards.findIndex(
        (c, index) => index !== next && c.pairId === state.cards[next].pairId
      );
      await turnTwo(next, partner);
      const took = await page
        .waitForFunction(
          ([i, j]) => {
            const scene = window.__game.scene.getScene('Memory');
            return scene.cards[i].done && scene.cards[j].done;
          },
          [next, partner],
          { timeout: 20000 }
        )
        .then(() => true)
        .catch(() => false);
      if (!took) {
        fail(`a matching pair was not accepted (cards ${next} and ${partner})`);
        return false;
      }
    }
    return false;
  })();

  if (solved) {
    const moved = await page
      .waitForFunction(
        (was) => {
          const scene = window.__game.scene.getScene('Memory');
          return scene.round > was && scene.matched === 0 && !scene.locked;
        },
        first.round,
        { timeout: 30000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!moved) fail('finishing the board did not start a new one');
    else step('board finished and a new one dealt');
  }
}

// --- Building a whole word --------------------------------------------------
//
// The quiz games above are all one tap; this one is a word's worth of taps in a
// fixed order, and the order is the game. Three things can go wrong quietly: the
// slot being asked for could be the wrong end of the word (Urdu is written right
// to left and the row is built from the right), a wrong letter could be accepted,
// and the joined word at the end could fail to appear — leaving the child with a
// row of separate letters and no sign that they spell anything.

step('BuildWord: spelling a word from its letters');
await start('BuildWord');
await page.waitForTimeout(900);

const deal = await page.evaluate(() => {
  const scene = window.__game.scene.getScene('BuildWord');
  return {
    word: scene.wordId,
    letters: scene.letters,
    tray: scene.tray.list.map((t) => t.letterId),
    slotX: scene.slots.map((slot) => Math.round(slot.x)),
  };
});

if (!deal.letters?.length) fail('BuildWord dealt no letters at all');
else {
  // Every letter of the word has to be in the tray, or the round cannot be
  // finished. The tray may hold more — the distractors — but never fewer.
  const missing = deal.letters.filter(
    (id, i) =>
      deal.tray.filter((t) => t === id).length <
      deal.letters.slice(0, i + 1).filter((l) => l === id).length
  );
  if (missing.length) fail(`BuildWord wants ${missing.join()} and the tray has none`);

  // The first letter of the word is the rightmost slot. Getting this backwards
  // would still play — it would just teach a child to spell left to right.
  const rightmost = Math.max(...deal.slotX);
  if (deal.slotX[0] !== rightmost) {
    fail(
      `BuildWord puts the word's first letter at x=${deal.slotX[0]}, not at the ` +
        `right-hand end (${rightmost})`
    );
  } else step(`  ${deal.letters.length} letters, first one at the right-hand end`);
}

/** Where a tray letter and a slot are, right now. */
const spellingBoard = () =>
  page.evaluate(() => {
    const scene = window.__game.scene.getScene('BuildWord');
    return {
      filled: scene.filled,
      total: scene.slots.length,
      tray: scene.tray.list.map((t) => ({
        id: t.letterId,
        used: t.used,
        x: t.x,
        y: t.y,
        homeX: Math.round(t.homeX ?? -1),
      })),
      slots: scene.slots.map((slot) => ({
        id: slot.letterId,
        x: slot.x,
        y: slot.y,
        filled: Boolean(slot.filledWith),
      })),
    };
  });

// A tap does nothing. This screen was a tap game a commit ago and the handler
// is one line to reintroduce, so it is asserted rather than assumed.
await page.evaluate(() => {
  window.__game.scene.getScene('BuildWord').tray.list.find((t) => !t.used)?.emit('pointerup');
});
await page.waitForTimeout(400);
if ((await spellingBoard()).filled !== 0) {
  fail('BuildWord: tapping a tray letter filled a slot — these are dragged now');
} else step('  a tap does nothing');

// Dropped in mid-air: nothing filled, and the letter is back where it started.
// This is the commonest thing a small finger does and the one that loses a tile
// off the board entirely if swimHome is wrong.
let board = await spellingBoard();
const stray = board.tray.find((t) => !t.used);
await dragTo(stray, 360, 300);
board = await spellingBoard();
const returned = board.tray.find((t) => t.id === stray.id);
if (board.filled !== 0) fail('BuildWord: a letter dropped in mid-air filled a slot');
else if (Math.round(returned.x) !== returned.homeX) {
  fail(`BuildWord: a letter dropped in mid-air was left at x=${Math.round(returned.x)}, not back at ${returned.homeX}`);
} else step('  a letter dropped in mid-air goes back to the tray');

// The wrong slot refuses it.
board = await spellingBoard();
const carried = board.tray.find((t) => !t.used);
const wrongSlot = board.slots.find((slot) => slot.id !== carried.id && !slot.filled);
if (wrongSlot) {
  await dragTo(carried, wrongSlot.x, wrongSlot.y);
  board = await spellingBoard();
  if (board.filled !== 0) fail('BuildWord: a letter went into the wrong slot');
  else step('  the wrong slot refuses it');
}

// And then the whole word. Deliberately last letter first: a letter belongs in
// its own slot whichever order it is placed in, and a game that insisted on
// right-to-left would fail here.
for (const index of [...deal.letters.keys()].reverse()) {
  board = await spellingBoard();
  const slot = board.slots[index];
  const tile = board.tray.find((t) => t.id === slot.id && !t.used);
  if (!tile || slot.filled) continue;
  await dragTo(tile, slot.x, slot.y, 500);
}

const done = await page.evaluate(() => {
  const scene = window.__game.scene.getScene('BuildWord');
  const keys = scene.board.list.map((item) => item.texture?.key).filter(Boolean);
  return {
    filled: scene.filled,
    total: scene.slots.length,
    joined: keys.some((k) => k.startsWith('build-word:')),
  };
});
if (done.filled !== done.total) {
  fail(`BuildWord: ${done.filled} of ${done.total} slots filled after carrying every letter`);
} else if (!done.joined) {
  fail('BuildWord: the word was spelled and the joined word never appeared');
} else step(`  spelled back to front, and ${deal.word} appeared joined up`);

// --- The missing letter is carried into its hole -----------------------------
//
// FillLetter is a QuizScene, so everything about picking an answer is already
// covered by the loop at the top of this file — except that this one is the
// only quiz whose answer is dragged rather than tapped. That seam
// (`dragTarget` in QuizScene) is what gets checked here.

step('FillLetter: dropping the letter into the gap');
await start('FillLetter');
await page.waitForTimeout(900);

const gap = () =>
  page.evaluate(() => {
    const scene = window.__game.scene.getScene('FillLetter');
    return {
      target: scene.target,
      streak: scene.streak,
      drop: scene.dragTarget(),
      tiles: scene.choicesLayer.list.map((t) => ({
        id: t.choiceId,
        x: t.x,
        y: t.y,
        homeX: Math.round(t.homeX ?? -1),
      })),
    };
  });

let fill = await gap();
if (!fill.tiles.length) fail('FillLetter offered no choices');
else {
  await page.evaluate(() => {
    window.__game.scene.getScene('FillLetter').choicesLayer.list[0].emit('pointerup');
  });
  await page.waitForTimeout(400);
  if ((await gap()).streak !== 0) fail('FillLetter: tapping a choice answered the round');
  else step('  a tap does nothing');

  const loose = fill.tiles[0];
  await dragTo(loose, 300, 660);
  fill = await gap();
  const back = fill.tiles.find((t) => t.id === loose.id);
  if (fill.streak !== 0) fail('FillLetter: a choice dropped in mid-air was accepted');
  else if (Math.round(back.x) !== back.homeX) {
    fail(`FillLetter: a choice dropped in mid-air was left at x=${Math.round(back.x)}`);
  } else step('  a choice dropped in mid-air goes back');

  const right = fill.tiles.find((t) => t.id === fill.target);
  await dragTo(right, fill.drop.x, fill.drop.y, 900);
  if ((await gap()).streak !== 1) fail('FillLetter: the right letter dropped in the gap was not accepted');
  else step('  and the right one, dropped in the gap, answers the round');
}

// --- The furniture stays on the screen ---------------------------------------
//
// Props are baked into a texture whose size is worked out from the drawing, and
// getting that arithmetic wrong does not throw — it silently crops. The first
// caterpillar lost the side of its head that way, and then, once the texture
// was big enough, ran the head off the right of the canvas instead. Both are
// invisible unless somebody opens that one screen.

step('every prop fits on the screen');

// Hand-written, and it has to stay that way — a prop is found by walking a
// live scene, so there is no list to read this off. It was two names for as
// long as props.js had two props, and the first generated prop went in without
// being added here: Whack's mounds are twice as tall as the ellipses they
// replaced, the bottom row of them hung off the bottom of the screen, and this
// check passed while looking at two other screens.
//
// So: **a scene that gains a prop gains a name here.** Both kinds count, drawn
// and generated.
const PROP_SCREENS = ['Caterpillar', 'Baskets', 'Whack', 'Bounce'];
for (const key of PROP_SCREENS) {
  await start(key);
  const props = await page.evaluate((name) => {
    const scene = window.__game.scene.getScene(name);
    const found = [];
    const walk = (list) => {
      for (const item of list) {
        if (item.name === 'prop' && item.getBounds) {
          const box = item.getBounds();
          found.push({
            left: Math.round(box.left),
            right: Math.round(box.right),
            top: Math.round(box.top),
            bottom: Math.round(box.bottom),
          });
        }
        if (item.list) walk(item.list);
      }
    };
    walk(scene.children.list);
    return { props: found, width: window.__game.scale.width, height: window.__game.scale.height };
  }, key);

  if (!props.props.length) {
    fail(`${key} drew no props at all`);
    continue;
  }
  for (const box of props.props) {
    if (box.left < 0 || box.right > props.width || box.top < 0 || box.bottom > props.height) {
      fail(
        `${key}: a prop runs off the screen — ${box.left}..${box.right} x ` +
          `${box.top}..${box.bottom} on a ${props.width}x${props.height} stage`
      );
    }
  }
  if (!process.exitCode) step(`  ${key}: ${props.props.length} prop(s), all on screen`);
}

// ------------------------------------------------- the letters he gets wrong

/**
 * That a wrong answer in a real game really does change what the games deal.
 *
 * tests/mastery.test.mjs already proves the distribution, by calling the module
 * directly. What it cannot prove is that the wire is connected: that a scene
 * passes a subject when it reports an answer, and that the same scene asks
 * mastery for its next target rather than rolling a die. Both halves are one
 * line each, in seventeen and twenty places, and either could be left out of a
 * scene without a single test noticing.
 *
 * So this plays FindLetter badly on purpose and then counts.
 */
step('a letter he gets wrong comes back more often');

await start('FindLetter');

const MISSES = 8;
const wrongOne = await page.evaluate(async (rounds) => {
  const mastery = await import('/src/lib/mastery.js');
  mastery.reset();
  const scene = window.__game.scene.getScene('FindLetter');

  // Answer the same letter wrong over and over. The scene has to be told which
  // letter that is, so if it is the target that gets blamed rather than the
  // tile that was tapped, this is the id that ends up with the record.
  const blamed = scene.target;
  for (let i = 0; i < rounds; i++) {
    const wrong = scene.choicesLayer.list.find((t) => t.choiceId !== scene.target);
    if (!wrong) break;
    wrong.emit('pointerup');
    await new Promise((r) => setTimeout(r, 40));
  }
  return { blamed, history: mastery.historyOf('letter', blamed) };
}, MISSES);

if (!wrongOne.history.length) {
  fail(
    'playing a game wrong recorded nothing — the scene is not passing a subject ' +
      'to wrongAnswer, so nothing it does will ever change what it deals'
  );
} else if (wrongOne.history.includes('1')) {
  fail(`only wrong answers were given, but the record reads "${wrongOne.history}"`);
} else {
  step(`  ${MISSES} wrong answers on "${wrongOne.blamed}" recorded as ${wrongOne.history}`);
}

// And that the picking end reads it. Drawn through the scene's own pickTarget,
// not through mastery directly, because the thing in doubt is the scene.
//
// **Against a letter he has never met, not against one he has mastered.** The
// app's 4x is the gap between "always wrong" and "always right"; every other
// letter here has been answered nought times and sits at the unseen weight of
// 2, which is deliberately partway up. So the honest expectation on a fresh
// record is about 2x, and asserting 4x here would be asserting something the
// design does not claim. The 4x itself is proved in tests/mastery.test.mjs,
// where the other letters can be mastered first.
if (!process.exitCode) {
  const share = await page.evaluate(async (id) => {
    const scene = window.__game.scene.getScene('FindLetter');
    const draws = 4000;
    let hits = 0;
    for (let i = 0; i < draws; i++) if (scene.pickTarget(null) === id) hits++;
    return { hits, draws, pool: scene.sequence.length };
  }, wrongOne.blamed);

  const even = 1 / share.pool;
  const got = share.hits / share.draws;
  const lift = got / even;
  if (lift < 1.6) {
    fail(
      `"${wrongOne.blamed}" was answered wrong ${MISSES} times and comes up ` +
        `${lift.toFixed(2)}x an even deal — expected about 2x, so the scene is ` +
        'picking its target without reading his record'
    );
  } else {
    step(
      `  and it now comes up ${lift.toFixed(1)}x as often as an even deal ` +
        `(${(got * 100).toFixed(1)}% of ${share.draws}, against ${(even * 100).toFixed(1)}%)`
    );
  }
}

await finish();
