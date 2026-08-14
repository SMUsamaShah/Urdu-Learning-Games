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

The games are drawn at 1280×720 and are held in landscape — the app asks for it
the way a mobile web game does. **The grown-ups screens are the exception**: the
orientation lock is released while Settings is open, because tracing a letter
wants a tall window and a finger.

Never block the view to enforce this. A person holding the phone upright, or
with rotation switched off, must still see the app — letterboxed and small is
fine, a card telling them to rotate is not.
