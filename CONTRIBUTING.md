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

**"The room" means two different things, and keeping them apart matters.** The
*noise floor* — hiss, a fridge, the street — is `take-polish.js`'s job, and its
expander opens 14 dB above whatever floor it measured. *Reverberation* — the
same voice arriving again off the walls — is `src/lib/dereverb.js`'s, and it
needs a spectral method because a tail sits 10 to 25 dB below the voice, which
on any real take is far above where that expander is already wide open. For a
long time only the first existed while the file said it "reduced the room",
which is how the app came to be described as fixing reverb it had never touched.

`dereverb.js` measures the room from the recording — the decay after the word
stops, backward-integrated — and subtracts a prediction of the tail bin by bin.
It **declines** a dry take, and that is the safety property: there is no upside
to suppressing a room that is not there, and the downside is a hollow voice.
Two rules make the measurement mean anything: start the fit *below* the word
(a syllable's own release reads as a room, and scales with how long the word
was), and stop it before the decay flattens onto the microphone.

Two checks, and they answer different questions. `tests/dereverb.test.mjs` runs
in Node against a dry syllable convolved with a room of a *stated* T60, so it
can assert that the measurement is right and that the voice gains 6 dB on the
room — the old check could not have failed on reverb at all, because its test
signal was white noise plus a syllable with no reverb in it. `npm run
verify:polish` then runs the whole pipeline in a browser at a phone's sample
rate, and asserts the reverberant take trims to nearly the same length as the
dry one; with the suppression switched off it comes out 0.4s longer, because an
untouched tail holds the trim gate open. The studio's own verification replaces
neither: it drives a synthetic microphone emitting a continuous tone, so the
trimming runs and asserts nothing.

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
`src/main.js`, add it to the `GAMES` list in `src/lib/games.js`, and draw its
tile in `src/lib/tile-faces.js`.

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
| `src/lib/sfx.js` | `tap`, `pop`, `boing`, `flip`, `sparkle`, `nudge`, `whoosh` — short synthesised gestures |
| `src/lib/flourish.js` | `rightAnswer`, `milestone`, `finished` — the rewards, played on a sampled instrument |
| `src/lib/music.js` | the background tune; `duck()` is called for you whenever a clip plays |

Three things about it that are decisions rather than taste:

- **A tap has to move the thing that was tapped, within a frame.** `squash` on
  the `pointerdown` event, not after whatever the tap triggers. A tap that
  produces no movement feels broken however correct the response is.
- **Rewards are music, gestures are noise.** A tap blip or a balloon pop is over
  in a tenth of a second and nobody has ever wished a UI click sounded richer —
  those stay synthesised in `sfx.js`. The sound for a right answer is the most
  heard thing in the app, a child gets it a hundred times a session, and it is
  judged as music: those live in `flourish.js` and are played on a real
  instrument through a reverb. The synthesised versions are still there as the
  fallback for before the samples load.
- **Ration the big effects.** `paperFall` and `starShower` are for finishing
  something — a fifth right answer, a completed board, a traced letter. Firing
  them on every answer turns them into wallpaper within a minute, and then there
  is nothing left to mark actually finishing with.
- **Anything infinite gets a per-item delay.** `stagger()` does this. Eight
  tiles bobbing in unison is a machine.
- **Never read `target.scale`.** The getter returns the *average* of scaleX and
  scaleY and `setScale(n)` writes that average back to both, so an animation
  that round-trips through it squares up whatever it touched — a little more on
  every tap. Every picture here is sized with `setDisplaySize` and is not
  square. The helpers in `liveliness.js` keep the two axes apart; anything new
  must too, and the check in `verify:fun` uses a deliberately non-square target
  because a square one cannot see the bug.

Backdrops and anything else that does not move belong in a **baked texture**,
not a Graphics object. `scenery.js` rasterises sun, hills, grass and flowers
into one canvas texture drawn as a single Image; a Graphics re-tessellates its
geometry on the CPU every frame whether or not it changed, so the previous
version was paying for four hundred ellipses sixty times a second to show a
still picture. Baking it made the meadow both far more detailed and measurably
cheaper — a frame on the menu went from 76ms to 65ms under software rendering,
and on a game screen from 62ms to 48ms.

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

If you changed what the app *says* — `src/lib/say.js`, the scheduling in
`src/lib/audio.js`, or the point in a game where a letter is spoken:

```sh
npm run dev & npm run verify:speech
```

The repo ships no recordings, so every other check runs in silence and cannot
see a speech bug at all. This one serves a full invented set over intercepted
routes, with a delay it can turn on for one clip, and records every buffer the
app actually starts. That is what it takes to catch the ordering faults: a clip
that lost a race arriving late and speaking over its replacement, and a
name-then-word sequence finishing on top of whatever was tapped during the gap.

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
not be rewarded for it. It also measures every guide against the letter it
claims to write, which is the check that matters most: a path that traces half
a ص follows, completes and celebrates exactly as if it were right.

If you touched the pen paths, the editor or the font, there are two more:

```sh
npm run verify:trace-studio     # starts its own server
npm run dev & npm run verify:traces
```

The first drives the desktop studio: drag a point, long-press one away, import
an export, and assert `content/strokes.json` on disk changed to match — then
restores the file byte for byte. The second drives the in-app editor through
the real parental gate, saves a correction, reloads, and asserts the Write
screen guides along the *edited* path rather than the bundled one. That tier is
invisible from anywhere else, because the bundled path is still in the bundle,
unchanged.

Both end on the case that will only happen months from now: serve a
`glyphs.json` baked from a different font, and every letter must fall back to
colouring in. A stroke is a centreline through one typeface's outlines, so
against another it sits beside the letter — and a guide beside the letter
teaches a child to write it wrongly, which is worse than not teaching them at
all.

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

Pictures are drawn on a transparent background (`background: 'transparent'`,
and a PNG, which is the only output format that carries alpha). The thirty-seven
already committed were not: they were drawn on white, and `tools/cutout.mjs`
keyed it out. It still does, for them. Every run re-cuts every picture from the
cache, so that code cannot be deleted without changing thirty-seven files the
next time somebody adds a word.

What it does now is look at the border first. An empty border means the picture
arrived transparent and there is nothing to key, so the fill is skipped and the
subject is allowed to touch the frame. A white border means the old path, and
the run says so: "37 of 37 arrived on a background and had it keyed out". A
*new* word in that count means `background: 'transparent'` did not take, and the
picture wants looking at.

The fill is seeded from the border and is not a threshold. That distinction
matters: a threshold would also erase white *inside* the subject — the
football's panels, the zebra's stripes, the hailstones — whereas a fill only
takes white connected to the edge. The 1024→384 downscale that follows turns
the hard-edged mask into a smooth one for free.

If you add a word whose English gloss is not a good art brief ("fruit", "halwa"),
add an entry to `OVERRIDES` in `tools/make-word-images.mjs` rather than accepting
whatever the gloss produces.

## Props

`public/images/props/` is generated by `npm run props`, which needs an OpenAI
key in the environment. `npm run preview-props` then puts every one of them on a
sheet over four grounds, the last of which is magenta — a cut-out cannot be
judged on white, because a white halo is invisible there and obvious the moment
it lands on grass.

**Not every prop may be generated.** A prop qualifies when it is furniture: one
fixed picture, no colour assigned by the game, no geometry worked out when the
round is dealt. That rules out both of the props in `src/lib/props.js`, which is
why that file is not going anywhere — the baskets take the game's colour so two
of them can be told apart at a glance, and the caterpillar's body is built
around wherever its segments landed. Fishing's fish and Bounce's balls are the
same case: their colour is the letter's shape family.

Briefs are the opposite of the tile briefs. A tile asks for a scene; a prop asks
for one object and explicitly no ground, no sky and no surface to stand on,
because a prompt that describes a background overrides `background:
'transparent'` and the model paints one anyway.

Each picture is trimmed to its own alpha bounding box and the manifest records
the size, so a scene asks for a width and gets an object that wide. A prop with
`front` is written twice — whole, and with everything above that line erased —
at the same size and origin, which is how Whack's letter rises out of a hole
rather than sliding up in front of a mound.

A prop that is missing, unloaded, or dropped for coming back opaque leaves the
scene drawing what it drew before. None of the ellipses have been deleted, and
`verify:games` checks every prop screen still fits on the screen — add a scene
to `PROP_SCREENS` there when it gains a prop, since the first generated prop
went in with that list still naming two other games.

## Which games the menu shows

`src/lib/games.js` is plain data: what exists, nothing about where it goes.
There used to be three castes in it — `featured`, a `spelling` group, and
everything else behind a "more games" tile — and none of it meant anything to a
child.

Two preferences arrange that list, and they are deliberately separate stores:

- **On and off** is the `'game'` kind in `src/lib/enabled.js`, which already
  keeps the *disabled* set so a game added next month is on for everybody.
- **The order** is `src/lib/menu.js`, a list of scene keys reconciled against
  `GAMES` on every read. Keys rather than indexes, and reconciled on read rather
  than migrated on write, so a saved order survives a game being added or
  removed.

`menuGames()` is what everything deals from, and it falls back to the whole list
when nothing is left switched on — the same `orAll` discipline as
`activeLetters()`. A menu you cannot get back to Settings from is not an option.

**Anything that lists games must ask at call time.** `chalo.js` read its
playable list once at import and went on offering a switched-off game for the
rest of the session; a run is the one place a child meets a game without picking
it, so nobody would have seen where it came from.

## Swiping, and telling a drag from a tap

The menu shows `PER_PAGE` tiles and swipes sideways. `src/lib/swipe.js` decides
whether a gesture was a drag or a tap, and both the menu and the Flashcards
letter strip use it — a tile's `onTap` asks `swipe.moved()` before doing
anything.

That threshold is the whole risk of a draggable list, and the deleted
`games-panel.js` refused to have one for exactly that reason: *"a child pressing
a tile and moving their finger a few pixels would scroll instead of choosing."*
`verify:games` checks both directions, because they fail apart — a slop of zero
swallows every tap and a slop of infinity opens a game on every swipe.

**Paging is not navigation** and pushes no history entry, or the back button
would walk back through pages a child swiped past instead of leaving the app.

One trap worth knowing: the menu's tiles live inside the container the pager
slides, so a check that filters `scene.children.list` for `name === 'tile'`
finds none of them. Walk the tree. Three checks already did; two did not, and
one of those had been quietly testing nothing.

## Which letters come up

`src/lib/mastery.js` keeps the last ten answers per letter, number and word, and
every game deals by them. A letter answered wrong every time comes up about four
times as often as one answered right every time; a letter never answered sits
between the two, so meeting the alphabet does not depend on chance.

Two rules make the rest of it follow.

**Recording goes through `rightAnswer` and `wrongAnswer` in `flourish.js`,**
never through a separate call in a scene. Those two are already what a scene
calls when an outcome is known, they already move the progress total, and a
scene passes `{ kind, id }` to say what was answered. Two calls in seventeen
scenes that must fire together would not stay together.

A wrong answer is recorded against the **target**, not the tile that was tapped.
Reaching for ت when the question was ٹ is evidence about ٹ.

**Record only where being wrong is possible and means something.** Memory and
LetterPuzzle pass no subject, and both say why in place: turning up a matching
pair is recall rather than reading, and a jigsaw piece dropped off its home is a
small hand missing a target. A screen that reported only its successes would
quietly talk down the weight of a letter he cannot read at all.

Two selection helpers replace what the scenes used to do for themselves:
`pickWeighted` for `GetRandom(pool)` and `pickSomeWeighted` for
`Shuffle(pool).slice(0, n)`. `chooseWeighted` is the generic one underneath, for
the screens that choose a *window* rather than a letter — Caterpillar, InOrder
and Sequence deal a run of the alphabet and weigh the run by what is inside it.

Distractors are not weighted. `shapeFamilySiblings()` picks them by
confusability, which is a different question and already has a good answer.

Flashcards is the one screen deliberately left alone; the reason is in its
docstring.

`Settings → How he's doing` shows the record, and `npm run verify:games` checks
both ends of the wire: that playing a game badly records something, and that the
scene's own `pickTarget` then deals that letter more often.

## How it looks

Five modules, all drawing procedurally rather than loading art — the app has to
work offline on a phone, and a few hundred lines of arcs cost nothing next to a
character sprite sheet and a set of backgrounds at every screen density:

- `src/lib/scenery.js` — the sky, sun, clouds, hills and ground every screen
  sits on.
- `src/lib/rail.js` — the opaque strip down the left of every game screen, and
  `src/lib/indicators/` — what stands in it. Five so far: a vine climbing a
  cane, the same vine with a ladybird riding the tip, a tree that leafs out, a
  bar that fills, a glass of juice.
  `src/lib/indicators/greenery.js` is the parts bin the growing ones are
  assembled from.
- `src/lib/mascot.js` — the spider, now only on the menu.
- `src/lib/banner.js` — the instruction ribbon across the top of a game.
- `src/lib/celebrate.js` — confetti, the flying star, the dance and the paper.

**Progress has a room of its own.** Two hundred pixels down the left of every
game screen, opaque, no scenery showing through, and the same on all twenty-four
— that is `RAIL` in `theme.js`, and every scene's left margin is now
`RAIL_EDGE + something` rather than its own guess at the same number. The way
out sits at the top of it.

What stands in the rail is swappable, and Settings chooses. An indicator is a
module in `src/lib/indicators/` exporting `create(scene, { width, height })`; it
knows nothing about levels and subscribes to nothing. The rail owns the
subscription and hands each change down as `apply(next, previous)`. A scene
talks to the rail the way it talked to the character: `this.rail?.wonder()` for
a wrong answer, `cheer()` for finishing something.

**Draw to the box, and fill it at zero.** Both rules were learnt from the pot
plant that used to be here. It drew itself at a fixed 648 pixels and shrank to
fit, so in a rail 570 tall it reached less than half way up however far a child
got; and with nothing earned yet it was a thumbnail of a flowerpot at the foot
of a floor-to-ceiling panel. So: take the height you are given and build to it,
the way `bar.js` does with `trackTexture(scene, height)`; and draw the
structure — the cane, the tube, the glass — before anything has been earned, so
what progress changes is what is *on* it rather than how much of the strip has
anything in it.

**Assemble from parts, do not bake frames.** The plant baked a 200×400 canvas
per step of growth: sixty-six possible frames at about three quarters of a
megabyte each, behind a cache that threw them away as fast as it made them.
`greenery.js` bakes one stem, one leaf, one flower per variety, and growth is
one more sprite becoming visible. Anything baked there is oversampled, so every
sprite made from it needs `setScale(1 / SUPERSAMPLE)` — miss it and the whole
composition is half as big again as the box, which is exactly as obvious on the
preview sheet as it sounds and completely invisible in the code.

**Nothing a child taps may sit under the panel.** `npm run verify:rail` walks
every game looking for one, and found seven the day the rail went in.

**چلو plays the app for itself.** `src/lib/chalo.js` holds one run: a shuffled
bag of games, opened through `Home.openGame`, advancing when an activity
finishes. The signal it waits on is `wellDone()` in `stage.js`, which is the one
moment every game agrees on — sixteen scenes call it after a board is finished
and QuizScene calls it on the fifth right answer — so a new game joins a run
without knowing a run exists. Flashcards is the one screen that never finishes
anything, and gets a timer from `armBrowseTimer()` instead.

Two rules the run depends on, both checked by `npm run verify:chalo`. Every game
after the first **replaces** its history entry rather than pushing one, so a run
is one back press deep however long it has gone on. And `openGame` stops
whatever is on screen before starting the next, because stepping from game to
game skips the menu and nothing else would.

**Nothing on the menu honours a second tap.** Every departure waits 150ms so the
tile is seen to react, and a three-year-old can hit two more things in that
time — which used to start three games at once, all running, all on the stack.
`Home.leave()` is the latch; it opens again when the menu is rebuilt.

**Run `verify:progress` against yours.** It takes an `INDICATOR` — `INDICATOR=tree
npm run verify:progress` — because the level ceremony and the setback that
crosses a level are the two paths every indicator writes for itself, and a run
against the default proves nothing about the rest. Adding that knob turned up
that half the file's assertions were written against one indicator's texture
keys; they now test what happened rather than what it was called.

**One wheel of twenty colours.** `levelHue()` in `canvas.js` decides what colour
level *n* is, and the bar, the glass and every plant read from it — so whichever
indicator is chosen, level nine is the same colour of thing. Twenty, generated
rather than authored: `readable()` darkens a hue until it clears the panel
behind it, and the wheel skips the green quarter, because a green flower on a
green vine is a flower nobody can see. `tests/palette.test.mjs` holds both of
those, plus the spacing that stops two consecutive levels being neighbouring
shades. Add a colour by changing `LEVEL_CYCLE`, not by typing a hex string.

`npm run preview-indicators` draws every stage of each one onto a sheet, at the
rail's own 200×560. Use it: whether a vine looks like a vine is not something a
test can answer, and the alternative is playing to level nine to find out what
level nine looks like. The sheet used to be laid out 380 tall, which is how an
indicator that filled two thirds of the real rail passed a look at it.

**The menu tiles are drawn in code.** Every one of the twenty-five is a
function in `src/lib/tile-faces.js` that paints a miniature of the game — three
balloons with letters on them, four cards with two turned over, a letter with a
jigsaw piece out of it — using the app's own palette and real baked glyphs.

They used to be generated illustrations with Nastaliq composited into named
slots afterwards, and it never came together: an image model draws in its own
light and its own line weight, so twenty-five tiles read as twenty-five
different apps, and a glyph pasted onto somebody else's painting looks pasted
on. The halo stroke that made the letters legible over the illustration is what
made them look stuck on.

Drawing them here fixes both at once, and it is also why the tiles have no
caption any more: a three-year-old cannot read either line, so the name band
spent a third of every tile saying nothing to the person choosing while covering
the part of the picture that could have said it. The picture is the label now.

Adding a game means adding a face; `tests/tiles.test.mjs` fails if you do not,
and also fails if a face asks for a letter id that does not exist or for a form
that letter never takes — the failure mode there is silent, a hole in the
drawing where the letter should be. `npm run preview-tiles` puts all
twenty-five on one sheet at the size the menu shows them at, which is the only
way to answer the question that matters: does a child look at this and know
which game it is.

**And the same pen draws the play area.** `src/lib/draw-kit.js` holds the kit —
rounded rectangles, circles, polygons, curves, baked glyphs, one palette — and
both `tile-faces.js` and `src/lib/props.js` use it, so a basket on a tile and a
basket on a screen are the same basket. Props are baked into a texture and
never redrawn, for the same reason the meadow is: a Phaser Graphics
re-tessellates every frame for a picture that never changes.

Two screens have been through this so far, and both were chosen because the
picture was saying nothing. "Sort the letters into baskets" was two rounded
rectangles, on a backdrop with real baskets painted into it — the scenery was
better drawn than the thing being played with. "Caterpillar" was a row of white
circles with no caterpillar anywhere on the screen. The rest of the games are
still waiting their turn.

The failure mode to know about: a prop's texture is sized from arithmetic over
the drawing, and getting it too small does not throw. It crops. The first
caterpillar came out with the side of its head missing, and then, once the
texture was big enough, ran the head off the right of the canvas. `npm run
verify:games` ends by checking every object named `prop` lies inside the stage,
which catches the second and would have caught a lot of the first.

**The spider is still the narrator on the menu.** Its art is four drawn poses in
`public/images/mascot/`, generated by `npm run mascot` and committed. There is
no rig: the one thing an image model cannot do is draw the same character eight
times consistently enough to play back as frames, but it can draw the same
character in another pose. So the app swaps whole poses and gets its motion from
tweens on the sprite.

That has one failure mode worth knowing about. The model redraws the character
at a slightly different size and position every time, so a naive set of poses
makes the spider jolt sideways and change size every time it blinks. The
generator measures each pose and redraws it to sit where the idle pose sits,
anchored on the **feet** rather than the bounding box — raising a leg to point
moves the bounding box but not the part standing on the ground. If you add a
pose, look at the overlay it prints before believing it.

**Deal from `activeLetters()`, never from `letters`.** A parent can switch any
letter, word or number off in Settings, and switched off means gone: not an
answer, not a wrong answer, and not one step of a sequence a game builds for
itself. `src/lib/content.js` has `activeLetters()`, `activeWords()` and
`activeNumbers()` for that, and `sequenceFor()`, `shapeFamilySiblings()` and
`wordForLetter()` already respect them. The raw `letters` / `words` / `numbers`
exports stay for Settings, the recorder and the tracing editor, which need the
whole list whatever is being taught this week.

Two exceptions that are deliberate. `allLetterGlyphs()` sizes against the full
alphabet, or a letter would change size when a sibling is switched off — but
`allNumberGlyphs()` sizes against the band, because the numbers run to ۱۰۰۰۰۰
and a screen of ۰–۹ measured against a six-digit number draws every digit tiny.
And below three items of a kind the filters fall back to everything: a parent
who leaves two letters on has not asked for a matching game with two cards in
it, and a game that cannot be finished is harder to diagnose than a setting
that did not take.

**Do not edit source while a verifier is running.** Vite reloads the page,
`window.__game` goes away, and the run dies with "Cannot read properties of
undefined (reading 'scene')" at whatever line it had reached. It looks exactly
like a real crash and it costs an hour to chase. Wait, or edit something the dev
server is not watching.

`npm run verify:content` is what holds this. It switches a letter off and looks
at what all twenty-one letter screens are *holding* rather than what they
happen to deal — OddOne shows four letters out of thirty-eight a round, so a
check that watched a round would pass about nine times in ten.

**One letter of a word, in another colour.** The Letters screen draws the
taught letter, its positional forms and the same letter *inside* its word in one
purple, so a child can see where the shape they are looking at turns up. The
word is the hard half: AlQalam Taj fuses joined letters into single outlines, so
`tools/bake-glyphs.mjs` records which source characters each output glyph covers
(`clusters: [{from, to, d}]`) and `taughtCluster()` hands back an outline only
where a cluster is *exactly* the taught letter. Nine of the thirty-seven words
qualify; the rest are drawn plain, because a cluster covering two letters would
colour both and say the second was the first. `tests/content.test.mjs` asserts
that nine, exactly — a font change that quietly took it to three would leave the
screen working and teaching nothing.

**And the same word taken apart.** Under بکری the screen spells out ب ک ر ی, a
cell per letter, right to left, with the taught letter's cell tinted. This is
the other half of the same lesson and it is the half that works everywhere: the
word above can only be coloured where the typeface leaves a letter separable,
while `brokenWord()` looks each character up in `letters.json` and gets the
whole alphabet's worth. It is also all-or-nothing — چائے is written with ئ,
which is not one of the thirty-eight letters and has no glyph, so that one word
declines the row rather than showing itself with a gap. `tests/content.test.mjs`
names it, so a second word joining it is loud.

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

`src/lib/fps.js`, switched on from Settings → App. It exists because "it
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

Glyphs must never be sized by height alone: Urdu has letters several times wider
than they are tall (ے, ک), so a size chosen to fit the box vertically silently
overflows it sideways. Anything placing a glyph in a bounded space goes through
`fitEmLine()` (several glyphs sharing a baseline) or `fitEmAlone()` (one glyph
with the box to itself). Which of the two is a real choice — see the note at the
top of `src/lib/glyph.js`.

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
