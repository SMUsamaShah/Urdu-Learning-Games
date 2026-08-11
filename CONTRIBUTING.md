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

Not wired up yet. When it is, recordings will drop into
`assets/audio/recorded/` and override the generated ones file by file, with no
code change. Each letter needs three separate clips, and they are genuinely
different things:

- **name** — what the letter is called (`بے`)
- **sound** — the phoneme it makes (`b`)
- **word** — the example word

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
npm run bake     # if you touched anything in content/
npm test
```

If you changed the glyph baker, also run `node tools/preview-glyphs.mjs` and
actually look at the output. The tests verify that glyphs exist and differ from
each other; they cannot tell you the Nastaliq is right.

## Reporting an error in the content

Corrections to letter names, sounds, joining behaviour, shape families or word
choices are very welcome, especially from native speakers and from people
teaching Urdu to children. Open an issue describing what is wrong and what it
should be. You do not need to send a patch.
