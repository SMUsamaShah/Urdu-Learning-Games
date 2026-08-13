# RV AppStudios screenshots, for reference

Screen captures from RV AppStudios' *Lucas & Friends* learning apps, kept as a
design reference. This app is aimed at the same audience — a three-year-old and
the parent holding the phone — and those apps are the standard it is measured
against.

They are here rather than in a chat thread because decisions get made from them
weeks apart, and a reference nobody can find is one that stops being used.

## What is in them

| Files | What they show |
|---|---|
| `settings-*.jpg` | The parent-facing settings screen. |
| `main-screen.jpg`, `game-list-*.jpg` | How the activities are presented. |
| `activity-*.jpg`, `game*.jpg` | Individual activities. |

## What was taken from them

**The settings screen** (`src/ui/settings.js`) follows `settings-02.jpg` and
`settings-03.jpg` closely, because they are a good example of a pattern worth
copying rather than reinventing:

- One scrolling list of plain rows under quiet group headings.
- A row is a label plus one of: a switch, a value and a chevron, or a chevron.
- No icons and no explanatory paragraph per row. A settings list where every
  row explains itself is one nobody reads.
- Anything larger than a switch is its own page, reached and left by one arrow
  (`settings-01.jpg`, `settings-04.jpg`).

Earlier work took the "target and its replay button always in the same corner"
idea from the activity screens — see the note in `src/scenes/Balloons.js`.

## Copyright

These are screenshots of somebody else's application. They are **not** covered
by this repository's MIT licence, they are not redistributed as part of the
built app, and nothing here is copied asset-for-asset — what is taken is
layout and interaction convention, which is the part worth learning from.

They live outside `public/`, so Vite never bundles them and the service worker
never caches them. They add nothing to what a user downloads.
