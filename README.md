# اردو کھیل — Urdu Learning Games

Free, open source, ad-free games for teaching young children the Urdu alphabet,
numbers and first words. Runs in a browser, installs to a phone home screen, and
works offline.

There are excellent preschool alphabet apps for English. There is nothing
comparable for Urdu. This is an attempt at one.

**No ads. No in-app purchases. No tracking. No network calls at runtime.**

## Status

Early. What works today:

- **Flashcards** — every letter, all of its positional forms, and its word.
- **Audio system** — plays a letter's name, its sound and its word, with a
  recording studio for capturing them. Ships with no voice recordings yet, so
  the app is currently silent. See [Recording the voice](#recording-the-voice).

Planned, in order: listen-and-tap, balloon pop, tracing, numbers and words as
their own games. See [the roadmap](#roadmap).

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

## Recording the voice

The app needs 120 spoken clips: a name and a sound for each of the 38 letters,
plus every word and number. There is deliberately **no text-to-speech step**.

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
because 120 clips with a mouse is not a workflow:

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

Dropping a file into `public/audio/recorded/` always beats one in
`public/audio/tts/`, so if a generator is ever added, hand recordings still win
with no code change.

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
src/
  main.js           Phaser config and scene registration
  scenes/           one file per screen
  lib/              glyph rendering, audio, procedural sfx, content, theme
tools/              build, recording and verification scripts
tests/              content and audio integrity checks
```

## Roadmap

1. ~~Glyph pipeline and Flashcards~~ done
2. ~~Audio: recording studio, playback, override chain~~ done
3. Listen-and-tap, using shape-family siblings as distractors
4. Balloon pop
5. Stroke editor, then tracing
6. Numbers and words as their own games
7. PWA install, parental gate, offline
8. ~~Deploy to GitHub Pages~~ done

## Contributing

Adding a letter, a word, a translation or a recording needs no JavaScript. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

Code and content are MIT. Glyph outlines in `content/glyphs.json` are derived
from Noto Nastaliq Urdu and remain under the SIL Open Font License 1.1. See
[LICENSE](LICENSE).
