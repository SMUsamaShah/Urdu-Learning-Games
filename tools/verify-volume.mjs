/**
 * How loud the app is, measured rather than asserted.
 *
 * "The main screen is too quiet" is a claim about a number, so it is checked as
 * one. The tune used to render at peak −33 dBFS and an RMS of −52, which is
 * inaudible under any room; everything below exists to make sure it stays where
 * it was moved to and that the volume control actually reaches it.
 *
 * The interesting check is the routing one. Four separate things reach the
 * speakers — the tune, the effects, the flourishes and the recorded voice — and
 * each used to connect straight to the destination. A module that forgets to go
 * through the master is silent from every angle except this one: it plays
 * perfectly, it just cannot be turned down.
 *
 * Usage: npm run dev &  then  node tools/verify-volume.mjs [baseUrl]
 */

import { fail, homeIsUp, openApp, step } from './harness.mjs';

/**
 * Where the tune should land, in dBFS, rendered offline.
 *
 * A band rather than a number: the render is a real synthesiser with a reverb
 * and a limiter in it, and pinning it to a decimal would fail on a rounding
 * change. The floor is the point — anything near the old −33 is inaudible.
 */
const MUSIC_PEAK = { min: -22, max: -10 };

const { page, finish, url } = await openApp({ name: 'volume', open: false, waitForHome: false });

const db = (v) => 20 * Math.log10(Math.max(v, 1e-9));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await homeIsUp(page);
// Nothing makes a sound until the page has been touched.
await page.mouse.click(400, 300);
await page.waitForTimeout(600);

// --- 1. The tune is loud enough to hear -------------------------------------

step('rendering the tune');
const music = await page.evaluate(async () => {
  window.__music.stopMusic();
  await new Promise((r) => setTimeout(r, 600));
  const { channels } = await window.__music.renderMusic(12);
  const data = channels[0];
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i]);
    if (v > peak) peak = v;
    sum += data[i] * data[i];
  }
  return { peak, rms: Math.sqrt(sum / data.length) };
});
step(`  peak ${db(music.peak).toFixed(1)} dBFS, rms ${db(music.rms).toFixed(1)} dBFS`);
if (db(music.peak) < MUSIC_PEAK.min) {
  fail(`the tune peaks at ${db(music.peak).toFixed(1)} dBFS — too quiet to hear on a phone`);
} else if (db(music.peak) > MUSIC_PEAK.max) {
  fail(`the tune peaks at ${db(music.peak).toFixed(1)} dBFS — loud enough to be fatiguing`);
}

// --- 2. Everything goes through the master ----------------------------------
//
// Three separate measurements on purpose. One tap point would pass with two of
// the three still wired straight to the speakers.

/**
 * Listens on the master, which is where every source is supposed to arrive.
 *
 * Deliberately not the destination: an analyser on `ctx.destination` hears
 * everything whatever the routing, so it cannot tell a source that respects the
 * volume from one that does not.
 */
await page.evaluate(() => {
  const ctx = window.__game.sound.context;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  window.__probe = {
    analyser,
    buffer: new Float32Array(analyser.fftSize),
    rms() {
      this.analyser.getFloatTimeDomainData(this.buffer);
      let sum = 0;
      for (const v of this.buffer) sum += v * v;
      return Math.sqrt(sum / this.buffer.length);
    },
    async peakOver(ms) {
      let peak = 0;
      const until = performance.now() + ms;
      while (performance.now() < until) {
        peak = Math.max(peak, this.rms());
        await new Promise((r) => setTimeout(r, 20));
      }
      return peak;
    },
  };
  window.__volume.masterOut().connect(analyser);
});

const heard = (what, ms = 900) =>
  page.evaluate(
    async ([kind, duration]) => {
      window.__volume.setVolume(1);
      await new Promise((r) => setTimeout(r, 120));
      if (kind === 'music') window.__music.startMusic();
      if (kind === 'sfx') window.__sfx.tada();
      if (kind === 'flourish') window.__flourish.rightAnswer();
      return window.__probe.peakOver(duration);
    },
    [what, ms]
  );

const silentAt = (what, ms = 900) =>
  page.evaluate(
    async ([kind, duration]) => {
      window.__volume.setVolume(0);
      await new Promise((r) => setTimeout(r, 200));
      if (kind === 'music') window.__music.startMusic();
      if (kind === 'sfx') window.__sfx.tada();
      if (kind === 'flourish') window.__flourish.rightAnswer();
      return window.__probe.peakOver(duration);
    },
    [what, ms]
  );

// The flourishes are a sampled instrument that loads on demand, and until it is
// up every call falls back to the synthesised chime — which goes through the
// effects chain, making the check below a second copy of the effects one rather
// than a test of the sampler's own routing.
step('waiting for the flourish sampler');
const sampled = await page.evaluate(async () => {
  window.__flourish.prepareFlourishes();
  await new Promise((r) => setTimeout(r, 4000));
  return window.__flourish.flourishVoiceReady();
});
// Said out loud rather than glossed over. The sampled voice needs Tone to
// render a reverb impulse, which does not complete in this headless build, so
// here the flourish case measures the fallback. It is still worth running —
// that path has to respect the volume too — but the sampler's own routing is
// not covered by it, and pretending otherwise would be worse than saying so.
step(
  sampled
    ? '  the sampled voice is up, so the flourish case measures the sampler'
    : '  the sampled voice did not come up here — the flourish case measures the synthesised fallback'
);

for (const source of ['music', 'sfx', 'flourish']) {
  step(`${source}: heard at full, silent at zero`);
  const loud = await heard(source, source === 'music' ? 2500 : 1200);
  await page.evaluate(() => window.__music.stopMusic());
  await page.waitForTimeout(400);
  const quiet = await silentAt(source, source === 'music' ? 2500 : 1200);
  await page.evaluate(() => window.__music.stopMusic());
  await page.waitForTimeout(400);

  step(`  ${db(loud).toFixed(1)} dBFS → ${db(quiet).toFixed(1)} dBFS`);
  if (loud < 0.001) fail(`${source} made no sound at all, so this proves nothing`);
  // Not exactly zero: the limiter's release and a reverb tail are still
  // draining when the gain lands, so the floor is "essentially gone".
  else if (quiet > loud * 0.05) {
    fail(`${source} still plays at volume 0 — it is not routed through the master`);
  }
}

// --- 3. The setting sticks --------------------------------------------------

step('the slider moves the gain, and the setting survives a reload');
await page.evaluate(() => window.__volume.setVolume(0.42));
const applied = await page.evaluate(() => ({
  reported: window.__volume.volume(),
  stored: localStorage.getItem('urdu-games:volume'),
}));
if (Math.abs(applied.reported - 0.42) > 0.001) fail(`setVolume(0.42) reports ${applied.reported}`);
if (Number(applied.stored) !== 0.42) fail(`stored as ${applied.stored}`);

await page.goto(url, { waitUntil: 'domcontentloaded' });
await homeIsUp(page);
const afterReload = await page.evaluate(() => window.__volume.volume());
if (Math.abs(afterReload - 0.42) > 0.001) {
  fail(`after a reload the volume is ${afterReload}, not 0.42`);
} else {
  step('  0.42 came back after a reload');
}

// --- 4. And the settings screen shows it ------------------------------------

step('the slider is on the settings screen');
await page.evaluate(() => window.__volume.setVolume(0.8));
await page.evaluate(() => {
  window.__game.scene.getScene('Home').settingsButton.emit('pointerdown');
});
await page.waitForSelector('.gate', { timeout: 10000 });
const question = await page.textContent('#gate-q');
const [, a, b] = question.match(/What is (\d+) × (\d+)\?/) ?? [];
await page.fill('.gate-input', String(Number(a) * Number(b)));
await page.click('.gate-ok');
await page.waitForSelector('.set-root', { timeout: 10000 });

const slider = await page.$('.set-slider[data-act="volume"]');
if (!slider) fail('there is no volume slider in settings');
else {
  const shown = await slider.evaluate((el) => Number(el.value));
  if (shown !== 80) fail(`the slider reads ${shown} for a volume of 0.8`);
  else step('  it reads 80 for a volume of 0.8');

  // Dragging it has to reach the audio, not just the number.
  await slider.evaluate((el) => {
    el.value = '30';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const dragged = await page.evaluate(() => window.__volume.volume());
  if (Math.abs(dragged - 0.3) > 0.001) fail(`dragging to 30 left the volume at ${dragged}`);
  else step('  and dragging it sets the volume');
}

await finish();
