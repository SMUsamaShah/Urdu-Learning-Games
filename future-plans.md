# Future plans

Ideas worth doing, written down so they are not re-remembered from scratch every
few weeks. Nothing here is committed to or scheduled. Anything actually being
built has a task and a branch instead.

## Rescue phone recordings in the studio

The recording studio now trims silence, softly pushes down room hiss,
removes low rumble, and evens the level. The ambition is larger: take a clip
recorded on a phone in a normal room and make it sound like it was recorded
properly — broadband noise profiled out, room reverb reduced, sibilance tamed,
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

## Make the progress itself a game

The ring in the corner counts, and counting is the least interesting thing it
could do. The number in the middle means something to an adult reading a
dashboard; to a three-year-old it is a shape that changes.

Instead, make the progress *be* something:

- **A climber.** The old typing games had somebody going up a cliff — keep
  getting it right and they keep climbing, get it wrong and they slip back a
  little. The height is the score and nobody has to read a number to know how
  they are doing.
- **A pet.** It gets fed, or gets a treat, every time an answer lands. The
  further you get the more it grows and the fancier it becomes — a creature that
  visibly evolves rather than a bar that visibly fills. A mistake makes it sad,
  or costs it some of what it had.

Both are the same idea: a character whose state *is* the progress, so the reward
is watching something happen to somebody rather than watching a number go up.
There are other shapes this could take — a garden that grows, a tower that gets
built, a journey along a map — and the right one is probably whichever a
three-year-old asks to see again.

### The one decision this forces

**It breaks a rule the app currently keeps.** Nothing here has a fail state: a
wrong answer nudges, keeps the round and lets the child try again, and the
progress total is explicitly not allowed to go down. That is not an accident of
implementation — `tools/verify-progress.mjs` asserts it, and calls it *"the
promise the design is built on and the one a refactor is most likely to break"*.

A climber who slips and a pet who gets sad are both, precisely, a cost for
getting something wrong. That may well be the right trade: a reward that cannot
be lost is a weaker reward, and slipping down a cliff is a gentler kind of
consequence than being told you are wrong. But it is a deliberate change to the
thing the app is most careful about, so it wants deciding on purpose rather than
discovered when a check goes red.

A middle path worth considering first: let the *character* react to a mistake
without the *total* moving. The pet looks disappointed for a second and then
carries on; the climber wobbles but does not drop. That keeps the promise and
still gets the feedback, and it is much easier to take further later than to
take back.

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
