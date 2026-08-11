# Contributing

The most useful contributions to this project are content, not code, and none
of them require knowing JavaScript.

Everything the app teaches lives in `content/*.json`. Edit a file, run
`npm run bake`, run `npm test`, and open a pull request.

## Add a word

Most letters could use better words than the ones they have, and eight letters
have none at all (`ث ذ ژ ض ظ و ء ے`) because no age-appropriate picturable word
was obvious.

Add an entry to `content/words.json`:

```json
{
  "id": "titli", "word": "تتلی", "roman": "titli", "gloss": "butterfly",
  "emoji": "🦋", "image": null, "letter": "te", "letterIndex": 0
}
```

Then point the letter at it in `content/letters.json` (`"word": "titli"`).

`letterIndex` is the position of the taught letter **inside the word**, counting
from zero. It is not always zero: `ڑ`, `ھ` and `ی` never start a word, so their
words teach them from the middle. The test suite checks that the character at
`letterIndex` really is the letter you claimed, so a mistake here fails loudly.

Pick words a three-year-old can picture. A correct word they cannot picture is
worse than no word: leave `"word": null` rather than force one.

## Add or fix a translation

`content/ui.json` holds every Urdu string shown in menus. Add an entry, run
`npm run bake`, and reference it by id from a scene.

## Record audio

The app needs 120 spoken clips and ships with none, so this is the single most
useful thing anyone can contribute.

```sh
npm run record        # http://localhost:5174, then follow the prompts
npm run audio:manifest
```

Files land in `public/audio/recorded/`. See
[the README](README.md#recording-the-voice) for the keyboard shortcuts.

Three clip types exist per letter and they are genuinely different things:

- **name** — what the letter is called (`بے`)
- **sound** — the phoneme it makes (`b`)
- **word** — the example word

Recording tips:

- Speak the sound clips as bare phonemes. The instinct is to say the letter's
  name instead, which is the one thing that clip must not contain.
- Leave a beat of silence at the start and end. The app plays a name and a
  sound back to back, and clipped edges run them together.
- Watch the level meter. A recording that never leaves the left of the bar is
  too quiet to hear on a phone speaker; one that turns red is clipping.
- A native or fluent speaker's voice, ideally the child's parent. Accent
  matters less than being consistent across all 120.

You do not have to finish. Missing clips are silent, never broken, so a
contribution of ten good clips is worth having.

## Add a game

Each screen is a Phaser scene in `src/scenes/`. Add the file, register it in
`src/main.js`, and add a tile to the `GAMES` list in `src/scenes/Home.js`.

Two rules the existing screens follow:

**Never render Urdu with `this.add.text`.** Latin romanisation and English
glosses are fine that way; Urdu is not. Use `addGlyph` from `src/lib/glyph.js`
with a glyph from `src/lib/content.js`. The reasons are in the README.

**No fail states.** This is for a very young child. A wrong answer should
prompt a retry, never a penalty, a buzzer or a dead end. If a button cannot do
anything useful, do not show it rather than disabling it.

## Before opening a pull request

```sh
npm run bake            # if you touched anything in content/
npm run audio:manifest  # if you added or removed a recording
npm test
```

If you changed the audio or recording code, the two verification scripts drive
the real thing using a synthetic microphone, so they need no hardware:

```sh
npm run verify:studio   # record -> save -> a file on disk
npm run dev & npm run verify:audio   # that file -> manifest -> played in-game
```

Both delete the clip they recorded when they finish.

If you touched either guessing game:

```sh
npm run dev & npm run verify:games
```

It plays a dozen rounds of each, and checks the things that would make a round
unplayable rather than merely ugly: that the answer is always among the choices,
that a right answer advances and a wrong one keeps the round, and that balloons
do not multiply between rounds.

Note that everything in there waits on a condition, never on a duration. Phaser
advances its clock by a fixed per-frame delta, so under headless WebGL — which
renders at roughly half the usual frame rate — game time passes at about half
wall-clock speed, and a 760ms `delayedCall` can take 1.6s of real time. A test
that sleeps a fixed number of milliseconds will pass on your machine and fail in
CI.

If you touched recording, storage or the export format, run the whole loop:

```sh
npm run verify:recording
```

It drives the real parental gate, records against a synthetic microphone, checks
the clip reached IndexedDB and plays, exports a zip, wipes the device, imports it
back, hands the same zip to the studio and checks the file lands in
`public/audio/recorded/`. It also asserts a wrong gate answer and a quick tap
both fail to open the recorder. Everything it writes is cleaned up.

`tests/clip-archive.test.mjs` checks the export against the system `unzip`,
including CRCs, and reads back an archive compressed by the system `zip`. The
export format is only useful if ordinary tools can open it, so it is tested
against ordinary tools rather than only against its own reader.

If you changed anything about the build, the service worker or the manifest,
check the app still runs with the network off:

```sh
npm run build && npm run verify:offline
```

It installs the service worker, waits for the precache to fill, cuts the
network, reloads, and asserts the app still starts and still plays a cached
clip. It serves from a project subpath, because scope and `start_url` bugs only
show up off the domain root.

`public/icons/` is generated by `npm run icons` from the baked Nastaliq, and is
committed because CI has no browser to regenerate it. Re-run it if you change
the icon word in `content/ui.json`.

## Word pictures

`public/images/words/` is generated by `npm run images`, which needs an OpenAI
key in the environment:

```sh
OPENAI_API_KEY=... npm run images
```

It only draws words that have no picture yet, so adding one word costs one
image. Originals are cached in `.image-cache/` (gitignored), and every run
re-does the cut-out and resize from that cache — so the keying can be tuned
without paying to redraw anything.

The white background is removed by a flood fill seeded from the border, not by a
threshold. That distinction matters: a threshold would also erase white *inside*
the subject — the football's panels, the zebra's stripes, the hailstones —
whereas a fill only takes white connected to the edge. The 1024→384 downscale
that follows turns the hard-edged mask into a smooth one for free.

If you add a word whose English gloss is not a good art brief ("fruit", "halwa"),
add an entry to `OVERRIDES` in `tools/make-word-images.mjs` rather than accepting
whatever the gloss produces.

## Colour

`src/lib/theme.js` has two surfaces, and which one a thing sits on decides its
colour: **paper** (`bg`, `card`) takes `ink`/`inkDim`, which are dark, and
**colour** (family hues, menu tiles, balloons) takes `onColor`, which is white.
The two ink colours are named for where they go rather than for what they look
like, because getting them the wrong way round is the easy mistake and produces
white text on a white card.

If you changed the glyph baker, also run `node tools/preview-glyphs.mjs` and
actually look at the output. The tests verify that glyphs exist and differ from
each other; they cannot tell you the Nastaliq is right.

## Reporting an error in the content

Corrections to letter names, sounds, joining behaviour, shape families or word
choices are very welcome, especially from native speakers and from people
teaching Urdu to children. Open an issue describing what is wrong and what it
should be. You do not need to send a patch.
