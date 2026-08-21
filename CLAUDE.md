# Working on this repo

Standing decisions that outlive any one task. Everything else — how the glyph
pipeline works, why there is no text-to-speech, what each verifier covers — is
in `README.md` and `CONTRIBUTING.md`.

## The target is Android and desktop

**Do not spend effort on iOS or WebKit.** No iPhone or iPad is in use here. That
means:

- No Safari-only workarounds, polyfills or fallback paths written on spec.
- No hedging behaviour with "on iOS this instead…" in comments or in replies.
- No verification effort aimed at Safari-only code paths, and no apologising for
  not having a WebKit build to test against.

This is not a claim that iOS does not matter. It is a claim about *now*: if this
goes public and an iPhone user reports something, that report is when to look at
it, with a real symptom instead of a guess. Guessing at a browser nobody here
runs produces code that is untested in both directions.

Where a thing happens to be correct on every browser, keep it and say why
without naming a platform. `touch-action` on a wrapper element rather than on an
`<svg>` is right regardless; it does not need a sentence about WebKit to justify
it.

## Which way up

**Landscape, always, on every screen — Settings included.** The app behaves like
a video game: it opens sideways and stays sideways, and the phone is what turns.
Either way round works, and turning the phone over rotates the picture with it.

Three things follow, and none of them is negotiable:

- **No portrait mode.** Settings used to release the lock so the tracing editor
  could have a tall window. It does not any more. If the editor is awkward in a
  short wide window that is a layout problem to solve in landscape.
- **No letterboxing.** The canvas is cut to the screen's own shape rather than
  to a fixed 16:9, so there are no bands down the sides of a 20:9 phone. The
  design height is fixed at 720 and the width is measured at startup, before any
  scene is imported — see `src/main.js`, which explains why the ordering is the
  whole trick.
- **No card telling anybody to rotate.** That part of the old rule survives.
  Where the phone refuses to turn, `src/lib/turn.js` rotates the app across the
  screen instead and it is held sideways to read. Nothing is ever blocked to
  enforce a preference; the app just arrives the right way up.

What was here before said "letterboxed and small is fine". It is not, and that
is why all of the above exists.
