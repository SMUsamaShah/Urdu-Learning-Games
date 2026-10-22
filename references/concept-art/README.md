# Homepage concept art

Original generated concepts selected by the project owner on 20 October 2026.
These are visual references, not screenshots of the implemented app.

| Concept | Direction | Decision |
| --- | --- | --- |
| [05 — Big Play Studio](05-big-play-studio.png) | Warm cream, large pastel tiles, soft toy illustrations | Build this direction |
| [08 — Folk Festival](08-folk-festival.png) | Folk illustration and warm colours | Keep for future exploration |
| [09 — Bold Pop](09-bold-pop.png) | Bold graphics and strong contrast | Keep for future exploration |

## Implementation principles

- Group the Urdu title, character and **چلو** button on the left; put the games on the right.
- Use six large tiles per page, with a single clean rounded surface and generous space around the artwork.
- Keep the warm cream background quiet, with rounded clay trees, bushes and mint hills along the bottom as in Concept 05. Give the pastel tiles enough shadow to stand out from the cream.
- Render the character as a separate transparent image. A dinosaur or another character must be replaceable without regenerating the background.
- Each game tile is one complete generated image, including its pastel background, objects and sculpted Urdu lettering. The lettering must share the illustration's material and lighting.
- Keep the page background and character independent. Reuse layout and interaction components across screens.
- Preserve game enable/disable preferences, ordering, swipe navigation, Chalo, music, fullscreen, offline use and parental settings.
- Book and cabinet concepts were rejected as too restrictive for varied gameplay. Concept 10 repeated the visual noise of the old homepage.

Generated tile lettering is illustrative; check letter forms and dot counts before shipping. The games continue to use correctly shaped baked Urdu glyphs for teaching content.

## Reusable implementation

- `src/lib/studio-layout.js` measures the left column and six-tile grid at the current canvas width.
- `src/lib/studio-ui.js` owns the cream scenery and utility controls. The independent background image is split into left, middle and right regions when drawn, so the corner trees keep their proportions at wide phone ratios while the quiet middle expands.
- `content/studio-tiles.json` maps all 27 games to separate finished images in `public/images/studio-tiles/`. Replacing one image changes only that tile. A future image with its own transparent silhouette can opt into `fit: "contain"` and `radius: 0`.
- `src/lib/image-button.js` supplies uniform image sizing, one clean clipped edge, a silhouette shadow and the shared tap behaviour. It does not compose lettering or objects. Square tile bounds preserve the entire illustration across landscape widths.
- `src/lib/studio-art.js` loads the images and makes tile and Chalo buttons. No additional frame, backing plate or font is drawn over the finished tile.
- `content/characters.json` selects the transparent character used on the home and game screens. Add another character image and change `default` to replace the spider. Optional individual pose images override the default image.
- `public/images/characters/spider.webp` is the independent transparent character image. The character registry and its optional poses remain reusable across screens.
- `public/images/ui/chalo-clay.webp` is the complete orange Chalo button, including raised cream lettering and play symbol, with a transparent exterior. Its rounded body follows the original concept.
- `public/images/backgrounds/home-studio-garden.webp` restores the fuller dimensional greenery from Concept 05. It contains no character or interface elements. The built-in image-generation prompt is recorded in [home-scenery-prompt.json](home-scenery-prompt.json).
- `src/lib/studio-brand.js` renders the separately baked title; teaching glyphs retain their existing typeface.

The owner chose complete generated tiles after reviewing the first composed version: flat glyphs and separate objects did not share a convincing material. Consistency now comes from art direction and the shared image-button component, while each tile can have a bespoke design. The source square images have edge-to-edge pastel backgrounds; the app applies the outer rounded silhouette once.

## Gameplay accuracy

Read the corresponding game scene before generating tile art. Show the actual learning action and check the answer relationships, as well as the letter shapes and dots.

- **LetterPuzzle:** fragments of one letter fit back together. Do not put a complete letter on every puzzle piece. The shape guide in `letter-puzzle-shape-guide.png` was made from the app's real isolated ب glyph, cut into three vertical strips like the game.
- **Memory:** a revealed letter matches a word picture beginning with that letter, such as ب and a goat (بکری). Two identical pictures describe a different game.
- **ConnectPairs:** connect right-column letters to their matching left-column pictures, such as ب → goat and ا → grapes (انگور). Do not connect duplicate letters.
- **Baskets:** sort similar-looking letters from one shape family, such as ب and ت, into baskets labelled with the matching letters. The game does not sort fruit.

The four corrected tiles remain complete generated images with the original pastel backgrounds and sculpted clay material. Gameplay, ordering, navigation and the separate character are unchanged.

The full-tile generation prompts and lettering corrections are kept in [full-tile-prompts.json](full-tile-prompts.json). Earlier transparent-object prompts remain in [asset-prompts.json](asset-prompts.json) as design history.
