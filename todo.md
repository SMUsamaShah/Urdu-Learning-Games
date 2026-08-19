# To do

Small, concrete things worth fixing. Bigger ideas that are not scheduled live in
[future-plans.md](future-plans.md); this list is meant to be worked off.

## Content

### آ is missing

The alphabet has 38 letters and none of them is **alif madd**. ا is there; آ is
not, and it is the first letter of آم, آنکھ, آگ — words a three-year-old already
says. It is a letter in its own right in every Urdu qaida, not a diacritic to be
skipped.

Adding it means an entry in `content/letters.json` with its own `shapeFamily`
(it shares alif's body and adds the madd above), a word and a picture for it,
`npm run bake` for the outlines, and a pass through the seeder and the tracing
editor. Nothing in the code assumes 38 — `letters.length` is read everywhere it
matters — but the count appears in a few comments and in the Settings row, so
those want a look.

### Numbers only go to nine

`content/numbers.json` holds ۰–۹ and nothing else, so every counting screen —
`Numbers`, `NumberLine`, the counting games — teaches ten numerals and stops.
Urdu names every number to a hundred separately and irregularly (اکیس, بائیس,
تیئس …), so 11–99 have to be authored rather than generated from tens and
units; ہزار and لاکھ come after them, and لاکھ is worth having because it is the
unit Urdu actually counts large things in.

`npm run bake` renders the multi-digit forms once the JSON is there. Settings
wants a **Numbers up to: 10 / 20 / 100** band defaulting to 10, or a
three-year-old meets ninety-nine in a matching game. It adds 93 clips to the
recorder's list, optional like every other clip.

### Nothing can be switched off

Every letter, word and number in `content/` appears in every game that can use
it. A child working on the first ten letters still meets ژ, and a parent has no
way to narrow what the app teaches this week.

What it needs: `src/lib/enabled.js` holding a set of disabled ids in
localStorage with a change event; filtered views in `content.js`
(`activeLetters()`, `activeWords()`, `activeNumbers()`) that `sequenceFor()`,
`shapeFamilySiblings()` and `wordForLetter()` respect, so a generated sequence
can never contain something switched off; and three list pages in Settings with
a switch per item. Two rules keep it safe — glyph *sizing* keeps using the full
set, or letters would change size when a parent disables one, and a game falls
back to the full set rather than breaking if fewer than two items remain.

### The Letters screen does not show where the letter is in its word

On the Letters screen the taught letter, its positional forms and the word it
teaches are all drawn in the same ink, so nothing connects them. Colouring the
hero letter and its matching form box in one accent, and colouring the same
letter inside the word, would show a child *where* the letter they are looking
at turns up.

The word is the hard half. AlQalam Taj Nastaliq fuses joined letters into single
outlines: shaping all 37 words through HarfBuzz, the taught letter has its own
separable glyph in only **10** of them (پتنگ is one glyph for all four letters).
So `tools/bake-glyphs.mjs` needs to keep the `infos[i].cluster` it currently
throws away — baked per word as `clusters: [{from, to, d}]` — and the word is
coloured only where the cluster is exactly the taught letter, plain ink
otherwise.

### Most tile pictures do not show their game

Only **Balloons**, **Pairs** and **More games** have a picture that says what
the tile does. The rest are decorative: a goat for "starts with", an open book
for words, a crayon for writing, a stack of cards for letters, a star for
shapes, a magnifying glass over coloured dots for find-the-letter. A child who
cannot read the label has nothing to go on, which is most of the point of a
picture on a tile.

They want redrawing literally — the picture should be a small scene of the game
being played, not an object loosely associated with it. `npm run tiles`
regenerates them from the briefs in `tools/make-tile-art.mjs`; the work is
mostly in the briefs.

## The tracing editor

### The tracer's sliders need a scroll on a phone

The **Trace it again** panel sits in the side column, which drops below the
board on a narrow screen. The Copy-from control had the same problem and was
moved into the pinned row; four sliders will not fit there, so this needs
somewhere else to go — a sheet over the board, or the panel hoisted above it on
narrow screens.

Only worth doing if the tracing is actually being done on the tablet rather than
at a computer.

## Language

### The Urdu I wrote has not been read by a native speaker

The instruction ribbons and tile names were written by me and are the least
trustworthy text in the app. The three I am least sure of:

- **اس سے شروع** — "starts with this"
- **چھپن چھپائی** — hide and seek
- **لکیر پر چلو** — "follow the line"

They are grammatical as far as I can tell; whether they are what somebody would
actually say to a child is a different question.
