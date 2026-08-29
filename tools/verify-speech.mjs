/* What the app actually says out loud when a child taps faster than it can fetch a clip. */

import { fail, homeIsUp, openApp, startScene, step } from './harness.mjs';
import { readContent } from './audio-keys.mjs';

const APP = process.argv[2] || process.env.APP_URL || 'http://localhost:5173';

const RATE = 48000;
/* Durations, spaced far enough apart to survive resampling into whatever rate the audio context is running at. */
const BASE_MS = 500;
const SPACING_MS = 17;

const letters = readContent('letters.json').letters;
const words = readContent('words.json').words;

/* key -> {slug, ms} */
const CLIPS = new Map();
let n = 0;
for (const letter of letters) {
  CLIPS.set(`letter/${letter.id}/name`, {
    slug: `letter-${letter.id}-name`,
    ms: BASE_MS + n++ * SPACING_MS,
  });
}
for (const word of words) {
  CLIPS.set(`word/${word.id}`, {
    slug: `word-${word.id}`,
    ms: BASE_MS + n++ * SPACING_MS,
  });
}

/* A quiet sine, as a 16-bit mono WAV. */
function wav(ms) {
  const frames = Math.round((ms / 1000) * RATE);
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + frames * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) {
    buffer.writeInt16LE(Math.round(Math.sin((i / RATE) * 2 * Math.PI * 440) * 6000), 44 + i * 2);
  }
  return buffer;
}

const manifest = {
  clips: Object.fromEntries(
    [...CLIPS].map(([key, clip]) => [key, `audio/fake/${clip.slug}.wav`])
  ),
  missing: [],
  counts: { expected: CLIPS.size, recorded: CLIPS.size, tts: 0, missing: 0 },
};

/* Slugs to answer slowly, so a load can be made to lose a race on purpose. */
const slow = new Set();
const SLOW_MS = 600;

const { context, newPage, finish } = await openApp({
  name: 'speech',
  open: false,
  args: [
    // A headless run has no gesture to unlock audio with, and every check here is about what comes out of the speakers.
    '--autoplay-policy=no-user-gesture-required',
  ],
});

/* Every buffer the app starts, by duration. */
await context.addInitScript(() => {
  window.__started = [];
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    window.__started.push({ seconds: this.buffer?.duration ?? 0, at: performance.now() });
    return start.apply(this, args);
  };
});

const page = await newPage();

await page.route('**/content/audio.json', (route) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(manifest) })
);
await page.route('**/audio/fake/*.wav', async (route) => {
  const slug = route.request().url().split('/').pop().replace('.wav', '');
  const clip = [...CLIPS.values()].find((c) => c.slug === slug);
  if (!clip) return route.fulfill({ status: 404, body: '' });
  if (slow.has(slug)) await new Promise((r) => setTimeout(r, SLOW_MS));
  route.fulfill({ contentType: 'audio/wav', body: wav(clip.ms) });
});

step('loading the app with a full set of invented clips');
await page.goto(APP, { waitUntil: 'domcontentloaded' });
await homeIsUp(page);

const seen = await page.evaluate(() => window.__audio.audioStats());
if (seen.recorded !== CLIPS.size) {
  fail(`app saw ${seen.recorded} clips, not the ${CLIPS.size} that were served`);
  await finish();
}
step(`${seen.recorded} clips visible to the app`);

const reset = () => page.evaluate(() => (window.__started = []));

/* Which of the invented clips have started since the last reset, in order. */
async function spoken() {
  const started = await page.evaluate(() => window.__started);
  const out = [];
  for (const { seconds } of started) {
    for (const [key, clip] of CLIPS) {
      if (Math.abs(seconds * 1000 - clip.ms) < 1.5) out.push(key);
    }
  }
  return out;
}

const say = (keys, gap = 400) =>
  page.evaluate(([k, g]) => void window.__audio.playSequence(k, g), [keys, gap]);

/* Loads a clip into the app's cache, so a later play has nothing to wait for. */
async function warm(keys) {
  await page.evaluate(async (k) => {
    for (const key of k) await window.__audio.play(key);
    window.__audio.stopAll();
  }, keys);
}

// 1 --------------------------------------------------- losing the race

step('a clip that lost the race must not speak');
slow.add(CLIPS.get('letter/alif/name').slug);
await reset();
await say(['letter/alif/name']);
await page.waitForTimeout(60);
await say(['letter/be/name']);
await page.waitForTimeout(SLOW_MS + 600);
{
  const heard = await spoken();
  if (heard.includes('letter/alif/name')) {
    fail(`alif spoke after be took over — heard ${heard.join(', ')}`);
  } else if (!heard.includes('letter/be/name')) {
    fail(`be never spoke at all — heard ${heard.join(', ') || 'nothing'}`);
  } else {
    step('  only the letter that was tapped last was heard');
  }
}
slow.clear();

// 2. Verify the replacement sequence.

step('a sequence must not finish over the top of a newer one');
await warm(['letter/alif/name', 'word/angoor', 'letter/pe/name']);
await reset();
// alif is half a second long; the word follows it after the gap.
await say(['letter/alif/name', 'word/angoor'], 400);
await page.waitForTimeout(700); // alif done, in the gap before the word
await say(['letter/pe/name']);
await page.waitForTimeout(900);
{
  const heard = await spoken();
  if (heard.includes('word/angoor')) {
    fail(`the word arrived after a new letter was tapped — heard ${heard.join(', ')}`);
  } else if (!heard.includes('letter/pe/name')) {
    fail(`pe never spoke — heard ${heard.join(', ') || 'nothing'}`);
  } else {
    step('  the replaced sequence stopped where it was');
  }
}

// 3 ---------------------------------------------------- every tap in Shapes

step('every tap on a live card in Shapes names the letter under it');
await startScene(page, 'JoinForms');
await page.waitForFunction(
  () => window.__game.scene.getScene('JoinForms')?.cards?.length > 0
);
await page.waitForTimeout(1400); // the cards deal in

const geo = await page.evaluate(() => {
  const rect = window.__game.canvas.getBoundingClientRect();
  return { left: rect.left, top: rect.top, scale: rect.width / 1280 };
});
const cards = await page.evaluate(() =>
  window.__game.scene.getScene('JoinForms').cards.map((c) => ({
    letterId: c.letterId,
    row: c.row,
    x: c.x,
    y: c.y,
  }))
);

/* A real press at a card's position, not an emitted event. */
async function tap(card) {
  await page.mouse.move(geo.left + card.x * geo.scale, geo.top + card.y * geo.scale);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(500);
}

const held = cards.find((c) => c.row === 0);
const wrong = cards.find((c) => c.row === 1 && c.letterId !== held.letterId);
const right = cards.find((c) => c.row === 1 && c.letterId === held.letterId);

if (!held || !wrong || !right) {
  fail('the board did not deal a card to hold, a wrong one and its partner');
} else {
  await warm([`letter/${held.letterId}/name`, `letter/${wrong.letterId}/name`]);

  await reset();
  await tap(held);
  if (!(await spoken()).includes(`letter/${held.letterId}/name`)) {
    fail(`picking up ${held.letterId} said nothing`);
  } else step(`  picking a card up says its letter`);

  await reset();
  await tap(wrong);
  if (!(await spoken()).includes(`letter/${wrong.letterId}/name`)) {
    fail(`tapping the wrong card (${wrong.letterId}) said nothing`);
  } else step('  a wrong pair still says the letter that was tapped');

  // The board is back to nothing held.
  await tap(held);
  await reset();
  await tap(held);
  if (!(await spoken()).includes(`letter/${held.letterId}/name`)) {
    fail(`putting ${held.letterId} back down said nothing`);
  } else step('  putting a card back down says its letter');

  // And the pairing itself, which says the name and then the word.
  await reset();
  await tap(held);
  await tap(right);
  await page.waitForTimeout(1400);
  const heard = await spoken();
  if (!heard.includes(`letter/${held.letterId}/name`)) {
    fail(`joining a pair did not name the letter — heard ${heard.join(', ') || 'nothing'}`);
  } else step('  joining a pair names the letter');
}

await finish();
