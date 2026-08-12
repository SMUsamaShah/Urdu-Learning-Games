Instrument samples for the background tune.

Source: https://github.com/gleitz/midi-js-soundfonts (MIT), generated from
the FluidR3_GM soundfont (MIT). Redistributed here under those terms.

Regenerate with: node tools/fetch-instruments.mjs

Only the instrument named in src/lib/music.js is loaded at runtime. The
others are kept so the tune can be auditioned on a different voice without
a network round trip — see npm run music:preview.
