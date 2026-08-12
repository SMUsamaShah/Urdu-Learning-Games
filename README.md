# اردو کھیل — Urdu Learning Games

Free, open source, ad-free games for teaching young children the Urdu alphabet,
numbers and first words. Runs in a browser, installs to a phone home screen, and
works offline.

There are excellent preschool alphabet apps for English. There is nothing
comparable for Urdu. This is an attempt at one.

**No ads. No in-app purchases. No tracking. No network calls at runtime.**

Everything you hear that is not a human voice is synthesised at runtime — the
music, the taps, the pops, the fanfares — so there is no audio to download and
it all works on a plane.

## Status

Early. What works today:

- **Flashcards** — every letter, all of its positional forms, and its word.
- **Six games** — free exploration of the alphabet, picking a letter out of a
  line-up, popping the right balloon, matching a word to its picture, counting,
  and tracing letters with a finger. The letter games draw their wrong answers
  from the same shape family as the right one, so the choice is always between
  letters that differ only in their dots.
- **A picture for every word**, drawn once and committed, so a child who cannot
  read yet still knows what انگور means.
- **Built to look like a toy**, not a tool: the games happen in a park with sky,
  clouds and hills, answers are sticker cards with heavy outlines, and getting
  one right throws confetti.
- **Audio system** — plays a letter's name, its sound and its word. Ships with
  no voice recordings, so the app is silent until somebody records it.
- **Record in your own voice**, on any device, stored on that device and
  exportable. See [Recording in your own voice](#recording-in-your-own-voice).
- **Installable and offline** — add it to a phone's home screen and it runs
  with no network, recordings included.

Every letter now has a word except `ء` (hamza), which is closer to a diacritic
than a letter and has no word a three-year-old could picture. See
[the roadmap](#roadmap).

## Run it

```sh
npm install
npm run bake     # generates content/glyphs.json from the font
npm run dev      # http://localhost:5173, also served on your LAN
```

`npm run bake` has to run once before the app will start, and again whenever
anything under `content/` changes. The output is committed, so a fresh clone
only needs it if you edit content.

To try it on a phone, run `npm run dev` and open the network address it prints
on a device on the same wifi.

## The games

**Letters** is free exploration: pick any letter, see it large with every
positional form it actually has, and the word that teaches it. Nothing is
locked and there is no wrong move.

**Words** shows a word and asks which picture it is — winnable with no letter
knowledge at all, which is the point: it teaches whole words by shape, the way
a reader knows "the" long before sounding it out.

**Numbers** shows a group of things and asks how many. Counting comes before
numerals, so the objects are the question and the Urdu digit is the answer, and
the wrong answers are the neighbouring numbers because off-by-one is how
counting actually goes wrong.

**Find the letter** and **Balloons** ask the same question in two ways: which of
these is the letter? Both work whether or not anything has been recorded. With a
recording, the letter is spoken and the child maps a sound to a shape. Without
one, the letter is shown and the child matches shapes — and since the wrong
answers come from the same shape family, that means telling ب from ت from ث,
which is the discrimination Urdu reading actually turns on. Once a child is a
few in a row, the shown prompt switches to a different positional form, so it
stops being a silhouette match and starts being recognition.

**Write** shows a letter as an empty outline and fills it in colour wherever a
finger goes. Ink only lands inside the letter, so a stroke that wanders off does
nothing at all — nothing is marked wrong, there is simply nothing there. The
round is won by covering enough of the shape.

There is deliberately **no stroke-order guide**. Doing it properly would mean
hand-authoring a start point, direction and stroke sequence for all 38 letters
before a single one became playable, and it would score a three-year-old on
something they cannot do yet. At three the job is fine-motor control and
learning what the shape is; stroke order matters when a child starts writing
properly, and can be layered on later without changing any of this.

No game has a fail state. A wrong answer nudges, keeps the round, and lets the
child try again.

## Installing it on a phone

Open the deployed URL on the phone and use the browser's "add to home screen"
(Chrome offers a button on the menu screen; on iOS it is Share → Add to Home
Screen). It then launches full screen with no browser chrome, and works with no
network — the app, the letter outlines and every voice recording are all cached
on first load.

## Recording in your own voice

Tap **Grown-ups** on the home screen (hold it, then answer the sum — that is
there to stop a three-year-old finding it) and you can record every clip in the
app, on whatever device you are holding.

Those recordings stay on that device. They are stored in the browser, never
uploaded, and they override whatever the app shipped with — so your child hears
you rather than whoever recorded the repo.

**Export keeps them safe and moves them around.** Export writes a single `.zip`.
Import it on another phone or a desktop and that device has the same voice.
Worth doing regularly: browser storage is not permanent, and Safari clears it
after a week for a site that has not been added to the home screen. The recorder
tells you when it is holding recordings you have not exported.

**Sharing your voice with everyone** is the same zip. Unzip it and the clips are
named exactly as the repo expects, so you can refine any of them in an audio
editor first. Then either open the studio on a desktop (`npm run record`) and use
*Import a phone export*, or copy the contents of `recorded/` into
`public/audio/recorded/` by hand. Finish with `npm run audio:manifest` and
commit. Note that this publishes your voice to anyone who has the repo.

A note on where recording works: microphones need a secure context, meaning
HTTPS or `localhost`. The deployed site is HTTPS so recording works there. A dev
server reached over your LAN at `http://192.168.x.x` will never open the mic.

## Recording a full set on a desktop

The app needs a spoken clip for each letter's name and sound, plus every word
and number — 123 of them at the moment, and more whenever a word is added. The in-app recorder above will do all of them, but
for a full sitting with a decent microphone the desktop studio is faster: it is
keyboard driven and writes straight into the repo.

There is deliberately **no text-to-speech step**.

Urdu writing omits short vowels, so a synthesiser has to guess them. Neural
voices mostly cope; rule-based ones do not. For an app whose whole job is
teaching a child how letters sound, a confident mispronunciation is worse than
silence — and TTS is weakest at exactly the thing this app needs most, isolated
letter sounds. So the clips are recorded by a person.

```sh
npm run record        # http://localhost:5174
```

The studio shows each prompt in Nastaliq — rendered from the same baked
outlines the game uses, so you read exactly what the child will see — and
writes takes straight into `public/audio/recorded/`. It is keyboard driven,
because that many clips with a mouse is not a workflow:

| key | |
|---|---|
| <kbd>Space</kbd> | start / stop recording |
| <kbd>Enter</kbd> | save and jump to the next unrecorded clip |
| <kbd>P</kbd> | play back |
| <kbd>R</kbd> | discard and redo |
| <kbd>←</kbd> <kbd>→</kbd> | move between clips |

Already-recorded clips are marked, so it can be done across several sittings.
When you stop:

```sh
npm run audio:manifest
```

Two things worth knowing before you start:

- **A letter's name and its sound are different clips.** ب is called `بے` but
  makes the sound `b`. The studio prompts for them in separate batches; both
  are taught in the app.
- **Missing clips are silent, never broken.** The app stays fully playable at
  any point in the backlog, so there is no need to finish in one go.

Clips resolve in one order, everywhere:

```
recorded on this device  →  public/audio/recorded/  →  public/audio/tts/  →  silence
```

Your own recording always wins, and a hand recording always beats a generated
one — so if a generator is ever added, nothing already recorded is affected.

## Deploying

`.github/workflows/deploy.yml` builds the app and publishes it to GitHub Pages
on every push. It requires one repository setting, and will appear to do
nothing until it is set:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

If Pages is left on "Deploy from a branch" it serves the repository source
directly, and the app cannot start: `index.html` loads `/src/main.js`, which
imports `phaser` as a bare module specifier that no browser can resolve without
a bundler. The site will show "The game could not load" with the failing URL.

To check a production build locally the way Pages will serve it, from a project
subpath rather than a domain root:

```sh
npm run build
npx vite preview --base /Urdu-Learning-Games/
```

## What makes Urdu different

Most of this project is generic preschool game code. Three things are not, and
they are the reason an English alphabet app cannot simply be reskinned:

**Letters change shape depending on where they sit in a word.** ب is written
`ب` alone, `بـ` at the start, `ـبـ` in the middle and `ـب` at the end. Teaching
only the isolated form teaches a letter a child will not recognise in a book.
Every letter screen shows all the forms.

**Not every letter has four forms.** Ten letters (`ا د ڈ ذ ر ڑ ز ژ و ے`) join
only to their right, so they have two. Hamza `ء` joins to nothing and has one.
This is encoded per letter and the tests enforce it.

**Some letters never begin a word.** `ڑ`, `ھ` and `ی` cannot start one, so their
example words teach them mid-word (`گاڑی`, `بھالو`, `چابی`). Content carries the
letter's position within the word rather than assuming zero.

## How Urdu is rendered

No Urdu text in this app is rendered as text. All of it is baked to outline
paths at build time and drawn as geometry.

Game engines render text by calling canvas `fillText` and uploading the result
as a texture. For Nastaliq that is unreliable: output depends on the platform
shaper, it races font loading, and it gives back pixels when the tracing game
needs geometry.

Instead `tools/bake-glyphs.mjs` runs HarfBuzz over Noto Nastaliq Urdu once and
writes every glyph the app needs to `content/glyphs.json` as SVG path data.
At runtime `src/lib/glyph.js` rasterises those paths with `Path2D`. The whole
inventory is ~220 KB, renders identically on every device, and doubles as the
hit-test geometry for tracing.

Positional forms are extracted with the zero-width-joiner trick: shaping
`ب` + ZWJ yields the initial form, ZWJ + `ب` + ZWJ the medial, and so on. Words
are shaped whole, because Nastaliq applies contextual substitution across an
entire word and one assembled from separate letters is not readable Urdu.

Run `node tools/preview-glyphs.mjs` to render a contact sheet of every baked
glyph. Look at it after changing the baker — the tests can tell you a glyph
exists, but only your eyes can tell you it is correct Nastaliq.

## Layout of the repo

```
content/          all the teaching material, as JSON. Edit this, not code.
  letters.json      38 letters: names, sounds, joining behaviour, shape families
  numbers.json      Urdu digits ۰-۹
  words.json        first words, with the picture and the letter position
  orderings.json    qaida order and shape-family order
  ui.json           Urdu strings shown in menus
  glyphs.json       GENERATED by npm run bake. Do not hand-edit.
  audio.json        GENERATED by npm run audio:manifest. Do not hand-edit.
public/audio/
  recorded/         spoken clips. These win over anything generated.
  tts/              generated clips, if a generator is ever added.
public/icons/       GENERATED by npm run icons, from the baked Nastaliq.
public/images/words/ GENERATED by npm run images. Committed; see below.
src/
  main.js           Phaser config and scene registration
  scenes/           one file per screen
  lib/              glyph rendering, audio, music, particles, content, theme
tools/              build, recording and verification scripts
tests/              content and audio integrity checks
```

## Roadmap

1. ~~Glyph pipeline and Flashcards~~ done
2. ~~Audio: recording studio, playback, override chain~~ done
3. ~~Find the letter, using shape-family siblings as distractors~~ done
4. ~~Balloon pop~~ done
5. ~~Letter tracing~~ done (from the baked outlines; no stroke editor needed)
6. ~~Numbers and words as their own games~~ done
7. ~~Installable, offline PWA, parental gate~~ done
8. ~~Deploy to GitHub Pages~~ done
9. ~~Record inside the app, stored per-device, with export and import~~ done
10. ~~Background music, particles and animation~~ done

## Contributing

Adding a letter, a word, a translation or a recording needs no JavaScript. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

Code and content are MIT. Glyph outlines in `content/glyphs.json` are derived
from Noto Nastaliq Urdu and remain under the SIL Open Font License 1.1. See
[LICENSE](LICENSE).
