# Future plans

Ideas worth doing, written down so they are not re-remembered from scratch every
few weeks. Nothing here is committed to or scheduled. Anything actually being
built has a task and a branch instead.

## Rescue phone recordings in the studio

The recording studio already trims silence and evens the level. The ambition is
larger: take a clip recorded on a phone in a normal room and make it sound like
it was recorded properly — noise removed, room reverb reduced, sibilance tamed,
level and tone matched across every clip so a hundred and twenty of them sound
like one person in one session rather than a hundred and twenty separate
attempts.

This matters more than it sounds. The voice is the one asset that cannot be
generated, so it will always be recorded by whoever is nearest, in whatever room
they are in, and the difference between clips is what makes an app sound
amateur.

## Tracing joined letters, not only isolated ones

Guided tracing currently covers the 38 isolated forms. A child who can write
ب and ی still cannot write بی, and joining is most of what writing Urdu is.
The pipeline already bakes every positional form and every word as outlines, so
the seeder and the studio need no new geometry — what they need is stroke paths
across a join, and an opinion about whether a joined pair is written as one
continuous stroke (it usually is).

## More combinations and more words

More two- and three-letter combinations to read and trace, and more words behind
them. Each word needs a picture and a recording, which is what makes this a
steady drip rather than a batch.

## Make the progress itself a game — built, and given a room of its own

Done. Progress has two hundred pixels down the left of every game screen —
opaque, no scenery behind it — and what stands in it is a swappable module in
`src/lib/indicators/`. Three so far: a plant that grows from a seed to a
fruiting tree, a bar that fills, a glass of juice. One right answer is one pour,
a full one is a level, and Settings chooses which. The ring and its Urdu numeral
are gone.

The decision this section used to say needed making has been made. A wrong
answer now costs two pours against the one a right answer earns and is allowed
to cross back a level, taking a finished tree out of the row; only the floor at
zero survives of the old "nothing is ever taken away" rule.
`tools/verify-progress.mjs` now asserts the reverse of what it used to, and says
so where it does. It is still not a fail state — nothing locks, no round ends,
and whatever is in the rail dips for a second rather than telling anybody off.

What is left in this idea:

- **The shelf stops at twelve trees.** After that a child who has played for a
  month sees exactly what they saw a fortnight in, which is the same flattening
  the ring had and the reason the ring was replaced. Options: a shelf that
  scrolls, trees that mature into bigger ones, or a second garden once the first
  is full.
- **More indicators.** The rail exists so that this list can grow: a climber
  going up a cliff, a character who falls back a step on a wrong answer, a tower
  being built, a pet that evolves. One module in `src/lib/indicators/`, one
  `create(scene, box)`, and Settings picks it up on its own.
- **The seed is chosen for you.** Six kinds cycle by level. Letting a child pick
  the next seed is a decision they would enjoy making and the point at which the
  garden becomes a thing they own rather than a thing they watch.

## Game controller support

This may well be opened in a browser on a smart TV, and a TV that has games on
it usually has a controller paired already. A child who cannot yet aim at a
tablet can absolutely press a big button on a pad.

What that needs:

- **A visible selection.** Everything the app does today is a direct tap, so
  nothing is ever "the current thing". Every screen would need a highlighted
  target and a sensible order to move through, drawn boldly enough to read from
  across a room.
- **Gamepad API polling**, mapped so the stick or d-pad moves the highlight and
  one button confirms — the same two verbs everywhere, no per-game controls.
- **Honesty about what cannot be played.** Tracing and colouring are a finger on
  a path; there is no controller version of them worth having. Those should show
  as unavailable rather than opening into something that cannot be finished, and
  they should say why.

Worth checking on the TV before building any of it: a browser there may report a
pad the child cannot actually use, and TV browsers vary far more than phone ones.
