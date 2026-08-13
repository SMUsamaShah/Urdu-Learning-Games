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
];

const { page, finish } = await openApp({
  name: 'game',
  timeoutMs: 300000,
});

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

// ------------------------------------------------------------- caterpillar

if (!process.exitCode) {
  await start('Caterpillar');
  step('Caterpillar: checking the run and the tray agree');

  const board = () =>
    page.evaluate(() => {
      const scene = window.__game.scene.getScene('Caterpillar');
      return {
        run: scene.run,
        holes: scene.holes,
        filled: scene.filled,
        round: scene.round,
        tray: scene.tray.list.map((t) => ({ letterId: t.letterId, used: t.used })),
        sequence: scene.sequence,
      };
    });

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

  const tapTray = (letterId) =>
    page.evaluate((id) => {
      const scene = window.__game.scene.getScene('Caterpillar');
      scene.tray.list.find((t) => t.letterId === id && !t.used)?.emit('pointerup');
    }, letterId);

  // A wrong tray letter must not fill the hole it was aimed at.
  const wrong = trayIds.find((id) => !first.holes.some((h) => first.run[h] === id));
  if (wrong) {
    await tapTray(wrong);
    await page.waitForTimeout(400);
    const after = await board();
    if (after.filled !== 0) fail('a wrong tray letter filled a hole');
    else step('a wrong tray letter fills nothing');
  }

  // Holes fill in reading order, so the answers have to be given in that order.
  step('Caterpillar: filling every hole');
  for (const hole of first.holes) {
    await tapTray(first.run[hole]);
    await page.waitForTimeout(700);
  }
  const moved = await page
    .waitForFunction(
      (before) => window.__game.scene.getScene('Caterpillar').round > before,
      first.round,
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

await finish();
