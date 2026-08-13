/**
 * Checks the parts of the app whose only job is to be enjoyable.
 *
 * Music, sparkles and small animations are exactly the code nobody notices has
 * broken. A silent tune, an emitter that leaks, a letter left sitting at nine
 * degrees after a wobble — none of them throw, none of them fail a game
 * verification, and all of them are the difference between an app a
 * three-year-old asks for and one they do not.
 *
 * What it asserts, and why each one is a real failure mode rather than a
 * restatement of the code:
 *
 *   1. **The tune actually makes a sound.** A scheduler that books notes into
 *      the past, or a gain node left at zero, produces silence in a way no
 *      exception reports. Measured off an analyser, not inferred from state.
 *   2. **It ducks under a voice, and comes back.** The recorded voice is the
 *      whole point of the app, and music over it is the one way this feature
 *      can actively make the app worse. Failing to come back up afterwards is
 *      the same bug from the other end.
 *   3. **Bursts clean up after themselves.** A one-shot emitter that is never
 *      destroyed stays on the display list being stepped for ever, and there is
 *      nothing on screen to show for it. After a hundred right answers that is
 *      a hundred of them.
 *   4. **Animations put things back.** hop, jig and squash all move something
 *      and then have to return it exactly. Half a pixel of drift per tap is
 *      invisible once and obvious after twenty.
 *   5. **The music switch works and is remembered.**
 *
 * ## Two clocks, and waiting on the right one
 *
 * The checks below wait in two different units, and mixing them up produces a
 * check that passes without testing anything.
 *
 * Anything driven by Phaser — tweens, timers, particle lifespans — advances by
 * a **fixed delta per rendered frame**, and headless WebGL renders at about
 * nine frames a second. So two seconds of `setTimeout` is roughly three hundred
 * milliseconds of game time, and a wait long enough to look generous is not
 * nearly long enough. Worse, it fails silently in the flattering direction: a
 * tween that has not started yet leaves its target exactly on its mark, so a
 * check that "the animation puts things back" passes because nothing moved.
 * Everything here counts frames instead, and asserts that movement was actually
 * seen before asserting that it was undone.
 *
 * Anything driven by Web Audio runs on the audio clock, which is real time and
 * unaffected by frame rate — so the music section does wait in milliseconds,
 * and is right to.
 *
 * Usage: npm run dev &  then  node tools/verify-fun.mjs [baseUrl]
 */

import { fail, openApp, step } from './harness.mjs';

const { page, finish } = await openApp({
  name: 'fun',
  context: { viewport: { width: 1280, height: 720 } },
  // Without this the AudioContext starts suspended and never resumes, because
  // a synthetic click is not a user gesture as far as the autoplay policy is
  // concerned — so every audio assertion below would measure silence and be
  // right to.
  args: ['--autoplay-policy=no-user-gesture-required'],
});

// --- 1 and 2. The tune, and what it does under a voice ----------------------

step('starting the tune and listening to it');
const music = await page.evaluate(async () => {
  // The app's own instance of the module, not a fresh import — see the note
  // beside window.__music in src/main.js. Importing it here would get a second,
  // silent copy and the whole section would be measuring nothing.
  const { startMusic, stopMusic, duck, setMusicOn, musicOutput } = window.__music;
  const ctx = window.__game.sound.context;
  if (ctx.state === 'suspended') await ctx.resume();

  setMusicOn(true);
  stopMusic();
  startMusic();

  // The band is built on first start, and building it loads a library and
  // renders a reverb impulse offline, so there is nothing to listen to for a
  // moment. Waited for rather than slept through.
  const output = await new Promise((resolve) => {
    const until = performance.now() + 15000;
    const look = () => {
      const node = musicOutput();
      if (node || performance.now() > until) return resolve(node);
      setTimeout(look, 100);
    };
    look();
  });
  if (!output) return { noOutput: true };
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  output.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);
  const rms = () => {
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    return Math.sqrt(sum / buffer.length);
  };

  // Wall-clock waits, deliberately: Web Audio runs on the audio clock, which
  // is real time whatever the frame rate is doing. Peak rather than a single
  // reading, because the tune has rests in it and sampling once could
  // legitimately land in one.
  const peakOver = async (ms) => {
    let peak = 0;
    const until = performance.now() + ms;
    while (performance.now() < until) {
      peak = Math.max(peak, rms());
      await new Promise((r) => setTimeout(r, 25));
    }
    return peak;
  };
  const settle = (ms) => new Promise((r) => setTimeout(r, ms));

  // Past the fade-in before measuring anything. A baseline taken during the
  // fade is lower than the real one, which then makes the duck below look
  // shallower than it is and the assertions meaningless in both directions.
  await settle(2200);
  const playing = await peakOver(3000);

  duck(1.6);
  // Past the duck ramp, then measure inside the hold.
  await settle(400);
  const ducked = await peakOver(1000);

  // And back up, once the hold has expired and the ramp has run.
  await settle(2400);
  const restored = await peakOver(2000);

  stopMusic();
  await settle(1200);
  const stopped = await peakOver(600);

  output.disconnect(analyser);
  return { playing, ducked, restored, stopped };
});

if (music.noOutput) {
  fail('the music module never produced an output node — it failed to build');
  await finish();
}

step(
  `  playing ${music.playing.toFixed(4)}, ducked ${music.ducked.toFixed(4)}, ` +
    `back up ${music.restored.toFixed(4)}, stopped ${music.stopped.toFixed(4)}`
);

if (music.playing < 0.002) {
  fail(
    `the tune is silent (rms ${music.playing.toFixed(5)}) — it is scheduling notes ` +
      'nobody can hear'
  );
} else {
  step('  the tune makes a sound');
}

if (music.ducked >= music.playing * 0.75) {
  fail(
    `ducking barely moved it (${music.ducked.toFixed(4)} against ${music.playing.toFixed(4)}) — ` +
      'the music will be sitting on top of the recorded voice'
  );
} else {
  step(`  ducks to ${((music.ducked / music.playing) * 100).toFixed(0)}% under a voice`);
}

if (music.restored < music.ducked * 1.2) {
  fail('the tune never came back up after ducking — it will fade away over a game');
} else {
  step('  and comes back afterwards');
}

if (music.stopped > music.playing * 0.35) {
  fail(`switching the tune off left it playing at rms ${music.stopped.toFixed(4)}`);
}

// --- 2b. A stalled main thread must not take the app down --------------------

step('stalling the main thread under the music');
const survived = await page.evaluate(async () => {
  const { startMusic, setMusicOn } = window.__music;
  const ctx = window.__game.sound.context;
  if (ctx.state === 'suspended') await ctx.resume();
  setMusicOn(true);
  startMusic();
  await new Promise((r) => setTimeout(r, 2500));

  const errors = [];
  const onError = (e) => errors.push(String(e.message || e.reason));
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onError);

  // Blocks the thread hard, several times, which is what a scene change or a
  // garbage collection does on a cheap phone. Tone clamps every event whose
  // time has passed up to `currentTime`, so a stall makes two scheduled hits
  // land on the same instant — and a Source that is already playing refuses to
  // restart at a time that is not strictly later than its last. That threw
  // "Start time must be strictly greater than previous start time" from inside
  // the audio clock, which the boot handler in index.html then reported as the
  // game having failed to load.
  for (let i = 0; i < 6; i++) {
    const until = performance.now() + 320;
    while (performance.now() < until) {
      /* deliberately busy */
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  await new Promise((r) => setTimeout(r, 1200));

  window.removeEventListener('error', onError);
  window.removeEventListener('unhandledrejection', onError);

  return {
    errors,
    stillRunning: Boolean(window.__game?.scene.getScenes(true).length),
  };
});

for (const message of survived.errors) {
  fail(`the music threw while the main thread was stalled: ${message}`);
}
if (!survived.stillRunning) fail('the game stopped running after the stall');
if (!survived.errors.length) step('  survived 6 stalls with no uncaught errors');

// The other half of that bug, and the half a user actually saw. Whatever the
// music does, a runtime error arriving after the game is up must not put a
// full-screen "The game could not load" over a game that is visibly running:
// that handler speaks for startup only. Driven directly, because the condition
// that produced it in the wild — a dropped note on a stalling phone — is not
// something this can reliably reproduce, whereas the reporting bug it exposed
// is exactly reproducible and was the damaging part.
step('checking a late error does not claim the app failed to load');
const overlay = await page.evaluate(() => {
  window.dispatchEvent(
    new ErrorEvent('error', { message: 'synthetic late failure', filename: 'test', lineno: 1 })
  );
  const el = document.getElementById('boot-error');
  return {
    shown: el ? getComputedStyle(el).display !== 'none' : false,
    gameUp: Boolean(window.__game),
  };
});

if (!overlay.gameUp) {
  fail('window.__game was missing, so the boot handler cannot tell startup from runtime');
} else if (overlay.shown) {
  fail('a late runtime error put up the "game could not load" screen over a running game');
} else {
  step('  the boot screen stayed out of the way');
}

// --- 3. Bursts clean up -----------------------------------------------------

step('firing bursts and counting what is left behind');
const leak = await page.evaluate(async () => {
  const { sparkleBurst, popPuff, ringBurst } = await import('/src/lib/particles.js');
  const scene = window.__game.scene.getScene('Home');
  const count = () =>
    scene.children.list.filter((c) => c.type === 'ParticleEmitter').length;

  const before = count();
  for (let i = 0; i < 12; i++) {
    sparkleBurst(scene, 400 + i, 300);
    popPuff(scene, 400, 300, 0xff0000);
    ringBurst(scene, 400, 300);
  }
  const during = count();

  // Counted in frames, not milliseconds — the cleanup runs off a Phaser timer.
  // Four hundred frames is many times the longest lifespan here; the point is
  // to have a limit at all rather than to have a tight one.
  const after = await new Promise((resolve) => {
    let frames = 0;
    const step = () => {
      if (count() <= before) return resolve(count());
      if (++frames > 400) return resolve(count());
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  return { before, during, after };
});

if (leak.during <= leak.before) {
  fail('firing 36 bursts added no emitters at all — nothing is being drawn');
} else if (leak.after > leak.before) {
  fail(
    `${leak.after - leak.before} emitter(s) left on the display list after their ` +
      'particles died; they will accumulate for the whole session'
  );
} else {
  step(`  ${leak.during - leak.before} emitters fired, all cleaned up`);
}

// --- 4. Animations put things back ------------------------------------------

step('checking the animations move things and then put them back');
const drift = await page.evaluate(async () => {
  const { hop, jig, squash } = await import('/src/lib/liveliness.js');
  const scene = window.__game.scene.getScene('Home');

  /** How far a target is from where it started, in comparable units. */
  const deviation = (target, mark) =>
    Math.max(
      Math.abs(target.x - mark.x),
      Math.abs(target.y - mark.y),
      Math.abs(target.angle - mark.angle),
      Math.abs(target.scaleX - mark.scaleX) * 100,
      Math.abs(target.scaleY - mark.scaleY) * 100
    );

  const results = [];
  for (const [name, animate] of [
    ['hop', hop],
    ['jig', jig],
    ['squash', squash],
  ]) {
    // Deliberately not square, and deliberately not uniformly scaled. Phaser's
    // `scale` getter returns the average of scaleX and scaleY, and `setScale(n)`
    // writes that average back to both — so an animation that round-trips
    // through it squares up whatever it touched, a little more on every tap.
    // Every picture in this app is sized with setDisplaySize and is not square,
    // so a square test target cannot see the bug at all.
    const target = scene.add.image(500, 400, '__DEFAULT');
    target.setScale(1.6, 0.7).setAngle(0);
    const mark = { x: target.x, y: target.y, scaleX: 1.6, scaleY: 0.7, angle: 0 };

    animate(scene, target);

    // Sampled every frame, because that is the clock the tween runs on. `moved`
    // is as important as `settled`: without it, an animation that never started
    // would sit perfectly on its mark and pass.
    const { moved, settled } = await new Promise((resolve) => {
      let frames = 0;
      let peak = 0;
      let quiet = 0;
      const step = () => {
        const now = deviation(target, mark);
        peak = Math.max(peak, now);
        // Back on its mark, and staying there — one frame at rest could just be
        // the turn of a yoyo passing through the middle.
        quiet = now < 0.01 ? quiet + 1 : 0;
        if ((peak > 0 && quiet >= 8) || ++frames > 400) {
          return resolve({ moved: peak, settled: now });
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    results.push({ name, moved, settled });
    target.destroy();
  }
  return results;
});

for (const r of drift) {
  if (r.moved < 0.5) {
    fail(`${r.name}() never moved its target at all — the animation is not running`);
  } else if (r.settled > 0.5) {
    fail(
      `${r.name}() left its target ${r.settled.toFixed(2)} off the mark after moving ` +
        `${r.moved.toFixed(1)}; it will drift a little further on every tap`
    );
  } else {
    step(`  ${r.name}() moves ${r.moved.toFixed(0)} and returns exactly`);
  }
}

// --- 5. The switch ----------------------------------------------------------

step('using the music switch on the menu');
const toggled = await page.evaluate(async () => {
  const { musicOn } = window.__music;
  const scene = window.__game.scene.getScene('Home');
  const button = scene.musicButton;
  if (!button) return { found: false };

  const was = musicOn();
  button.emit('pointerup');
  const after = musicOn();
  button.emit('pointerup');
  const back = musicOn();
  return { found: true, was, after, back, stored: localStorage.getItem('urdu:music') };
});

if (!toggled.found) {
  fail('no music switch on the menu');
} else if (toggled.after === toggled.was) {
  fail('tapping the music switch did not change anything');
} else if (toggled.back !== toggled.was) {
  fail('tapping the music switch twice did not put it back');
} else if (toggled.stored === null) {
  fail('the music setting is not being remembered');
} else {
  step('  switches off, on, and is remembered');
}

// --- 6. Changing the tune ---------------------------------------------------

// The picker is the only way to hear four of the five pieces, and each one is
// played on a different sampled instrument — so a change is a fetch, a decode
// and a reverb render, not a swap of notes. Two things can go wrong and both
// are silent: the new band never builds, or the old one is torn down and
// nothing replaces it. Neither throws. So this listens.

step('switching the background tune');
const switched = await page.evaluate(async () => {
  const { currentTune, musicOutput, setMusicOn, setTune, startMusic, stopMusic, tuneNames } =
    window.__music;
  const ctx = window.__game.sound.context;
  if (ctx.state === 'suspended') await ctx.resume();

  const rmsOf = async (node, ms) => {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    node.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    let peak = 0;
    const until = performance.now() + ms;
    while (performance.now() < until) {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
      peak = Math.max(peak, Math.sqrt(sum / buffer.length));
      await new Promise((r) => setTimeout(r, 25));
    }
    node.disconnect(analyser);
    return peak;
  };

  setMusicOn(true);
  stopMusic();
  startMusic();
  await new Promise((r) => setTimeout(r, 3000));

  const names = tuneNames().map((t) => t.id);
  const before = currentTune();
  const target = names.find((id) => id !== before);

  // No startMusic() here on purpose. Restarting is setTune's job — it took the
  // old band down — and calling it from the check would rebuild the band even
  // if setTune had not, which makes the silence assertion below untestable.
  // Confirmed by disabling setTune's own restart and watching this fail.
  await setTune(target);
  // Past the fade-in of the newly built band.
  await new Promise((r) => setTimeout(r, 3000));

  // Two distinct failures, and they want telling apart: no output node at all
  // means the old band was torn down and nothing replaced it, while a node
  // carrying silence means a band was built but is not playing.
  const output = musicOutput();
  const after = output ? await rmsOf(output, 3000) : null;

  return {
    names,
    before,
    target,
    chosen: currentTune(),
    stored: localStorage.getItem('urdu:tune'),
    after,
  };
});

if (switched.names.length < 2) {
  fail(`only ${switched.names.length} tune(s) to choose from`);
} else if (switched.chosen !== switched.target) {
  fail(`asked for "${switched.target}" and got "${switched.chosen}"`);
} else if (switched.stored !== switched.target) {
  fail('the chosen tune is not being remembered');
} else if (switched.after === null) {
  // The failure this is really here for: the old band is disposed, the new one
  // never builds, and the app goes quietly silent with nothing thrown.
  fail(
    `switching to "${switched.target}" left no music output at all — ` +
      'the old band was torn down and nothing replaced it'
  );
} else if (switched.after < 0.0005) {
  fail(
    `after switching to "${switched.target}" the output was silent ` +
      `(${switched.after.toFixed(5)})`
  );
} else {
  step(
    `  ${switched.before} -> ${switched.target}, playing at ` +
      `${switched.after.toFixed(4)}, and remembered`
  );
}

await finish();
