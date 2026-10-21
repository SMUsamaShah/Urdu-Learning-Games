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
- Keep the warm cream background quiet. Small mint shapes can sit at the bottom edge.
- Render the character as a separate transparent image. A dinosaur or another character must be replaceable without regenerating the background.
- Keep the background, character, buttons, tile surfaces, artwork and Urdu glyphs independent. Reuse components across screens.
- Preserve game enable/disable preferences, ordering, swipe navigation, Chalo, music, fullscreen, offline use and parental settings.
- Book and cabinet concepts were rejected as too restrictive for varied gameplay. Concept 10 repeated the visual noise of the old homepage.

Generated lettering is illustrative only. The app uses its baked, correctly shaped Urdu glyphs for real interface text and teaching content.

## Reusable implementation

- `src/lib/studio-layout.js` measures the left column and six-tile grid at the current canvas width.
- `src/lib/studio-ui.js` owns the cream scenery, rounded surfaces and utility icons. These are drawn components, not full-screen bitmaps.
- `src/lib/studio-art.js` composes transparent toy objects with the app's real Urdu glyphs. Every game has a distinct illustration and shares the tile surface.
- `content/characters.json` selects the transparent character used on the home and game screens. Add another character image and change `default` to replace the spider. Optional individual pose images override the default image.
- `public/images/characters/spider.webp` is the independent character image; `public/images/studio/` contains the seven reusable toy illustrations. The image-generation tool created the transparent source art from concept 05. The app versions retain alpha and are resized to WebP for loading speed.
- `src/lib/studio-brand.js` renders separately baked bold Urdu wordmarks; teaching glyphs retain their existing typeface.

The chosen approach is a shared tile surface plus freely composed content. A future bespoke complete tile can have its own painter without changing the menu, layout or navigation. Do not add another frame around finished artwork.

The exact generation prompts for these assets are kept in [asset-prompts.json](asset-prompts.json).
