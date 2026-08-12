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

import { chromium } from 'playwright';
import { hasBrowser, launchOptions } from './browser.mjs';

const APP = process.argv[2] || 'http://localhost:5173';

const fail = (msg) => {
  console.error('FAIL: ' + msg);
  process.exitCode = 1;
};
const step = (msg) => process.stderr.write(`· ${msg}\n`);

if (!hasBrowser()) {
  console.log('no Chromium installed, skipping');
  process.exit(0);
}

const options = launchOptions();
const browser = await chromium.launch({
  ...options,
  // Without this the AudioContext starts suspended and never resumes, because
  // a synthetic click is not a user gesture as far as the autoplay policy is
  // concerned — so every audio assertion below would measure silence and be
  // right to.
  args: [...options.args, '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, {
  timeout: 30000,
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

  // Listening to the tune's own output, so this measures sound rather than
  // state. A module that believes it is playing and is not would pass every
  // assertion made against its variables and fail this one.
  const output = musicOutput();
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
      await new Promise((r) => setTimeout(r, 30));
    }
    return peak;
  };

  // It fades in over about a second.
  const playing = await peakOver(2600);

  duck(1.2);
  const ducked = await peakOver(900);

  // And back up. The duck holds for its stated time and then ramps.
  await new Promise((r) => setTimeout(r, 1400));
  const restored = await peakOver(1400);

  stopMusic();
  await new Promise((r) => setTimeout(r, 700));
  const stopped = await peakOver(500);

  output.disconnect(analyser);
  return { playing, ducked, restored, stopped };
});

if (music.noOutput) {
  fail('the music module has no output node — it never initialised');
  await browser.close();
  process.exit(1);
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
    const target = scene.add.image(500, 400, '__DEFAULT');
    target.setScale(1).setAngle(0);
    const mark = { x: target.x, y: target.y, scaleX: 1, scaleY: 1, angle: 0 };

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

if (errors.length) {
  for (const e of errors) console.error('  ' + e);
  fail(`${errors.length} page error(s)`);
}

await browser.close();
console.log(process.exitCode ? 'fun verification FAILED' : 'fun verification passed');
process.exit(process.exitCode ?? 0);
