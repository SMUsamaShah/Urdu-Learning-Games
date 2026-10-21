# Brand lettering

`baloo-bhaijaan-2.ttf` is Baloo Bhaijaan 2 from the [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/baloobhaijaan2), distributed under the included SIL Open Font License.

The downloaded font's Git blob SHA is `153e138c83079da5eb374f8de4637d1c0df5f2a4`. `tools/bake-branding.mjs` shapes only **اردو کھیل** and **چلو** at weight 800 into `content/brand-glyphs.json`. The font is a build input and is not downloaded by the app.

The teaching alphabet, numbers and words keep their existing fonts and shaping pipeline. Run `npm run bake` after changing either set of outlines.
