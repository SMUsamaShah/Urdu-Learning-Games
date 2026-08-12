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

Every take is trimmed and levelled after it is recorded — see
`src/lib/take-polish.js`. That is not cosmetic: the app plays a letter's name
and then its word back to back, and two clips with half a second of dead air
each turn "bay ... bakri" into a pause a three-year-old will not sit through.
It pads the cut generously rather than gating flush, because a softly-starting
consonant shaved off the front is far worse than a clip that runs slightly long,
and it only ever turns a take *up*.

`npm run verify:polish` is the check that matters there, and the studio's own
verification cannot replace it: that drives a synthetic microphone, which emits
a continuous tone with no silence in it, so the trimming runs and asserts
nothing. The polish check builds audio with known silence at both ends instead.

Recording tips:

- Speak the sound clips as bare phonemes. The instinct is to say the letter's
  name instead, which is the one thing that clip must not contain.
- Do not worry about the silence at the start and end; it is trimmed for you.
  Leaving a moment before you speak is better than clipping your own first
  syllable trying to be quick.
- Watch the level meter. A recording that never leaves the left of the bar is
  too quiet to hear on a phone speaker; one that turns red is clipping.
- A native or fluent speaker's voice, ideally the child's parent. Accent
  matters less than being consistent across the whole set.

You do not have to finish. Missing clips are silent, never broken, so a
contribution of ten good clips is worth having.

## Add a game

Each screen is a Phaser scene in `src/scenes/`. Add the file, register it in
`src/main.js`, and add a tile to the `GAMES` list in `src/scenes/Home.js`.

Three rules the existing screens follow:

**Never render Urdu with `this.add.text`.** Latin romanisation and English
glosses are fine that way; Urdu is not. Use `addGlyph` from `src/lib/glyph.js`
with a glyph from `src/lib/content.js`. The reasons are in the README.

**Size letters by the em, and measure the whole set.** Never ask for a glyph at
a height. A Nastaliq glyph's bounding box says nothing about how big the letters
inside it are: ہ's box is short and full, ک's is tall and mostly the rise of one
stroke, so fitting both to the same height draws ہ at less than a third the size
of ک. The app did that for a while, and it showed everywhere — a strip of 38
letters that looked like several different alphabets, menu labels of assorted
sizes, and answer tiles where the odd big one was a hint.

So pick a box, and hand the whole set of glyphs that will ever be drawn in it to
one of the two fitters in `src/lib/glyph.js`:

- `fitEmAlone(glyphs, w, h)` for a glyph that is the only thing in its own card
  — a tile, a balloon, a strip cell, the big letter on a flashcard. Draw it with
  `addGlyph`, which centres it.
- `fitEmLine(glyphs, w, h)` for glyphs read together as a line — a menu label
  under its icon, the row of form names. It also returns the baseline they all
  sit on; draw them with `addGlyphBaseline` at `boxTop + fit.baseline`. Holding
  one baseline means reserving room for the tallest ascender and the deepest
  descender in the set at once, which costs about a third of the size, so only
  use it where the alignment is worth that.

The set is what the screen draws over its lifetime, not what it draws this
round: fit the alphabet, not the four letters currently on offer, or the size
shifts as the child plays. `src/lib/content.js` has `allLetterGlyphs`,
`allWordGlyphs`, `allNumberGlyphs` and `uiGlyphs` for exactly this.

Name the texture key `<role>:em<N>:<id>` — role being the place on the screen,
so `strip`, `hero`, `find-choice`. `verify:sizing` reads those keys back and
fails if one role is ever drawn at two sizes.

**No fail states.** This is for a very young child. A wrong answer should
prompt a retry, never a penalty, a buzzer or a dead end. If a button cannot do
anything useful, do not show it rather than disabling it.

**Make it move.** A screen where nothing moves reads as switched off, and this
is the half of the app a three-year-old is actually here for. There is a kit for
it, and using it is cheaper than inventing tweens per scene:

| module | for |
|---|---|
| `src/lib/liveliness.js` | `popIn`, `bob`, `breathe`, `sway` for idle; `squash`, `jig`, `hop` for reactions |
| `src/lib/particles.js` | `sparkleBurst`, `popPuff`, `ringBurst`, `starShower`, `sparkleTrail` |
| `src/lib/celebrate.js` | `confetti` and `dance` for one answer, `paperFall` for finishing something |
| `src/lib/sfx.js` | `tap`, `pop`, `boing`, `flip`, `sparkle`, `correct`, `nudge`, `fanfare`, `drumroll`, `tada`, `whoosh` |
| `src/lib/music.js` | the background tune; `duck()` is called for you whenever a clip plays |

Three things about it that are decisions rather than taste:

- **A tap has to move the thing that was tapped, within a frame.** `squash` on
  the `pointerdown` event, not after whatever the tap triggers. A tap that
  produces no movement feels broken however correct the response is.
- **Ration the big effects.** `paperFall` and `starShower` are for finishing
  something — a fifth right answer, a completed board, a traced letter. Firing
  them on every answer turns them into wallpaper within a minute, and then there
  is nothing left to mark actually finishing with.
- **Anything infinite gets a per-item delay.** `stagger()` does this. Eight
  tiles bobbing in unison is a machine.

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

Judging whether the tune is any good is the one thing no check can do, so there
is a command that hands you a file to listen to:

```sh
npm run dev & npm run music:preview -- 40 tune.wav
npm run music:preview -- 24 celesta.wav --instrument celesta   # audition a voice
```

It asks `music.js` to render itself through an OfflineAudioContext — same
instruments, same reverb, same transport — then checks the result for clicks and
clipping before writing it, and normalises it for listening, because in the app
the music sits at about -19 dB to stay under the voice and an honest render is
far too quiet to judge on laptop speakers. The level it actually plays at is
printed alongside.

It renders rather than records, and that distinction is load-bearing. The first
version tapped the live output through a `ScriptProcessorNode`, whose callback
runs on the main thread — the same thread running a WebGL game at single-figure
frame rates under software rendering. The callback was starved, and the file
came back with jumps of half of full scale in it, which sound like a speaker
tearing. The music was fine. It cost a round trip of rewriting a tune that was
never the problem, which is why the click check now runs on every render.

The melody is played on **recorded samples**, not a synth, and that is the third
attempt at making it sound decent — hand-rolled Web Audio and Tone.js synth
voices both came out correct and unpleasant. Five notes of one instrument live
in `public/audio/instruments/`, fetched by `node tools/fetch-instruments.mjs`
from gleitz/midi-js-soundfonts (MIT, from FluidR3_GM, also MIT). Only the
instrument in use is committed and precached; the alternates are gitignored and
exist for auditioning.

If you change which instrument that is, change it in **both** `src/lib/music.js`
and `vite.config.js` — one picks what is fetched, the other what is precached,
and a mismatch gives you a tune that works everywhere except offline.
`tests/music-instrument.test.mjs` fails if they drift apart.

Strudel was considered and rejected: it is AGPL-3.0-or-later, as is
`webaudiofont`, and either would pull this MIT project into copyleft. Its
strength is pattern composition rather than sound quality anyway — the quality
came from using samples, which needs no library at all.

If you touched the music, the particles or the animation helpers:

```sh
npm run dev & npm run verify:fun
```

It listens to the tune through an analyser rather than asking the module whether
it thinks it is playing, checks it ducks under a voice clip and comes back up,
fires three dozen bursts and asserts every emitter cleaned itself up, and checks
each animation both *moved* its target and put it back exactly.

That last pair matters more than it sounds. Everything Phaser drives — tweens,
timers, particle lifespans — advances by a fixed delta per rendered frame, and
headless WebGL renders at about nine frames a second, so two seconds of
`setTimeout` buys roughly three hundred milliseconds of game time. A check that
waits in milliseconds does not merely flake: a tween that has not started leaves
its target exactly on its mark, so "the animation puts things back" passes
because nothing happened. Count frames, and assert the movement happened before
asserting it was undone. Web Audio is the exception — it runs on the audio
clock, which is real time — so the music section waits in milliseconds and is
right to.

If you drew any Urdu at all, check it came out one size and stayed inside its
card:

```sh
npm run dev & npm run verify:sizing
```

It fits every glyph in the app into a range of deliberately awkward boxes and
asserts none of them overflows and that the fit is actually maximal, then walks
every screen and asserts no role is drawn at two sizes. Both failures are silent
— one letter of a hundred and twenty-three hangs over the edge of its tile, or
one screen quietly disagrees with the rest — so clicking through the game does
not find them.

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

It also checks the gate is *styled* the first time it appears, which sounds
trivial and is not. Anything shown before a dynamic import cannot rely on the
CSS that import pulls in, and the gate is the thing that decides whether the
recorder loads at all. Its rules lived in `recorder.css` for a while, so the
first prompt anyone ever saw was unstyled text in the corner of the screen and
every one after it looked right — a bug that fixes itself after one use, which
means nobody reports it and everybody hits it. Styles for anything on that side
of a dynamic import belong with the module that draws it.

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

**Big letters on a coloured surface get an outline; small ones do not.**
`chunkyGlyph()` in `theme.js` gives a letter the heavy dark edge these apps use.
It is not decoration — a white letter on a mid-tone tile has weak edges, and a
child choosing between ب and ت is working entirely from edges.

Two things about how it is measured, both learned the hard way:

The width is a fraction of the font's **em**, not a number of pixels. A glyph's
display height says nothing about how thick its strokes are: گنتی has a deep
descender on its ی, so fitting it into a 44px label scales it down about ten
times harder than a bare ب at the same height. A line in pixels then lands ten
times heavier on it — 103‰ of the em against 32‰ — and the word reads as fuzzy
black rather than as white with an edge.

Below 50px of em, `glyph.js` drops the outline entirely rather than drawing it
thin. Nastaliq at label size is already at the limit of what a screen resolves,
so *any* dark edge closes the counters. That number is measured, not guessed:
every menu label in the app lands between 17 and 42, every letter drawn as part
of a game lands between 67 and 163, and nothing sits near the line.

`strokeWidth` still exists for the one case that genuinely wants a constant
on-screen line whatever the glyph — the tracing guide, which has to stay visible
at any size.

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

This was a real bug on a real phone, and the buffer alone was the cause. Two
other things changed in the same commit and neither of them was it: confetti
became cheaper to draw, and microphone processing became selectable. The
confetti was ruled out by the person who could hear the fault — the screens they
tested play a clip with no confetti on them at all — and the microphone settings
cannot change clips that were already recorded. Worth recording, because "we
changed three things and it went away" is not a diagnosis.

`celebrate.js` drawing confetti as tinted Images sharing one texture instead of
a Graphics object per piece is therefore a plain optimisation rather than a fix.
It is still worth having: each Graphics is its own draw call, so a full-screen
celebration used to break the batch sixty-odd times a frame.

### Graphics objects are not sprites

The single most important performance fact about this app, and the least
obvious. A Phaser `Graphics` object re-tessellates its geometry into triangles
on the CPU **every frame it renders**, and each one flushes the draw batch.
Thirty-eight stroked rounded rectangles that never change are thirty-eight lots
of that work, sixty times a second. Sprites and Images upload once and batch;
Graphics do not, so the usual intuition that "a few dozen simple shapes is
nothing" does not apply.

Render cost tracks the Graphics count almost linearly:

| screen | Graphics | render, relative |
|---|---|---|
| Flashcards, before | 49 | 8.0 |
| Flashcards, after | 11 | 2.7 |
| Home | 26 | 5.9 |
| Find the letter | 15 | 2.8 |

Confirmed on real hardware: the letters screen ran at 30fps on a Pixel with 49
Graphics and 60fps with 11. The strip's 38 cells are now three shared canvas
textures used as tinted Images instead of a Graphics each.

Those numbers are **ratios, not milliseconds**. Every measurement in this repo
is taken under headless Chromium, which has no GPU at all — it runs SwiftShader,
a software rasteriser. Relative costs on the CPU side carry over to a real
device; absolute timings do not, and neither does anything that depends on the
GL driver. Check `npm run dev` with the frame-rate readout on a real phone
before believing a rendering conclusion.

**Baking `makeButton` the same way was tried and reverted, and why it failed is
not settled.** Creating roughly twenty textures at runtime produced faces with
rectangular chunks missing, through both `textures.createCanvas` and Phaser's
own `generateTexture`. That was only ever observed under SwiftShader, which is
exactly what a software rasteriser does when it runs out of room, so it may well
work on a GPU — it is *not* established that Phaser cannot do this. The same
caveat applies to the note further down about `RenderTexture` and
`DynamicTexture` rendering nothing. If you retry any of it, do so on a device
and look at the screen.

### The frame-rate readout

`src/lib/fps.js`, switched on from the grown-ups screen. It exists because "it
feels jerky" has two causes that need opposite fixes — the app is dropping
frames, or the app is running at sixty and mishandling the input — and by eye
they are indistinguishable. Check the number before optimising anything.

That distinction has already bitten once here. The letter strip scrolled badly
and the obvious suspect was its 38 draw calls; the actual cause was reading the
drag delta from `pointer.prevPosition`, which is the pointer's position at the
*previous frame* rather than at the previous event. A pointermove that fires
twice in one frame therefore applied the same delta twice, and one that did not
fire applied nothing. Frame rate was never the problem.

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

Caveat worth keeping in mind: that was observed under headless SwiftShader, like
everything else measured here, and has never been checked on a GPU. It may be a
software-renderer problem rather than a Phaser one. The canvas route works
everywhere and is what the app relies on, so nothing depends on the answer — but
do not quote it as a fact about Phaser.

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
