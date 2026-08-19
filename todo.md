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

### The ninety number names want reading

`content/numbers.json` now carries a name for every number to a hundred, plus
ہزار and لاکھ. Ten of them were there before and have been used for months; the
other ninety-three were written in one sitting and nobody has read them. Urdu
composes none of 11–99 from its parts, so each is its own word and each is its
own chance to be wrong — and a wrong one teaches a child the wrong word for a
number.

The ones worth checking first, because they are the ones where usage and
spelling vary most: چھبیس (26), تریسٹھ (63), سڑسٹھ (67), اٹھہتر (78), نوے (90)
and ننانوے (99). The rest are common enough that an error would be a typo rather
than a judgement.

### The Urdu I wrote has not been read by a native speaker

The instruction ribbons and tile names were written by me and are the least
trustworthy text in the app. The three I am least sure of:

- **اس سے شروع** — "starts with this"
- **چھپن چھپائی** — hide and seek
- **لکیر پر چلو** — "follow the line"

They are grammatical as far as I can tell; whether they are what somebody would
actually say to a child is a different question.
