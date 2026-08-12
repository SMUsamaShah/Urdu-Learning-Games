# Contributing

The most useful contributions to this project are content, not code, and none
of them require knowing JavaScript.

Everything the app teaches lives in `content/*.json`. Edit a file, run
`npm run bake`, run `npm test`, and open a pull request.

## Add a word

Most letters could use better words than the ones they have. Only `ء` (hamza)
has none: it is closer to a diacritic than a letter, almost never stands alone,
and no word a three-year-old can picture puts it on its own. Leaving it empty is
the right answer rather than forcing one.

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

The app needs a spoken clip per letter name, letter sound, word and number —
123 at the moment — and ships with none, so this is the single most useful
thing anyone can contribute.

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

The games say a letter through `sayLetter()` in `src/lib/say.js`, which plays
the name and then the word — "bay ... bakri". Nothing outside that module
should be assembling a sequence of clip keys by hand: what the app says when a
letter appears is a teaching decision, and it belongs in one place.

Recording tips:

- Speak the sound clips as bare phonemes. The instinct is to say the letter's
  name instead, which is the one thing that clip must not contain.
- Leave a beat of silence at the start and end. The app plays a name and a
  sound back to back, and clipped edges run them together.
- Watch the level meter. A recording that never leaves the left of the bar is
  too quiet to hear on a phone speaker; one that turns red is clipping.
- A native or fluent speaker's voice, ideally the child's parent. Accent
  matters less than being consistent across the whole set.

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

Two games have unwinnable states the others cannot reach, so they get their own
checks:

**Pairs** can deal a card with no partner. Every card must have exactly one, and
a pair must be one letter and one picture — a board with an odd card out can
never be finished, and a child has no way to tell that the game is stuck rather
than themselves. The check plays a whole board.

**Order** can show a run that is not actually consecutive, or offer a letter
that is already sitting in the caterpillar. Either makes the round impossible to
answer by reasoning about the sequence, which is the only thing the game
teaches. The check reads the run back out of the scene and compares it against
the alphabet.

Note that everything in there waits on a condition, never on a duration. Phaser
advances its clock by a fixed per-frame delta, so under headless WebGL — which
renders at roughly half the usual frame rate — game time passes at about half
wall-clock speed, and a 760ms `delayedCall` can take 1.6s of real time. A test
that sleeps a fixed number of milliseconds will pass on your machine and fail in
CI.

Tracing has its own check, because its whole mechanic is input and cannot be
verified by poking scene state:

```sh
npm run dev & npm run verify:trace
```

Every stroke in it is a real mouse down/move/up against the canvas. It asserts
that all 38 letters have something to trace, that tracing raises coverage, that
finishing moves on, that Start again really starts again, and that scribbling
outside the letter counts for nothing — a child will do exactly that, and must
not be rewarded for it.

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
committed because CI has no browser to regenerate it.

That is a deliberate choice rather than an oversight, and it constrains what
`npm test` may do: the Pages workflow sets `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`,
so a test that needs Chromium has to gate on `hasBrowser()` from
`tools/browser.mjs` and skip. Skip at the `describe` level with a reason
(`describe('...', { skip: SKIP }, ...)`) rather than letting a `before()` hook
throw — a failed setup hook *cancels* its subtests, and the build then fails
with three tests silently missing instead of saying there is no browser. Re-run it if you change
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

## How it looks

Four modules, all drawing procedurally rather than loading art — the app has to
work offline on a phone, and a few hundred lines of arcs cost nothing next to a
character sprite sheet and a set of backgrounds at every screen density:

- `src/lib/scenery.js` — the sky, sun, clouds, hills and ground every screen
  sits on.
- `src/lib/mascot.js` — the spider.
- `src/lib/banner.js` — the instruction ribbon across the top of a game.
- `src/lib/celebrate.js` — confetti, the flying star, the dance and the paper.

**The spider is the narrator, not decoration.** It points at the answers while
a question is up, wobbles at a wrong tap and cheers at a right one. Any new game
should give it something to do; `addStageMascot()` puts it in the same spot every
other screen does, which is most of what makes it read as the same character
rather than as a drawing that moved.

Its art is four drawn poses in `public/images/mascot/`, generated by
`npm run mascot` and committed. There is no rig: the one thing an image model
cannot do is draw the same character eight times consistently enough to play
back as frames, but it can draw the same character in another pose. So the app
swaps whole poses and gets its motion from tweens on the sprite.

That has one failure mode worth knowing about. The model redraws the character
at a slightly different size and position every time, so a naive set of poses
makes the spider jolt sideways and change size every time it blinks. The
generator measures each pose and redraws it to sit where the idle pose sits,
anchored on the **feet** rather than the bounding box — raising a leg to point
moves the bounding box but not the part standing on the ground. If you add a
pose, look at the overlay it prints before believing it.

**Every game gets a ribbon.** Set `instruction` and `instructionRoman` on a
QuizScene subclass, or call `addBanner()` directly. The id is a string in
`content/ui.json`; a typo there renders an empty ribbon and nothing else, so
`tests/ui-strings.test.mjs` checks every id a scene references really exists and
really got baked.

**Celebration comes in two sizes.** Confetti and a dance for one right answer;
the full-screen paper fall for finishing something, which is every fifth answer
in a row or a completed letter. Firing the big one on every answer makes it
wallpaper and leaves nothing to mark actually finishing.

Two more rules that keep the look consistent:

**Anything on a coloured surface gets an outline.** `chunkyGlyph()` in
`theme.js` gives a letter the heavy dark edge these apps use. It is not
decoration — a white letter on a mid-tone tile has weak edges, and a child
choosing between ب and ت is working entirely from edges.

**Cards are solid, never translucent.** The scenery behind them moves, and a
cloud drifting through the middle of a letter card reads as a bug.

`makeButton` can draw a card, a star or a scalloped blob. Which one to use is
decided by what goes inside it, not by taste: a five-pointed star is thin across
its middle, so an Urdu letter dropped into one has to shrink a long way to clear
the notches, and letter legibility is the whole point of the letter games. Stars
are for the numerals, which are compact; letters get the blob, which keeps
nearly all of the area.

## Audio hardware

### The buffer, and why speech breaks up when beeps do not

`src/lib/audio-context.js` builds the app's AudioContext and hands it to Phaser,
rather than letting Phaser build its own. Phaser calls `new AudioContext()` with
no arguments, which means `latencyHint: 'interactive'` — the smallest buffer the
browser will give. That is right for a game of short blips and wrong for one
that plays recorded speech over a busy WebGL scene: the audio thread gets very
little time per block, and when it misses the deadline the output underruns.

The symptom is worth knowing by heart, because it identifies the fault on its
own: **an underrun lands somewhere different on every play.** A bad recording or
a bad decode is broken identically every time. If the roughness moves around, the
file is fine and the audio thread is starving.

It also explains a misleading observation. The synthesised interface sounds can
be perfectly clean while a two-second voice clip is rough — both lose the same
fraction of samples, but only one is long enough to hear it happen. "The beeps
are fine" is not evidence that the output path is fine.

The buffer size is a setting, in the sound check, because how much is enough
depends on the device and no amount of testing here can find that out.

For the same reason `celebrate.js` draws confetti as tinted Images sharing one
texture instead of a Graphics object per piece. Each Graphics is its own draw
call, so a full-screen celebration used to break the batch sixty-odd times a
frame — handed to a cheap phone at the exact moment it is also decoding a clip.

### The sound check

`src/ui/audio-check.js`, reachable from the recorder. It plays the same clip four
ways — a bare oscillator, the app's Web Audio path, an `<audio>` element, and the
app's path with the render loop stopped — so which ones sound wrong says which
layer is at fault. Add to it rather than debugging by correspondence: this class
of bug only appears on real phone hardware, so the app has to be able to diagnose
itself in the hands of whoever can hear it.

### Two rules about the microphone

Both learned from a real bug where playback went stuttery after a recording
session and stayed that way back in the game:

**The page holds exactly one AudioContext.** It is Phaser's, reachable via
`getAudioContext()`. A second context is a second claim on the audio device, and
the recorder used to open one per visit.

**The microphone is never held open while anything is played back.** An open mic
moves a phone's audio path into its communications profile — different sample
rate, heavy processing — and everything played through it stutters. The recorder
opens the mic for a take and hands it back a couple of seconds later.

`npm run verify:recording` asserts both, by patching `AudioContext` and
`getUserMedia` in the page and checking what is still open at the end. Note that
a fake capture device will not reproduce the stutter itself — the assertions
check the conditions that cause it, not the symptom.

## Two Phaser 4 traps

Glyphs are sized by **height alone**, so a wide letter silently overflows
whatever box you put it in — and Urdu has letters several times wider than they
are tall (ے, ک). Anything placing a glyph in a bounded space should go through
`fitGlyphHeight()`.

`glyphTexture` caches on the key alone, and its docstring says the key must be
unique per glyph **and size and colour**. It is easy to forget the colour part:
two callers wanting the same letter at the same size in different colours will
silently share whichever was built first, and one of them gets the wrong colour
with no error anywhere.

`RenderTexture` and `DynamicTexture` render nothing in this build — not even a
plain `fill()`. Anything that needs a surface to paint into should use
`textures.createCanvas` and its 2D context, which is what every glyph already
goes through. See `src/scenes/Trace.js`.

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
